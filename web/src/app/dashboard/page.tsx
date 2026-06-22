"use client";

/**
 * Company dashboard: create elections, manage existing ones, view statistics,
 * quick links to candidates/voters/payment, and navigation.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient, functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Election {
  id: string;
  title: string;
  status: string;
  startDate: any;
  endDate: any;
  registrationMode: string;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [uid, setUid] = useState<string | null>(null);
  const [elections, setElections] = useState<Election[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, ended: 0 });
  const [form, setForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    changeVoteWindow: 10,
    registrationMode: "open",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(dbClient, "elections"), where("createdBy", "==", uid));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => {
        const docData = d.data();
        return {
          id: d.id,
          title: docData.title,
          status: docData.status,
          startDate: docData.startDate,
          endDate: docData.endDate,
          registrationMode: docData.registrationMode,
        } as Election;
      });
      setElections(data);
      setStats({
        total: data.length,
        active: data.filter((e) => e.status === "active").length,
        ended: data.filter((e) => e.status === "ended").length,
      });
    });
  }, [uid]);

  async function createElection(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const call = httpsCallable(functions, "createElection");
      const res: any = await call({
        title: form.title,
        description: form.description,
        startDate: new Date(form.startDate).getTime(),
        endDate: new Date(form.endDate).getTime(),
        changeVoteWindow: Number(form.changeVoteWindow),
        registrationMode: form.registrationMode,
      });
      setMessage(`✓ ${res.data.electionId}`);
      setForm({ ...form, title: "", description: "", startDate: "", endDate: "" });
    } catch (err: any) {
      setMessage(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("nav.dashboard")}</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <Link className="btn btn-outline" href="/dashboard/payment">
            {t("payment.title")}
          </Link>
          <Link className="btn btn-outline" href="/dashboard/integrations">
            {t("nav.integrations")}
          </Link>
        </div>
      </header>

      <div
        className="grid"
        style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
      >
        <div className="card">
          <strong>{stats.total}</strong>
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{t("nav.elections")}</div>
        </div>
        <div className="card">
          <strong>{stats.active}</strong>
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{t("election.status.active")}</div>
        </div>
        <div className="card">
          <strong>{stats.ended}</strong>
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{t("election.status.ended")}</div>
        </div>
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>{t("election.create")}</h2>
        <form onSubmit={createElection}>
          <label>
            {t("election.title")}
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label>
            {t("election.description")}
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              {t("election.startDate")}
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </label>
            <label>
              {t("election.endDate")}
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              {t("election.changeVoteWindow")}
              <input
                type="number"
                min={0}
                value={form.changeVoteWindow}
                onChange={(e) => setForm({ ...form, changeVoteWindow: Number(e.target.value) })}
              />
            </label>
            <label>
              {t("election.registrationMode")}
              <select
                value={form.registrationMode}
                onChange={(e) => setForm({ ...form, registrationMode: e.target.value })}
              >
                <option value="open">{t("election.mode.open")}</option>
                <option value="roster">{t("election.mode.roster")}</option>
              </select>
            </label>
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 20 }}>
            {busy ? t("common.loading") : t("common.save")}
          </button>
          {message && <p style={{ marginTop: 12 }}>{message}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>{t("nav.elections")}</h2>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "8px 0", textAlign: "right" }}>العنوان</th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>الحالة</th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>التاريخ</th>
                <th style={{ padding: "8px 0", textAlign: "right" }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {elections.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 0" }}>
                    <strong>{e.title}</strong>
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: 4,
                        background:
                          e.status === "active"
                            ? "#dbeafe"
                            : e.status === "ended"
                              ? "#ecfdf5"
                              : "#f3f4f6",
                      }}
                    >
                      {t(`election.status.${e.status}`)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0", fontSize: "0.875rem", color: "var(--muted)" }}>
                    {e.startDate?.toDate?.().toLocaleDateString?.("ar-EG") || "—"}
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link href={`/dashboard/elections/${e.id}/candidates`} className="btn" style={{ padding: "6px 12px", fontSize: "0.875rem" }}>
                        المرشحون
                      </Link>
                      {e.registrationMode === "roster" && (
                        <Link href={`/dashboard/elections/${e.id}/voters`} className="btn" style={{ padding: "6px 12px", fontSize: "0.875rem" }}>
                          الناخبون
                        </Link>
                      )}
                      <Link href={`/results/${e.id}`} className="btn" style={{ padding: "6px 12px", fontSize: "0.875rem" }}>
                        النتائج
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {elections.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد انتخابات بعد</p>}
      </section>
    </main>
  );
}
