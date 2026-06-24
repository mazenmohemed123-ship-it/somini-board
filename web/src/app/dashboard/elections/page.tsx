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
import { DateTimePicker } from "@/components/DateTimePicker";

interface Election {
  id: string;
  title: string;
  status: string;
  branchId?: string | null;
  rosterCount?: number;
}

const STATUS_PILL: Record<string, string> = {
  draft: "pill-gray",
  active: "pill-green",
  ended: "pill-red",
};

export default function ElectionsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId } = useAuth();
  const ar = locale === "ar";
  const [elections, setElections] = useState<Election[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [committees, setCommittees] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    title: "", description: "", startDate: 0, endDate: 0, changeVoteWindow: 10,
    registrationMode: "roster", branchId: "",
  });
  const [pull, setPull] = useState({ electionId: "", scope: "all", branchId: "", department: "", committeeId: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
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
    if (!form.startDate || !form.endDate) {
      setMsgOk(false);
      setMsg(ar ? "اختر تاريخ البدء والانتهاء" : "Pick start and end dates");
      return;
    }
    if (form.endDate <= form.startDate) {
      setMsgOk(false);
      setMsg(ar ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" : "End date must be after start date");
      return;
    }
    setBusy(true); setMsg("");
    try {
      const res: any = await call("createElection", {
        title: form.title,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        changeVoteWindow: Number(form.changeVoteWindow),
        registrationMode: form.registrationMode,
        ...(form.branchId && { branchId: form.branchId }),
      });
      setMsgOk(true);
      setMsg(ar ? "تم إنشاء الانتخاب بنجاح ✓" : "Election created ✓");
      setForm({ ...form, title: "", description: "", startDate: 0, endDate: 0 });
    } catch (err: any) {
      setMsgOk(false);
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
      setMsgOk(true);
      setMsg(`✓ ${res.added} ${ar ? "ناخب" : "voters"}`);
    } catch (err: any) {
      setMsgOk(false);
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  if (loading) return null;

  const draftElections = elections.filter((el) => el.status === "draft");

  return (
    <main className="container">
      <header style={{ marginBottom: 8 }}>
        <h1>{t("nav.elections")}</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          {ar
            ? "أنشئ انتخاباً، اسحب الناخبين من الموظفين، ثم أضف المرشحين."
            : "Create an election, pull voters from employees, then add candidates."}
        </p>
      </header>

      {error && (
        <div style={{ color: "#991b1b", margin: "16px 0", padding: 12, backgroundColor: "#fee2e2", borderRadius: 10 }}>
          {error}
        </div>
      )}

      {/* ───────── CREATE ELECTION ───────── */}
      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("election.create")}</h2>
        <form onSubmit={createElection} style={{ marginTop: 8 }}>
          <label>{t("election.title")}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={ar ? "مثال: انتخابات مجلس الإدارة 2026" : "e.g., Board Elections 2026"} required /></label>

          <label>{t("election.description")}
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={ar ? "وصف مختصر للانتخاب (اختياري)" : "Short description (optional)"} rows={2} /></label>

          {/* Start date — easy boxes */}
          <div style={{ marginTop: 18 }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>🟢 {t("election.startDate")}</span>
            <DateTimePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} ar={ar} />
          </div>

          {/* End date — easy boxes */}
          <div style={{ marginTop: 18 }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>🔴 {t("election.endDate")}</span>
            <DateTimePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} ar={ar} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 18 }}>
            <label>{t("election.changeVoteWindow")}
              <input type="number" min={0} value={form.changeVoteWindow}
                onChange={(e) => setForm({ ...form, changeVoteWindow: Number(e.target.value) })} /></label>
            <label>{t("election.scope")}
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t("motion.scope.all")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          <label>{t("election.registrationMode")}
            <select value={form.registrationMode} onChange={(e) => setForm({ ...form, registrationMode: e.target.value })}>
              <option value="roster">{t("election.mode.roster")}</option>
              <option value="open">{t("election.mode.open")}</option>
            </select>
          </label>

          <button className="btn" disabled={busy} style={{ marginTop: 22, width: "100%" }}>
            {busy ? t("common.loading") : t("election.create")}
          </button>
          {msg && (
            <p style={{ marginTop: 12, textAlign: "center", fontWeight: 600, color: msgOk ? "#166534" : "#991b1b" }}>{msg}</p>
          )}
        </form>
      </section>

      {/* ───────── PULL VOTERS ───────── */}
      <section className="card" style={{ marginTop: 24 }}>
        <h2>{t("election.pullVoters")}</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 4 }}>
          {ar
            ? "اختر انتخاباً (مسودة) ثم حدد من سيُضاف كناخبين."
            : "Pick a draft election, then choose who gets added as voters."}
        </p>
        <form onSubmit={pullVoters} style={{ marginTop: 12 }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("nav.elections")}
              <select value={pull.electionId} onChange={(e) => setPull({ ...pull, electionId: e.target.value })} required>
                <option value="">—</option>
                {draftElections.map((el) => <option key={el.id} value={el.id}>{el.title}</option>)}
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
                <input value={pull.department} onChange={(e) => setPull({ ...pull, department: e.target.value })}
                  placeholder={ar ? "اسم القسم" : "Department name"} /></label>
            )}
            {pull.scope === "committee" && (
              <label>{t("committee.name")}
                <select value={pull.committeeId} onChange={(e) => setPull({ ...pull, committeeId: e.target.value })}>
                  <option value="">—</option>
                  {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
            )}
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 18, width: "100%" }}>
            {busy ? t("common.loading") : t("election.pullVoters")}
          </button>
        </form>
      </section>

      {/* ───────── ELECTIONS LIST ───────── */}
      <section className="card" style={{ marginTop: 24 }}>
        <h2>{elections.length} {t("nav.elections")}</h2>
        <div style={{ marginTop: 12 }}>
          {elections.map((el) => (
            <div key={el.id} style={{
              padding: "16px 0", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1.05rem" }}>{el.title}</strong>
                <span className={`pill ${STATUS_PILL[el.status] || "pill-gray"}`}>
                  {t(`election.status.${el.status}`)}
                </span>
                {el.rosterCount ? (
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    👥 {el.rosterCount} {ar ? "ناخب" : "voters"}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn btn-outline" style={{ padding: "6px 14px" }} href={`/dashboard/elections/${el.id}/candidates`}>
                  {t("vote.candidates")}
                </Link>
                <Link className="btn btn-outline" style={{ padding: "6px 14px" }} href={`/results/${el.id}`}>
                  {t("nav.results")}
                </Link>
              </div>
            </div>
          ))}
        </div>
        {elections.length === 0 && (
          <p style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>
            {ar ? "لا توجد انتخابات بعد — أنشئ أول انتخاب من الأعلى." : "No elections yet — create your first one above."}
          </p>
        )}
      </section>
    </main>
  );
}
