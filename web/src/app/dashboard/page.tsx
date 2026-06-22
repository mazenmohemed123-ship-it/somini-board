"use client";

/**
 * Company dashboard: create a draft election and list existing ones for the
 * signed-in admin/secretary. Reads are tenant-scoped automatically by the
 * security rules (the query still filters by createdBy for the listing).
 */
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient, functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Election {
  id: string;
  title: string;
  status: string;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [uid, setUid] = useState<string | null>(null);
  const [elections, setElections] = useState<Election[]>([]);
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
      setElections(snap.docs.map((d) => ({ id: d.id, title: d.data().title, status: d.data().status })));
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
      setForm({ ...form, title: "", description: "" });
    } catch (err: any) {
      setMessage(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>{t("nav.dashboard")}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("election.create")}</h2>
        <form onSubmit={createElection}>
          <label>
            {t("election.title")}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label>
            {t("election.description")}
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              {t("election.startDate")}
              <input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </label>
            <label>
              {t("election.endDate")}
              <input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </label>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              {t("election.changeVoteWindow")}
              <input type="number" min={0} value={form.changeVoteWindow} onChange={(e) => setForm({ ...form, changeVoteWindow: Number(e.target.value) })} />
            </label>
            <label>
              {t("election.registrationMode")}
              <select value={form.registrationMode} onChange={(e) => setForm({ ...form, registrationMode: e.target.value })}>
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

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("nav.elections")}</h2>
        <ul style={{ listStyle: "none", marginTop: 12 }}>
          {elections.map((e) => (
            <li key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <a href={`/results/${e.id}`}>{e.title}</a> — <small>{t(`election.status.${e.status}`)}</small>
            </li>
          ))}
          {elections.length === 0 && <li style={{ color: "var(--muted)" }}>—</li>}
        </ul>
      </section>
    </main>
  );
}
