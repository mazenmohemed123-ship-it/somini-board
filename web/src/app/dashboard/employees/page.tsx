"use client";

/**
 * Employee management (HR core): list, add, delete, and CSV import.
 * CSV columns (header row): fullName,email,phone,nationalId,department,position,branchId
 * Add/import go through Cloud Functions which enforce national-ID uniqueness.
 */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient } from "@/lib/firebase";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Employee {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  branchId?: string;
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

export default function EmployeesPage() {
  const { t } = useI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", nationalId: "", department: "", position: "", branchId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        const token = u ? await u.getIdTokenResult() : null;
        const tid = (token?.claims as any)?.firebase?.tenant ?? (token?.claims as any)?.tenantId ?? null;
        setTenantId(tid);
      }),
    []
  );

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(dbClient, "employees"), where("tenantId", "==", tenantId));
    return onSnapshot(q, (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
  }, [tenantId]);

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await call("createEmployee", form);
      setForm({ fullName: "", email: "", phone: "", nationalId: "", department: "", position: "", branchId: "" });
      setMsg("✓");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setBusy(true);
    setMsg("");
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) throw new Error("CSV فارغ أو غير صالح");
      const res: any = await call("bulkImportEmployees", { rows });
      setMsg(`✓ ${res.mode === "queued" ? `قيد المعالجة (${res.total})` : `${res.written} موظف`}`);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(id: string) {
    if (!confirm("حذف الموظف؟")) return;
    try {
      await call("deleteEmployee", { employeeId: id });
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    }
  }

  return (
    <main className="container">
      <h1>{t("nav.employees")}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2>{t("employee.add")}</h2>
          <label className="btn btn-outline" style={{ cursor: "pointer", marginTop: 0 }}>
            {t("employee.import")}
            <input
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
          </label>
        </div>
        <form onSubmit={addEmployee}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("voter.fullName")}
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
            <label>{t("voter.email")}
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>{t("employee.phone")}
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>{t("voter.nationalId")}
              <input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></label>
            <label>{t("employee.department")}
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label>{t("employee.position")}
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <label>{t("employee.branch")} (ID)
              <input value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} /></label>
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>
            {busy ? t("common.loading") : t("employee.add")}
          </button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
        <p style={{ marginTop: 12, color: "var(--muted)", fontSize: "0.8rem" }}>
          CSV: fullName,email,phone,nationalId,department,position,branchId
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{employees.length} {t("nav.employees")}</h2>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: 8, textAlign: "right" }}>{t("voter.fullName")}</th>
                <th style={{ padding: 8, textAlign: "right" }}>{t("employee.department")}</th>
                <th style={{ padding: 8, textAlign: "right" }}>{t("employee.position")}</th>
                <th style={{ padding: 8, textAlign: "right" }}>{t("voter.email")}</th>
                <th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{e.fullName}</td>
                  <td style={{ padding: 8 }}>{e.department ?? "—"}</td>
                  <td style={{ padding: 8 }}>{e.position ?? "—"}</td>
                  <td style={{ padding: 8 }}>{e.email ?? "—"}</td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => removeEmployee(e.id)} style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {employees.length === 0 && <p style={{ color: "var(--muted)" }}>لا يوجد موظفون بعد</p>}
      </section>
    </main>
  );
}
