"use client";

/**
 * Motions (decision voting): create a motion with options and an eligible
 * scope, publish it, and vote inline. Results show live from RTDB.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onValue, ref } from "firebase/database";
import { dbClient, realtimeDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import { DateTimePicker } from "@/components/DateTimePicker";

interface Motion {
  id: string;
  title: string;
  description?: string;
  options: string[];
  status: string;
  eligibleScope: string;
}

function MotionResults({ motionId, options }: { motionId: string; options: string[] }) {
  const [tally, setTally] = useState<Record<string, number>>({});
  useEffect(() => {
    return onValue(ref(realtimeDb, `motions/${motionId}/liveResults`), (s) => setTally(s.val() || {}));
  }, [motionId]);
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginTop: 8 }}>
      {options.map((o) => {
        const v = tally[o] ?? 0;
        return (
          <div key={o} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{o}</span>
              <span>{v}</span>
            </div>
            <div className="bar" style={{ width: `${total ? (v / total) * 100 : 0}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function MotionsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId } = useAuth();
  const ar = locale === "ar";
  const [motions, setMotions] = useState<Motion[]>([]);
  const [form, setForm] = useState({
    title: "", description: "", options: "موافق, غير موافق, ممتنع",
    eligibleScope: "all", startDate: 0, endDate: 0, changeVoteWindow: 0,
  });
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
    return onSnapshot(
      query(collection(dbClient, "motions"), where("tenantId", "==", tenantId)),
      (s) => {
        setMotions(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setError("");
      },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
  }, [tenantId, t]);

  async function createMotion(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      setMsg(ar ? "اختر تاريخ البدء والانتهاء" : "Pick start and end dates");
      return;
    }
    if (form.endDate <= form.startDate) {
      setMsg(ar ? "تاريخ الانتهاء يجب أن يكون بعد البدء" : "End must be after start");
      return;
    }
    setBusy(true); setMsg("");
    try {
      await call("createMotion", {
        title: form.title,
        description: form.description,
        options: form.options.split(",").map((o) => o.trim()).filter(Boolean),
        eligibleScope: form.eligibleScope,
        startDate: form.startDate,
        endDate: form.endDate,
        changeVoteWindow: Number(form.changeVoteWindow),
      });
      setMsg("✓");
      setForm({ ...form, title: "", description: "" });
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  async function act(fn: string, data: any) {
    setMsg("");
    try {
      await call(fn, data);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    }
  }

  if (loading) return null;

  return (
    <main className="container">
      <h1>{t("nav.motions")}</h1>

      {error && <div style={{ color: "red", marginBottom: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8 }}>{error}</div>}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("motion.create")}</h2>
        <form onSubmit={createMotion} style={{ marginTop: 8 }}>
          <label>{t("motion.title")}
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={ar ? "مثال: الموافقة على الميزانية" : "e.g., Approve the budget"} required /></label>
          <label>{t("election.description")}
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={ar ? "وصف القرار (اختياري)" : "Decision details (optional)"} rows={2} /></label>
          <label>{t("motion.options")} {ar ? "(مفصولة بفاصلة)" : "(comma-separated)"}
            <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })}
              placeholder={ar ? "موافق, غير موافق, ممتنع" : "Yes, No, Abstain"} required /></label>

          <label style={{ marginTop: 16 }}>{t("motion.scope")}
            <select value={form.eligibleScope} onChange={(e) => setForm({ ...form, eligibleScope: e.target.value })}>
              <option value="all">{t("motion.scope.all")}</option>
              <option value="branch">{t("motion.scope.branch")}</option>
              <option value="department">{t("motion.scope.department")}</option>
              <option value="committee">{t("motion.scope.committee")}</option>
            </select></label>

          <div style={{ marginTop: 18 }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>🟢 {t("election.startDate")}</span>
            <DateTimePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} ar={ar} />
          </div>
          <div style={{ marginTop: 18 }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>🔴 {t("election.endDate")}</span>
            <DateTimePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} ar={ar} />
          </div>

          <button className="btn" disabled={busy} style={{ marginTop: 22, width: "100%" }}>
            {busy ? t("common.loading") : t("motion.create")}
          </button>
          {msg && <p style={{ marginTop: 12, textAlign: "center", fontWeight: 600 }}>{msg}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        {motions.map((m) => (
          <div key={m.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{m.title}</strong>
                <span style={{ marginInlineStart: 8, fontSize: "0.8rem", padding: "2px 8px", borderRadius: 4, background: m.status === "active" ? "#dbeafe" : m.status === "ended" ? "#ecfdf5" : "#f3f4f6" }}>
                  {t(`election.status.${m.status}`)}
                </span>
              </div>
              {m.status === "draft" && (
                <button className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => act("publishMotion", { motionId: m.id })}>
                  {t("motion.publish")}
                </button>
              )}
            </div>
            {m.description && <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 4 }}>{m.description}</p>}

            {m.status === "active" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {m.options.map((o) => (
                  <button key={o} className="btn" style={{ padding: "6px 16px" }} onClick={() => act("castMotionVote", { motionId: m.id, optionChosen: o })}>
                    {o}
                  </button>
                ))}
              </div>
            )}
            <MotionResults motionId={m.id} options={m.options} />
          </div>
        ))}
        {motions.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد قرارات بعد</p>}
      </section>
    </main>
  );
}
