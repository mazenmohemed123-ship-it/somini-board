"use client";

/**
 * Public voter page. Flow:
 *   1. If not signed in -> show registration form -> registerVoter callable
 *      returns a custom token we exchange with signInWithCustomToken.
 *   2. Once signed in -> show candidates -> castVote / changeVote callables.
 *   3. "Join live meeting" opens the Jitsi iframe for this election.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, dbClient, functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";
import { JitsiMeeting } from "@/components/JitsiMeeting";

interface Candidate {
  id: string;
  fullName: string;
  photo?: string;
  description?: string;
}

export default function VotePage() {
  const { electionId } = useParams<{ electionId: string }>();
  const { t } = useI18n();
  const [signedIn, setSignedIn] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [reg, setReg] = useState({ fullName: "", nationalId: "", address: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setSignedIn(!!u)), []);

  useEffect(() => {
    if (!signedIn) return;
    getDocs(collection(dbClient, "elections", electionId, "candidates")).then((snap) =>
      setCandidates(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    const me = auth.currentUser;
    if (me) {
      getDoc(doc(dbClient, "elections", electionId, "voters", me.uid)).then((d) => {
        if (d.exists() && d.data().hasVoted) {
          setVoted(true);
          setSelected(d.data().votedFor ?? null);
        }
      });
    }
  }, [signedIn, electionId]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const call = httpsCallable(functions, "registerVoter");
      const res: any = await call({ electionId, ...reg });
      await signInWithCustomToken(auth, res.data.customToken);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitVote() {
    if (!selected) return;
    setBusy(true);
    setMsg("");
    try {
      const fn = voted ? "changeVote" : "castVote";
      await httpsCallable(functions, fn)({ electionId, candidateId: selected });
      setVoted(true);
      setMsg(t("vote.success"));
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <main className="container">
        <div className="card">
          <h1>{t("voter.register")}</h1>
          <form onSubmit={register}>
            <label>
              {t("voter.fullName")}
              <input value={reg.fullName} onChange={(e) => setReg({ ...reg, fullName: e.target.value })} required />
            </label>
            <label>
              {t("voter.nationalId")}
              <input value={reg.nationalId} onChange={(e) => setReg({ ...reg, nationalId: e.target.value })} required />
            </label>
            <label>
              {t("voter.address")}
              <input value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} />
            </label>
            <label>
              {t("voter.email")}
              <input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
            </label>
            <button className="btn" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? t("common.loading") : t("voter.register")}
            </button>
            {msg && <p style={{ marginTop: 12, color: "crimson" }}>{msg}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("vote.candidates")}</h1>
        <button className="btn btn-outline" onClick={() => setShowMeeting((s) => !s)}>
          {t("meeting.join")}
        </button>
      </div>

      {showMeeting && <JitsiMeeting electionId={electionId} />}

      <div className="grid" style={{ marginTop: 16 }}>
        {candidates.map((c) => (
          <div
            key={c.id}
            className={`candidate ${selected === c.id ? "selected" : ""}`}
            onClick={() => setSelected(c.id)}
          >
            {c.photo && <img src={c.photo} alt={c.fullName} />}
            <div>
              <strong>{c.fullName}</strong>
              <div style={{ color: "var(--muted)" }}>{c.description}</div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn" disabled={!selected || busy} onClick={submitVote} style={{ marginTop: 20 }}>
        {voted ? t("vote.change") : t("vote.cast")}
      </button>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
