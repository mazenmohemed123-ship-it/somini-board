"use client";

/**
 * Live results screen. Candidate vote counts update in real time from the
 * Realtime Database liveResults node (written by the vote functions). Once the
 * election ends and the PDF is generated, a download link appears.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { onValue, ref } from "firebase/database";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { realtimeDb, dbClient } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Row {
  id: string;
  name: string;
  votes: number;
}

export default function ResultsPage() {
  const { electionId } = useParams<{ electionId: string }>();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reportPath, setReportPath] = useState<string | null>(null);

  // Candidate names + report status (one-shot).
  useEffect(() => {
    getDocs(collection(dbClient, "elections", electionId, "candidates")).then((snap) => {
      const m: Record<string, string> = {};
      snap.forEach((d) => (m[d.id] = d.data().fullName));
      setNames(m);
    });
    getDoc(doc(dbClient, "elections", electionId)).then((d) => {
      if (d.exists()) setReportPath(d.data().reportPath ?? null);
    });
  }, [electionId]);

  // Live tally listener.
  useEffect(() => {
    const r = ref(realtimeDb, `elections/${electionId}/liveResults`);
    return onValue(r, (snap) => {
      const data = (snap.val() as Record<string, number>) || {};
      const next = Object.entries(data)
        .map(([id, votes]) => ({ id, name: names[id] ?? id, votes }))
        .sort((a, b) => b.votes - a.votes);
      setRows(next);
    });
  }, [electionId, names]);

  const total = rows.reduce((s, r) => s + r.votes, 0);

  return (
    <main className="container">
      <h1>{t("results.live")}</h1>
      <div className="card" style={{ marginTop: 16 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{r.name}</strong>
              <span>{r.votes}</span>
            </div>
            <div className="bar" style={{ width: `${total ? (r.votes / total) * 100 : 0}%` }} />
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: "var(--muted)" }}>—</p>}
        <p style={{ marginTop: 16 }}>
          {t("results.totalVotes")}: <strong>{total}</strong>
        </p>
        {reportPath && (
          <a
            className="btn"
            style={{ marginTop: 12 }}
            href={`https://firebasestorage.googleapis.com/v0/b/${
              process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
            }/o/${encodeURIComponent(reportPath)}?alt=media`}
          >
            {t("results.downloadPdf")}
          </a>
        )}
      </div>
    </main>
  );
}
