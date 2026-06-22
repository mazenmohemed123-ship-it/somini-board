"use client";

/**
 * Company provisioning page. A superAdmin can:
 *   - Create a new company (Identity Platform tenant + companyAdmin user)
 *   - The tenant is automatically created and the first admin is provisioned
 */
import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

export default function AdminSetupPage() {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", adminEmail: "", adminPassword: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function provisionCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setResult(null);
    try {
      const call = httpsCallable(functions, "provisionCompany");
      const res: any = await call(form);
      setResult(res.data);
      setMsg("✓ تم إنشاء الشركة بنجاح");
      setForm({ name: "", adminEmail: "", adminPassword: "" });
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>إعداد شركة جديدة</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>تجهيز Tenant و Admin</h2>
        <form onSubmit={provisionCompany}>
          <label>
            اسم الشركة
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            بريد المسؤول
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              required
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              required
            />
          </label>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 20 }}>
            {busy ? t("common.loading") : "إنشاء"}
          </button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>

      {result && (
        <section className="card" style={{ marginTop: 24, background: "#ecfdf5" }}>
          <h2>✓ تم الإنشاء بنجاح</h2>
          <pre style={{ marginTop: 12, overflowX: "auto", background: "#f3f4f6", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
          <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--muted)" }}>
            احفظ هذه البيانات. Tenant ID مطلوب للتطبيق.
          </p>
        </section>
      )}
    </main>
  );
}
