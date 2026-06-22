"use client";

/**
 * Staff management. A companyAdmin can grant/revoke roles to users within
 * their company (secretary). A superAdmin can manage any tenant.
 */
import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

const ROLES = ["companyAdmin", "secretary"];

export default function StaffPage() {
  const { t } = useI18n();
  const [form, setForm] = useState({ uid: "", role: "secretary" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function grantRole(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await httpsCallable(functions, "setUserRole")(form);
      setMsg("✓ تم تحديث الدور");
      setForm({ uid: "", role: "secretary" });
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>إدارة الموظفين</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>منح دور</h2>
        <form onSubmit={grantRole}>
          <label>
            معرّف المستخدم (UID)
            <input
              value={form.uid}
              onChange={(e) => setForm({ ...form, uid: e.target.value })}
              required
              placeholder="من Firebase Auth"
            />
          </label>
          <label>
            الدور
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 20 }}>
            {busy ? t("common.loading") : "تحديث الدور"}
          </button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>ملاحظات</h2>
        <ul style={{ marginLeft: 24, lineHeight: 1.8 }}>
          <li>الأدوار الممكنة: companyAdmin (مسؤول الشركة)، secretary (سكرتير)</li>
          <li>يمكن فقط للـ companyAdmin و superAdmin منح الأدوار</li>
          <li>companyAdmin لا يمكنه إنشاء companyAdmin آخر</li>
          <li>UID يمكن الحصول عليه من Firebase Authentication console</li>
        </ul>
      </section>
    </main>
  );
}
