"use client";

/**
 * Branch management.
 *  - Create branches & departments, assign managers.
 *  - Per-branch GPS location capture (from the device) + geofence radius, so
 *    employees can only check in when physically at their branch.
 *  - Per-branch employee management: see who belongs to the branch, move an
 *    employee into it, add a new employee directly into it, or CSV-import.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Branch {
  id: string;
  name: string;
  address?: string;
  managerId?: string | null;
  location?: { lat: number; lng: number } | null;
  geofenceRadius?: number;
}
interface Employee {
  id: string;
  fullName: string;
  branchId?: string | null;
  department?: string;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

export default function BranchesPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId } = useAuth();
  const ar = locale === "ar";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branchForm, setBranchForm] = useState({ name: "", address: "" });
  const [deptName, setDeptName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Per-branch expand + working state
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const [radius, setRadius] = useState<Record<string, number>>({});
  const [capturing, setCapturing] = useState<string | null>(null);
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [newEmp, setNewEmp] = useState({ fullName: "", email: "", phone: "" });

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (!tenantId) return;
    const ub = onSnapshot(
      query(collection(dbClient, "branches"), where("tenantId", "==", tenantId)),
      (s) => { setBranches(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); setError(""); },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const ue = onSnapshot(
      query(collection(dbClient, "employees"), where("tenantId", "==", tenantId)),
      (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const ud = onSnapshot(
      query(collection(dbClient, "departments"), where("tenantId", "==", tenantId)),
      (s) => setDepartments(s.docs.map((d) => ({ id: d.id, name: d.data().name })))
    );
    return () => { ub(); ue(); ud(); };
  }, [tenantId, t]);

  // Auto-expand the first branch that still has no GPS location, so the
  // "use my location" button is immediately visible (one-time).
  useEffect(() => {
    if (autoOpened || branches.length === 0) return;
    const needs = branches.find((b) => !b.location);
    if (needs) { setOpenBranch(needs.id); setAutoOpened(true); }
  }, [branches, autoOpened]);

  async function run(fn: () => Promise<any>, success = "✓") {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(success); }
    catch (err: any) { setMsg(`${t("common.error")}: ${err.message}`); }
    finally { setBusy(false); }
  }

  /** Capture the device's current GPS and save it as this branch's location. */
  function captureLocation(branchId: string) {
    if (!navigator.geolocation) {
      setMsg(ar ? "المتصفح لا يدعم تحديد الموقع" : "Geolocation not supported");
      return;
    }
    setCapturing(branchId); setMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await call("setBranchLocation", {
            branchId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radius: radius[branchId] ?? 150,
          });
          setMsg(t("branch.locationSet"));
        } catch (err: any) {
          setMsg(`${t("common.error")}: ${err.message}`);
        } finally {
          setCapturing(null);
        }
      },
      (err) => {
        setCapturing(null);
        setMsg(ar ? "لازم تسمح بالوصول للموقع" : "Allow location access");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const employeesOf = (branchId: string) => employees.filter((e) => e.branchId === branchId);
  const unassigned = employees.filter((e) => !e.branchId);

  if (loading) return null;

  return (
    <main className="container">
      <h1>{t("nav.branches")}</h1>

      {error && <div style={{ color: "red", marginBottom: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8 }}>{error}</div>}

      {/* How-to banner */}
      <div style={{ marginTop: 16, padding: 14, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: "0.9rem", lineHeight: 1.9 }}>
        {ar ? (
          <>
            <strong>📍 إزاي تضبط موقع الفرع للحضور:</strong><br />
            ١) أنشئ الفرع تحت &nbsp;•&nbsp; ٢) اضغط <strong>«إدارة»</strong> جنب الفرع &nbsp;•&nbsp;
            ٣) <strong>وأنت واقف في مكان الفرع</strong> اضغط <strong>«📍 استخدم موقعي الحالي»</strong> — هيتسجّل GPS تلقائياً.<br />
            بعدها الموظف اللي في الفرع ده زرار الحضور هيشتغل عنده <strong>بس</strong> لما يكون فعلاً داخل النطاق.
          </>
        ) : (
          <>
            <strong>📍 How to set a branch location for attendance:</strong><br />
            1) Create the branch below &nbsp;•&nbsp; 2) Click <strong>“Manage”</strong> on the branch &nbsp;•&nbsp;
            3) <strong>While standing at the branch</strong>, tap <strong>“📍 Use my current location”</strong> — GPS is saved automatically.<br />
            After that, an employee in that branch can only check in when physically inside the radius.
          </>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 24, gap: 24 }}>
        <section className="card">
          <h2>{t("branch.add")}</h2>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await call("createBranch", branchForm); setBranchForm({ name: "", address: "" }); }); }}>
            <label>{t("branch.name")}
              <input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                placeholder={ar ? "مثال: فرع القاهرة" : "e.g., Cairo Branch"} required /></label>
            <label>{t("branch.address")}
              <input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                placeholder={ar ? "العنوان الكامل" : "Full address"} /></label>
            <button className="btn" disabled={busy} style={{ marginTop: 20, width: "100%" }}>{busy ? t("common.loading") : t("branch.add")}</button>
          </form>
        </section>

        <section className="card">
          <h2>{t("department.add")}</h2>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await call("createDepartment", { name: deptName }); setDeptName(""); }); }}>
            <label>{t("nav.departments")}
              <input value={deptName} onChange={(e) => setDeptName(e.target.value)}
                placeholder={ar ? "مثال: قسم التطوير" : "e.g., Development"} required /></label>
            <button className="btn" disabled={busy} style={{ marginTop: 20, width: "100%" }}>{busy ? t("common.loading") : t("department.add")}</button>
          </form>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {departments.map((d) => (
              <span key={d.id} style={{ background: "#f3f4f6", padding: "4px 10px", borderRadius: 20, fontSize: "0.85rem" }}>{d.name}</span>
            ))}
          </div>
        </section>
      </div>

      {msg && <p style={{ marginTop: 16, fontWeight: 600 }}>{msg}</p>}

      <h2 style={{ marginTop: 28 }}>{branches.length} {t("nav.branches")}</h2>
      {branches.length === 0 && <p style={{ color: "var(--muted)" }}>{ar ? "لا توجد فروع بعد" : "No branches yet"}</p>}

      {branches.map((b) => {
        const isOpen = openBranch === b.id;
        const list = employeesOf(b.id);
        return (
          <section key={b.id} className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: "1.1rem" }}>{b.name}</strong>
                {b.address && <span style={{ color: "var(--muted)", marginInlineStart: 8 }}>{b.address}</span>}
                <div style={{ fontSize: "0.8rem", marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{
                    color: b.location ? "#065f46" : "#9a3412",
                    background: b.location ? "#d1fae5" : "#ffedd5",
                    padding: "3px 10px", borderRadius: 20, fontWeight: 600,
                  }}>
                    {b.location ? `📍 ${t("branch.locationSet")}` : `⚠️ ${t("branch.noLocation")}`}
                  </span>
                  <span style={{ color: "var(--muted)" }}>👥 {list.length}</span>
                  <span style={{ color: "var(--muted)" }}>
                    {b.managerId ? `👔 ${b.managerId.slice(0, 8)}…` : ar ? "بدون مدير" : "No manager"}
                  </span>
                </div>
              </div>
              <button className="btn btn-outline" style={{ padding: "6px 16px" }} onClick={() => setOpenBranch(isOpen ? null : b.id)}>
                {t("branch.manage")} {isOpen ? "▲" : "▼"}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                {/* Location — most important, highlighted when not yet set */}
                <div style={{
                  padding: 14, borderRadius: 10,
                  background: b.location ? "#f0fdf4" : "#fff7ed",
                  border: `1px solid ${b.location ? "#bbf7d0" : "#fed7aa"}`,
                }}>
                  <h3 style={{ fontSize: "1rem", margin: 0 }}>📍 {t("branch.location")}</h3>
                  {!b.location && (
                    <p style={{ fontSize: "0.82rem", color: "#9a3412", margin: "6px 0 0" }}>
                      {ar
                        ? "روح مكان الفرع واضغط الزر — هياخد موقعك تلقائياً. لازم تسمح للمتصفح بالوصول للموقع."
                        : "Go to the branch and tap the button — it grabs your location automatically. Allow location access when asked."}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                    <label style={{ flex: "0 0 150px" }}>{t("branch.radius")}
                      <input type="number" min={20} value={radius[b.id] ?? b.geofenceRadius ?? 150}
                        onChange={(e) => setRadius({ ...radius, [b.id]: Number(e.target.value) })} /></label>
                    <button className="btn" disabled={capturing === b.id} onClick={() => captureLocation(b.id)}
                      style={{ marginBottom: 2, fontSize: "1rem", padding: "10px 18px" }}>
                      {capturing === b.id ? t("branch.capturing") : t("branch.captureLocation")}
                    </button>
                  </div>
                  {b.location && (
                    <p style={{ fontSize: "0.8rem", color: "#065f46", marginTop: 8, fontWeight: 600 }}>
                      ✓ {b.location.lat.toFixed(5)}, {b.location.lng.toFixed(5)} · {ar ? "النطاق" : "radius"} {b.geofenceRadius ?? 150}m
                    </p>
                  )}
                </div>

                {/* Manager */}
                <h3 style={{ fontSize: "0.95rem", marginTop: 18 }}>👔 {t("branch.assignManager")}</h3>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <select value={assignSel[`mgr_${b.id}`] ?? ""} onChange={(e) => setAssignSel({ ...assignSel, [`mgr_${b.id}`]: e.target.value })}
                    style={{ flex: 1, minWidth: 180 }}>
                    <option value="">—</option>
                    {list.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                  <button className="btn btn-outline" disabled={busy || !assignSel[`mgr_${b.id}`]}
                    onClick={() => run(async () => { await call("assignBranchManager", { branchId: b.id, managerUid: assignSel[`mgr_${b.id}`] }); })}>
                    {t("branch.assignManager")}
                  </button>
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                  {ar ? "ملاحظة: يجب أن يكون للموظف حساب دخول ليصبح مديراً." : "Note: the employee needs a login account to become a manager."}
                </p>

                {/* Employees in this branch */}
                <h3 style={{ fontSize: "0.95rem", marginTop: 18 }}>👥 {t("branch.employees")}</h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {list.length === 0 && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{ar ? "لا يوجد" : "None"}</span>}
                  {list.map((e) => (
                    <span key={e.id} style={{ background: "#eef2ff", color: "#3730a3", padding: "4px 10px", borderRadius: 20, fontSize: "0.82rem" }}>
                      {e.fullName}
                    </span>
                  ))}
                </div>

                {/* Move an existing (unassigned) employee into this branch */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <select value={assignSel[b.id] ?? ""} onChange={(e) => setAssignSel({ ...assignSel, [b.id]: e.target.value })}
                    style={{ flex: 1, minWidth: 180 }}>
                    <option value="">{t("branch.assignEmployee")} ({t("branch.unassigned")})</option>
                    {unassigned.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                  <button className="btn" disabled={busy || !assignSel[b.id]}
                    onClick={() => run(async () => {
                      await call("updateEmployee", { employeeId: assignSel[b.id], branchId: b.id });
                      setAssignSel({ ...assignSel, [b.id]: "" });
                    })}>
                    {ar ? "نقل للفرع" : "Move here"}
                  </button>
                </div>

                {/* Add a brand-new employee directly into this branch */}
                <h3 style={{ fontSize: "0.95rem", marginTop: 18 }}>➕ {t("branch.addEmployeeHere")}</h3>
                <form onSubmit={(e) => { e.preventDefault(); run(async () => {
                  await call("createEmployee", { ...newEmp, branchId: b.id });
                  setNewEmp({ fullName: "", email: "", phone: "" });
                }); }} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input placeholder={ar ? "الاسم" : "Name"} value={newEmp.fullName}
                    onChange={(e) => setNewEmp({ ...newEmp, fullName: e.target.value })} required style={{ flex: 1, minWidth: 140 }} />
                  <input placeholder={ar ? "الإيميل" : "Email"} value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
                  <button className="btn" disabled={busy}>{ar ? "إضافة" : "Add"}</button>
                </form>

                {/* CSV import into this branch */}
                <div style={{ marginTop: 12 }}>
                  <label className="btn btn-outline" style={{ cursor: "pointer", display: "inline-block" }}>
                    📄 {t("branch.importHere")}
                    <input type="file" accept=".csv" style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        run(async () => {
                          const rows = parseCsv(await f.text()).map((r) => ({ ...r, branchId: b.id }));
                          if (rows.length === 0) throw new Error(ar ? "CSV فارغ" : "Empty CSV");
                          const res: any = await call("bulkImportEmployees", { rows });
                          setMsg(`✓ ${res.written ?? res.total} ${ar ? "موظف" : "employees"}`);
                        });
                      }} />
                  </label>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", marginInlineStart: 8 }}>
                    fullName,email,phone,nationalId,department,position
                  </span>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
