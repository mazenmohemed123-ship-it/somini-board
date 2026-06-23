"use client";

/**
 * Meetings: schedule a meeting (creates a Jitsi room + reminders), join the
 * live stream via embedded Jitsi, and record/sign minutes.
 */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient } from "@/lib/firebase";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import { JitsiMeeting } from "@/components/JitsiMeeting";

interface Meeting {
  id: string;
  title: string;
  type: string;
  jitsiRoom: string;
  jitsiUrl: string;
  dateTime: any;
  status: string;
  minutesUrl?: string | null;
}

export default function MeetingsPage() {
  const { t } = useI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [form, setForm] = useState({ title: "", dateTime: "", type: "general" });
  const [joined, setJoined] = useState<string | null>(null);
  const [minutesFor, setMinutesFor] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        const token = u ? await u.getIdTokenResult() : null;
        setTenantId((token?.claims as any)?.firebase?.tenant ?? (token?.claims as any)?.tenantId ?? null);
      }),
    []
  );

  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(query(collection(dbClient, "meetings"), where("tenantId", "==", tenantId)), (s) =>
      setMeetings(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [tenantId]);

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      await call("createMeeting", {
        title: form.title,
        dateTime: new Date(form.dateTime).getTime(),
        type: form.type,
      });
      setForm({ title: "", dateTime: "", type: "general" });
      setMsg("✓");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  async function saveMinutes() {
    setBusy(true); setMsg("");
    try {
      await call("recordMinutes", { meetingId: minutesFor, content: minutesText });
      setMinutesFor(null);
      setMinutesText("");
      setMsg("✓ تم حفظ المحضر");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally { setBusy(false); }
  }

  return (
    <main className="container">
      <h1>{t("nav.meetings")}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("meeting.create")}</h2>
        <form onSubmit={createMeeting}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label>{t("meeting.title")}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label>{t("meeting.dateTime")}
              <input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} required /></label>
            <label>{t("meeting.type")}
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="general">عام</option>
                <option value="committee">لجنة</option>
                <option value="election">انتخاب</option>
              </select></label>
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("meeting.create")}</button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        {meetings.map((m) => (
          <div key={m.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{m.title}</strong>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {m.dateTime?.toDate?.().toLocaleString?.("ar-EG") || "—"} · {m.type}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setJoined(joined === m.id ? null : m.id)}>
                  {t("meeting.join")}
                </button>
                <button className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => setMinutesFor(minutesFor === m.id ? null : m.id)}>
                  {t("meeting.recordMinutes")}
                </button>
                {m.minutesUrl && (
                  <a
                    className="btn btn-outline"
                    style={{ padding: "4px 12px" }}
                    href={`https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(m.minutesUrl)}?alt=media`}
                  >
                    {t("meeting.minutes")} PDF
                  </a>
                )}
              </div>
            </div>

            {joined === m.id && <JitsiMeeting electionId={m.id} />}

            {minutesFor === m.id && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  rows={6}
                  value={minutesText}
                  onChange={(e) => setMinutesText(e.target.value)}
                  placeholder="نص المحضر..."
                />
                <button className="btn" disabled={busy} onClick={saveMinutes} style={{ marginTop: 8 }}>
                  {t("common.save")}
                </button>
              </div>
            )}
          </div>
        ))}
        {meetings.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد اجتماعات بعد</p>}
      </section>
    </main>
  );
}
