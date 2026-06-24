"use client";

/**
 * Election management: create elections (general / branch / committee scope),
 * and — the HR link — pull the voter roster directly from employees by scope.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Election {
  id: string;
  title: string;
  status: string;
  branchId?: string | null;
  rosterCount?: number;
}

export default function ElectionsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId } = useAuth();
  const ar = locale === "ar";
  const [elections, setElections] = useState<Election[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [committees, setCommittees] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    title: "", description: "", startDate: "", endDate: "", changeVoteWindow: 10,
    registrationMode: "roster", branchId: "",
  });
  const [pull, setPull] = useState({ electionId: "", scope: "all", branchId: "", department: "", committeeId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!tenantId) return;
    const ue = onSnapshot(
      query(collection(dbClient, "elections"), where("tenantId", "==", tenantId)),
      (s) => {
        setElections(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setError("");
      },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const ub = onSnapshot(
      query(collection(dbClient, "branches"), where("tenantId", "==", tenantId)),
      (s) => setBranches(s.docs.map((d) => ({ id: d.id, name: d.data().name }))),
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const uc = onSnapshot(
      query(collection(dbClient, "committees"), where("tenantId", "==", tenantId)),
      (s) => setCommittees(s.docs.map((d) => ({ id: d.id, name: d.data().name }))),
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    return () => { ue(); ub(); uc(); };
  }, [tenantId, t]);

  async function createElection(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const res: any = await call("createElection", {
        title: form.title,
        description: form.description,
        startDate: new Date(form.startDate).getTime(),
        endDate: new Date(form.endDate).getTime(),
        changeVoteWindow: Number(form.changeVoteWindow),
        registrationMode: form.registrationMode,
        ...(form.branchId && { branchId: form.branchId }),
      });
      setMsg(`✓ ${res.electionId}`);
      setForm({ ...form, title: "", description: "", startDate: "", endDate: "" });
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  async function pullVoters(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const res: any = await call("pullVotersFromEmployees", {
        electionId: pull.electionId,
        scope: pull.scope,
        ...(pull.scope === "branch" && { branchId: pull.branchId }),
        ...(pull.scope === "department" && { department: pull.department }),
        ...(pull.scope === "committee" && { committeeId: pull.committeeId }),
      });
      setMsg(`✓ ${res.added} ناخب`);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  if (loading) return null;

  return (
    <main className="container">
      <h1>{t("nav.elections")}</h1>

      {error && <div style={{ color: "red", marginBottom: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8 }}>{error}</div>}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("election.create")}</h2>
        <form onSubmit={createElection}>
          <label>{t("election.title")}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>{t("election.description")}
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("election.startDate")}
              <input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
            <label>{t("election.endDate")}
              <input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></label>
            <label>{t("election.changeVoteWindow")}
              <input type="number" min={0} value={form.changeVoteWindow} onChange={(e) => setForm({ ...form, changeVoteWindow: Number(e.target.value) })} /></label>
            <label>{t("election.scope")} ({t("branch.name")})
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t("motion.scope.all")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("common.save")}</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("election.pullVoters")}</h2>
        <form onSubmit={pullVoters}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("nav.elections")}
              <select value={pull.electionId} onChange={(e) => setPull({ ...pull, electionId: e.target.value })} required>
                <option value="">—</option>
                {elections.filter((el) => el.status === "draft").map((el) => <option key={el.id} value={el.id}>{el.title}</option>)}
              </select>
            </label>
            <label>{t("motion.scope")}
              <select value={pull.scope} onChange={(e) => setPull({ ...pull, scope: e.target.value })}>
                <option value="all">{t("motion.scope.all")}</option>
                <option value="branch">{t("motion.scope.branch")}</option>
                <option value="department">{t("motion.scope.department")}</option>
                <option value="committee">{t("motion.scope.committee")}</option>
              </select>
            </label>
            {pull.scope === "branch" && (
              <label>{t("branch.name")}
                <select value={pull.branchId} onChange={(e) => setPull({ ...pull, branchId: e.target.value })}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select></label>
            )}
            {pull.scope === "department" && (
              <label>{t("employee.department")}
                <input value={pull.department} onChange={(e) => setPull({ ...pull, department: e.target.value })} /></label>
            )}
            {pull.scope === "committee" && (
              <label>{t("committee.name")}
                <select value={pull.committeeId} onChange={(e) => setPull({ ...pull, committeeId: e.target.value })}>
                  <option value="">—</option>
                  {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
            )}
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("election.pullVoters")}</button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{elections.length} {t("nav.elections")}</h2>
        <ul style={{ listStyle: "none", marginTop: 12 }}>
          {elections.map((el) => (
            <li key={el.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span>
                <strong>{el.title}</strong> <small style={{ color: "var(--muted)" }}>{t(`election.status.${el.status}`)}</small>
                {el.rosterCount ? <small style={{ color: "var(--muted)" }}> · {el.rosterCount} ناخب</small> : null}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <Link className="btn btn-outline" style={{ padding: "4px 12px" }} href={`/dashboard/elections/${el.id}/candidates`}>{t("vote.candidates")}</Link>
                <Link className="btn btn-outline" style={{ padding: "4px 12px" }} href={`/results/${el.id}`}>{t("nav.results")}</Link>
              </span>
            </li>
          ))}
        </ul>
        {elections.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد انتخابات بعد</p>}
      </section>
    </main>
  );
}
