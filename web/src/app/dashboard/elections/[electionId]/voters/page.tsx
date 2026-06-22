"use client";

/**
 * Manage registered voters for a roster-mode election.
 * - View the roster (who registered, who voted, when)
 * - Send reminder emails via Cloud Tasks (commented for future implementation)
 * - Bulk import CSV or manual add
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, onSnapshot, doc, getDoc, addDoc } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Voter {
  id: string;
  fullName: string;
  email?: string;
  hasVoted: boolean;
  votedAt?: any;
}

interface Election {
  title: string;
  registrationMode: string;
}

export default function VotersPage() {
  const { electionId } = useParams<{ electionId: string }>();
  const { t } = useI18n();
  const [election, setElection] = useState<Election | null>(null);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [form, setForm] = useState({ fullName: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getDoc(doc(dbClient, "elections", electionId)).then((d) => {
      if (d.exists()) setElection(d.data() as Election);
    });
  }, [electionId]);

  useEffect(() => {
    const q = collection(dbClient, "elections", electionId, "voters");
    return onSnapshot(q, (snap) =>
      setVoters(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [electionId]);

  async function addVoter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await addDoc(collection(dbClient, "elections", electionId, "voters"), {
        fullName: form.fullName,
        email: form.email,
        hasVoted: false,
        votedFor: null,
      });
      setForm({ fullName: "", email: "" });
      setMsg("✓ تم إضافة الناخب");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const voted = voters.filter((v) => v.hasVoted).length;
  const pending = voters.length - voted;

  return (
    <main className="container">
      <h1>الناخبون — {election?.title}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <strong>{voters.length}</strong>
            <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>المسجلون</div>
          </div>
          <div>
            <strong>{voted}</strong>
            <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>صوتوا</div>
          </div>
          <div>
            <strong>{pending}</strong>
            <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>لم يصوتوا</div>
          </div>
        </div>
      </section>

      {election?.registrationMode === "roster" && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>إضافة ناخب</h2>
          <form onSubmit={addVoter}>
            <label>
              {t("voter.fullName")}
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </label>
            <label>
              {t("voter.email")}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? t("common.loading") : "إضافة"}
            </button>
            {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
          </form>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>القائمة</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: 8, textAlign: "right" }}>#</th>
                <th style={{ padding: 8, textAlign: "right" }}>{t("voter.fullName")}</th>
                <th style={{ padding: 8, textAlign: "right" }}>{t("voter.email")}</th>
                <th style={{ padding: 8, textAlign: "right" }}>الحالة</th>
                <th style={{ padding: 8, textAlign: "right" }}>الوقت</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{i + 1}</td>
                  <td style={{ padding: 8 }}>{v.fullName}</td>
                  <td style={{ padding: 8 }}>{v.email ?? "—"}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ background: v.hasVoted ? "#ecfdf5" : "#fef3c7", padding: "4px 8px", borderRadius: 4 }}>
                      {v.hasVoted ? "✓ صوّت" : "⏳ لم يصوّت"}
                    </span>
                  </td>
                  <td style={{ padding: 8, fontSize: "0.75rem", color: "var(--muted)" }}>
                    {v.votedAt?.toDate?.().toLocaleTimeString?.("ar-EG") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {voters.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد ناخبون بعد</p>}
      </section>
    </main>
  );
}
