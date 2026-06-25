"use client";

/**
 * Attendance hub. Adapts to the caller's role:
 *  - Anyone with an employee profile sees a personal GPS check-in / check-out card.
 *  - companyAdmin / hr / secretary / branchManager see today's attendance table.
 *  - companyAdmin can edit the work schedule, set branch GPS, and create
 *    employee logins; hr can create logins and view reports.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface AttRecord {
  id: string;
  employeeId: string;
  branchId?: string;
  status: string;
  lateMinutes?: number;
  workedMinutes?: number | null;
  checkInAt?: any;
  checkOutAt?: any;
}
interface Employee { id: string; fullName: string; branchId?: string; hasLogin?: boolean; }
interface Branch { id: string; name: string; location?: { lat: number; lng: number }; }

const STATUS_PILL: Record<string, string> = { present: "pill-green", late: "pill-amber", absent: "pill-red" };

function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

function todayId(employeeId: string) {
  // Mirror the server's local-date key well enough for a client read.
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${employeeId}_${date}`;
}

export default function AttendancePage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, role, tenantId } = useAuth();
  const ar = locale === "ar";
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [claimsChecked, setClaimsChecked] = useState(false);

  const isManager = role === "companyAdmin" || role === "hr" || role === "secretary" || role === "branchManager";
  const isAdmin = role === "companyAdmin";
  const canCreateLogin = role === "companyAdmin" || role === "hr";

  const [records, setRecords] = useState<AttRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [myToday, setMyToday] = useState<AttRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [error, setError] = useState("");

  // Config form (admin)
  const [cfg, setCfg] = useState({ workStart: "09:00", workEnd: "17:00", lateAfterMinutes: 15, geofenceRadius: 150, workDays: [0, 1, 2, 3, 4] as number[] });
  // Branch location form
  const [locForm, setLocForm] = useState({ branchId: "", lat: "", lng: "", radius: "" });
  // Employee login form
  const [loginForm, setLoginForm] = useState({ employeeId: "", email: "", password: "" });
  // Monthly report form
  const [reportForm, setReportForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [reportData, setReportData] = useState<any>(null);
  // Employee locations
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedBranchForMap, setSelectedBranchForMap] = useState("");
  // Manager alerts
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [user, loading, router]);

  // Read employeeId from the auth token claims.
  useEffect(() => {
    if (!user) return;
    user.getIdTokenResult()
      .then((tok) => setMyEmployeeId((tok.claims as any).employeeId ?? null))
      .finally(() => setClaimsChecked(true));
  }, [user]);

  // Manager data: today's records, employees, branches.
  useEffect(() => {
    if (!tenantId || !isManager) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const ur = onSnapshot(
      query(collection(dbClient, "attendance"), where("tenantId", "==", tenantId), where("date", "==", todayStr)),
      (s) => { setRecords(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); setError(""); },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const ue = onSnapshot(
      query(collection(dbClient, "employees"), where("tenantId", "==", tenantId)),
      (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      () => {}
    );
    const ub = onSnapshot(
      query(collection(dbClient, "branches"), where("tenantId", "==", tenantId)),
      (s) => setBranches(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      () => {}
    );
    return () => { ur(); ue(); ub(); };
  }, [tenantId, isManager, t]);

  // Load existing config for admin form.
  useEffect(() => {
    if (!tenantId || !isAdmin) return;
    getDoc(doc(dbClient, "tenants", tenantId)).then((snap) => {
      const c = snap.exists() ? (snap.data() as any).attendanceConfig : null;
      if (c) setCfg({ ...cfg, ...c });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, isAdmin]);

  // My today's record (employee self).
  useEffect(() => {
    if (!tenantId || !myEmployeeId) return;
    return onSnapshot(
      doc(dbClient, "attendance", todayId(myEmployeeId)),
      (snap) => setMyToday(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null),
      () => {}
    );
  }, [tenantId, myEmployeeId]);

  function flash(ok: boolean, text: string) { setMsgOk(ok); setMsg(text); }

  async function doCheckIn() {
    setBusy(true); setMsg("");
    try {
      flash(true, t("attendance.locating"));
      const loc = await getLocation();
      const res: any = await call("checkIn", loc);
      flash(true, `✓ ${res.status === "late" ? t("attendance.late") : t("attendance.present")}${res.lateMinutes ? ` (${t("attendance.lateBy")} ${res.lateMinutes} ${t("attendance.minutes")})` : ""}`);
    } catch (err: any) {
      flash(false, err?.code === 1 || err?.code === "PERMISSION_DENIED"
        ? t("attendance.locationDenied")
        : `${t("common.error")}: ${err.message || err}`);
    } finally { setBusy(false); }
  }

  async function doCheckOut() {
    setBusy(true); setMsg("");
    try {
      let loc: any = {};
      try { loc = await getLocation(); } catch { /* checkout location optional */ }
      const res: any = await call("checkOut", loc);
      const h = Math.floor((res.workedMinutes || 0) / 60), m = (res.workedMinutes || 0) % 60;
      flash(true, `✓ ${t("attendance.worked")}: ${h}h ${m}m`);
    } catch (err: any) {
      flash(false, `${t("common.error")}: ${err.message || err}`);
    } finally { setBusy(false); }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await call("setAttendanceConfig", cfg); flash(true, t("attendance.saveConfig") + " ✓"); }
    catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function useMyLocationForBranch() {
    try {
      const loc = await getLocation();
      setLocForm({ ...locForm, lat: String(loc.lat), lng: String(loc.lng) });
    } catch { flash(false, t("attendance.locationDenied")); }
  }

  async function saveBranchLocation(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await call("setBranchLocation", {
        branchId: locForm.branchId, lat: Number(locForm.lat), lng: Number(locForm.lng),
        ...(locForm.radius && { radius: Number(locForm.radius) }),
      });
      flash(true, t("attendance.saveLocation") + " ✓");
      setLocForm({ branchId: "", lat: "", lng: "", radius: "" });
    } catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function createLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await call("createEmployeeLogin", loginForm);
      flash(true, t("attendance.create") + " ✓");
      setLoginForm({ employeeId: "", email: "", password: "" });
    } catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function loadMonthlyReport() {
    setBusy(true); setMsg("");
    try {
      const data = await call("getMonthlyReport", reportForm);
      setReportData(data);
      flash(true, t("attendance.report") + " ✓");
    } catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function loadEmployeeLocations() {
    setBusy(true); setMsg("");
    try {
      const res = await call("getEmployeeLocations", { branchId: selectedBranchForMap || null });
      setLocations(res.locations);
      flash(true, t("attendance.liveLocations") + " ✓");
    } catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function downloadExcel() {
    setBusy(true); setMsg("");
    try {
      const res = await call("exportAttendanceExcel", reportForm);
      if (res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        flash(true, t("attendance.downloadReport") + " ✓");
      }
    } catch (err: any) { flash(false, `${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  if (loading) return null;

  const empName = (id: string) => employees.find((e) => e.id === id)?.fullName || id.slice(0, 6);
  const fmtTime = (ts: any) => ts?.toDate?.().toLocaleTimeString(ar ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" }) || "—";
  const dayNames = ar ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
                      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="container">
      <header style={{ marginBottom: 8 }}>
        <h1>{t("attendance.title")}</h1>
      </header>

      {error && <div style={{ color: "#991b1b", margin: "16px 0", padding: 12, background: "#fee2e2", borderRadius: 10 }}>{error}</div>}

      {/* ───────── PERSONAL CHECK-IN CARD (anyone with a profile) ───────── */}
      {myEmployeeId && (
        <section className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            {new Date().toLocaleDateString(ar ? "ar-EG" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
          </div>

          {myToday?.checkInAt ? (
            <div style={{ margin: "16px 0" }}>
              <span className={`pill ${STATUS_PILL[myToday.status] || "pill-gray"}`} style={{ fontSize: "0.95rem" }}>
                {t(`attendance.${myToday.status}`)}
              </span>
              <p style={{ marginTop: 10, color: "var(--muted)" }}>
                {t("attendance.checkedInAt")} <strong>{fmtTime(myToday.checkInAt)}</strong>
                {myToday.checkOutAt && <> · {t("attendance.checkedOutAt")} <strong>{fmtTime(myToday.checkOutAt)}</strong></>}
              </p>
            </div>
          ) : (
            <p style={{ margin: "16px 0", color: "var(--muted)" }}>{t("attendance.notCheckedIn")}</p>
          )}

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {!myToday?.checkInAt && (
              <button className="btn" disabled={busy} onClick={doCheckIn} style={{ padding: "12px 32px", fontSize: "1.05rem" }}>
                🟢 {t("attendance.checkIn")}
              </button>
            )}
            {myToday?.checkInAt && !myToday?.checkOutAt && (
              <button className="btn" disabled={busy} onClick={doCheckOut} style={{ padding: "12px 32px", fontSize: "1.05rem" }}>
                🔴 {t("attendance.checkOut")}
              </button>
            )}
          </div>
          {msg && <p style={{ marginTop: 14, fontWeight: 600, color: msgOk ? "#166534" : "#991b1b" }}>{msg}</p>}
        </section>
      )}

      {/* ───────── NO-ACCESS FALLBACK (no employee profile & not a manager) ───────── */}
      {claimsChecked && !myEmployeeId && !isManager && (
        <section className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: "2rem" }}>🪪</div>
          <h2 style={{ marginTop: 8 }}>{t("attendance.noAccess")}</h2>
          <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: 520, margin: "8px auto 0" }}>
            {t("attendance.noAccessHint")}
          </p>
        </section>
      )}

      {/* ───────── TODAY'S ATTENDANCE (managers / hr) ───────── */}
      {isManager && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.today")}</h2>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>{t("attendance.name")}</th>
                  <th>{t("attendance.status")}</th>
                  <th>{t("attendance.checkInTime")}</th>
                  <th>{t("attendance.checkOutTime")}</th>
                  <th>{t("attendance.worked")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{empName(r.employeeId)}</td>
                    <td><span className={`pill ${STATUS_PILL[r.status] || "pill-gray"}`}>{t(`attendance.${r.status}`)}</span></td>
                    <td>{fmtTime(r.checkInAt)}</td>
                    <td>{fmtTime(r.checkOutAt)}</td>
                    <td>{r.workedMinutes != null ? `${Math.floor(r.workedMinutes / 60)}h ${r.workedMinutes % 60}m` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>{t("attendance.noRecords")}</p>}
        </section>
      )}

      {/* ───────── EMPLOYEE LOGIN CREATION (admin / hr) ───────── */}
      {canCreateLogin && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.createLogin")}</h2>
          <form onSubmit={createLogin} style={{ marginTop: 8 }}>
            <label>{t("attendance.name")}
              <select value={loginForm.employeeId} onChange={(e) => setLoginForm({ ...loginForm, employeeId: e.target.value })} required>
                <option value="">—</option>
                {employees.filter((e) => !e.hasLogin).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select></label>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label>{t("attendance.employeeEmail")}
                <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="employee@company.com" required /></label>
              <label>{t("attendance.employeePassword")}
                <input type="text" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder={ar ? "8 أحرف على الأقل" : "min 8 characters"} minLength={8} required /></label>
            </div>
            <button className="btn" disabled={busy} style={{ marginTop: 18, width: "100%" }}>
              {busy ? t("common.loading") : t("attendance.create")}
            </button>
          </form>
        </section>
      )}

      {/* ───────── BRANCH LOCATION (staff) ───────── */}
      {(role === "companyAdmin" || role === "secretary") && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.branchLocation")}</h2>
          <form onSubmit={saveBranchLocation} style={{ marginTop: 8 }}>
            <label>{t("nav.branches")}
              <select value={locForm.branchId} onChange={(e) => setLocForm({ ...locForm, branchId: e.target.value })} required>
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.location ? " 📍" : ""}</option>)}
              </select></label>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <label>Lat
                <input value={locForm.lat} onChange={(e) => setLocForm({ ...locForm, lat: e.target.value })} placeholder="30.0444" required /></label>
              <label>Lng
                <input value={locForm.lng} onChange={(e) => setLocForm({ ...locForm, lng: e.target.value })} placeholder="31.2357" required /></label>
              <label>{t("attendance.geofenceRadius")}
                <input value={locForm.radius} onChange={(e) => setLocForm({ ...locForm, radius: e.target.value })} placeholder="150" /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-outline" onClick={useMyLocationForBranch}>📍 {t("attendance.useMyLocation")}</button>
              <button className="btn" disabled={busy} style={{ flex: 1 }}>{t("attendance.saveLocation")}</button>
            </div>
          </form>
        </section>
      )}

      {/* ───────── WORK SCHEDULE CONFIG (admin only) ───────── */}
      {isAdmin && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.config")}</h2>
          <form onSubmit={saveConfig} style={{ marginTop: 8 }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label>{t("attendance.workStart")}
                <input type="time" value={cfg.workStart} onChange={(e) => setCfg({ ...cfg, workStart: e.target.value })} /></label>
              <label>{t("attendance.workEnd")}
                <input type="time" value={cfg.workEnd} onChange={(e) => setCfg({ ...cfg, workEnd: e.target.value })} /></label>
              <label>{t("attendance.lateAfter")}
                <input type="number" min={0} value={cfg.lateAfterMinutes} onChange={(e) => setCfg({ ...cfg, lateAfterMinutes: Number(e.target.value) })} /></label>
              <label>{t("attendance.geofenceRadius")}
                <input type="number" min={20} value={cfg.geofenceRadius} onChange={(e) => setCfg({ ...cfg, geofenceRadius: Number(e.target.value) })} /></label>
            </div>
            <div style={{ marginTop: 16 }}>
              <span style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>{t("attendance.workDays")}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {dayNames.map((name, i) => {
                  const on = cfg.workDays.includes(i);
                  return (
                    <button type="button" key={i}
                      onClick={() => setCfg({ ...cfg, workDays: on ? cfg.workDays.filter((d) => d !== i) : [...cfg.workDays, i] })}
                      style={{
                        padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: "0.85rem",
                        border: `1.5px solid ${on ? "var(--primary)" : "var(--border)"}`,
                        background: on ? "var(--primary)" : "transparent", color: on ? "#fff" : "var(--muted)",
                      }}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className="btn" disabled={busy} style={{ marginTop: 20, width: "100%" }}>
              {busy ? t("common.loading") : t("attendance.saveConfig")}
            </button>
          </form>
        </section>
      )}

      {/* ───────── MONTHLY REPORT (staff) ───────── */}
      {isManager && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.monthlyReport")}</h2>
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ flex: "0 0 auto" }}>
              {t("attendance.selectMonth")}
              <input
                type="month"
                value={`${reportForm.year}-${String(reportForm.month).padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-");
                  setReportForm({ year: Number(y), month: Number(m) });
                }}
              />
            </label>
            <button className="btn" disabled={busy} onClick={loadMonthlyReport}>
              {t("attendance.report")}
            </button>
            <button className="btn btn-outline" disabled={busy} onClick={downloadExcel} style={{ flex: "0 0 auto" }}>
              📊 {t("attendance.exportExcel")}
            </button>
          </div>

          {reportData && (
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t("attendance.totalEmployees")}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{reportData.totalEmployees}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t("attendance.present")}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#16a34a" }}>{reportData.presentDays}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t("attendance.late")}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#d97706" }}>{reportData.lateDays}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t("attendance.absent")}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#dc2626" }}>{reportData.absentDays}</div>
              </div>
              <div style={{ padding: 12, background: "var(--surface)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t("attendance.avgWorkedHours")}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {(reportData.averageWorkedMinutes / 60).toFixed(1)}h
                </div>
              </div>
            </div>
          )}

          {reportData?.employeeStats && (
            <div style={{ marginTop: 20, overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t("attendance.name")}</th>
                    <th>{t("attendance.present")}</th>
                    <th>{t("attendance.late")}</th>
                    <th>{t("attendance.absent")}</th>
                    <th>{t("attendance.worked")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.employeeStats.map((emp: any) => (
                    <tr key={emp.employeeId}>
                      <td>{emp.fullName}</td>
                      <td style={{ color: "#16a34a", fontWeight: 600 }}>{emp.presentDays}</td>
                      <td style={{ color: "#d97706", fontWeight: 600 }}>{emp.lateDays}</td>
                      <td style={{ color: "#dc2626", fontWeight: 600 }}>{emp.absentDays}</td>
                      <td>{(emp.totalWorkedMinutes / 60).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ───────── EMPLOYEE MAP (staff) ───────── */}
      {isManager && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>{t("attendance.employeeMap")}</h2>
          <div style={{ marginTop: 12, marginBottom: 16 }}>
            <label>
              {t("nav.branches")}
              <select value={selectedBranchForMap} onChange={(e) => setSelectedBranchForMap(e.target.value)}>
                <option value="">{t("common.all")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" disabled={busy} onClick={loadEmployeeLocations} style={{ marginTop: 8 }}>
              {t("attendance.liveLocations")}
            </button>
          </div>

          {locations.length > 0 ? (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t("attendance.name")}</th>
                    <th>GPS</th>
                    <th>{t("attendance.distance")}</th>
                    <th>{t("attendance.status")}</th>
                    <th>{t("attendance.checkInTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc: any) => (
                    <tr key={loc.employeeId}>
                      <td>{loc.fullName}</td>
                      <td style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </td>
                      <td>{loc.distance}m</td>
                      <td>
                        <span className={`pill ${STATUS_PILL[loc.status] || "pill-gray"}`}>
                          {t(`attendance.${loc.status}`)}
                        </span>
                      </td>
                      <td>{fmtTime(loc.checkInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : locations.length === 0 && msg.includes("Locations") ? (
            <p style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>{t("attendance.noLocations")}</p>
          ) : null}
        </section>
      )}

      {isManager && msg && <p style={{ marginTop: 16, textAlign: "center", fontWeight: 600, color: msgOk ? "#166534" : "#991b1b" }}>{msg}</p>}
    </main>
  );
}
