"use client";

/**
 * Meetings: schedule a meeting (creates a Jitsi room + reminders), join the
 * live stream via embedded Jitsi, and record/sign minutes.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import { JitsiMeeting } from "@/components/JitsiMeeting";
import { DateTimePicker } from "@/components/DateTimePicker";

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
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId, role } = useAuth();
  const ar = locale === "ar";
  // Only admins / secretaries (meeting hosts) can schedule meetings. Everyone
  // else — employees, hr, branch managers — can still join and view.
  const canHost = role === "companyAdmin" || role === "secretary" || role === "superAdmin";
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [form, setForm] = useState({ title: "", dateTime: 0, type: "general" });
  const [joined, setJoined] = useState<string | null>(null);
  const [minutesFor, setMinutesFor] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState("");
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
      query(collection(dbClient, "meetings"), where("tenantId", "==", tenantId)),
      (s) => {
        setMeetings(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setError("");
      },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
  }, [tenantId, t]);

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dateTime) {
      setMsg(ar ? "اختر موعد الاجتماع" : "Pick a meeting date");
      return;
    }
    setBusy(true); setMsg("");
    try {
      await call("createMeeting", {
        title: form.title,
        dateTime: form.dateTime,
        type: form.type,
      });
      setForm({ title: "", dateTime: 0, type: "general" });
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

  if (loading) return null;

  return (
    <main className="container">
      <h1>{t("nav.meetings")}</h1>

      {error && <div style={{ color: "red", marginBottom: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8 }}>{error}</div>}

      {canHost && (
      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("meeting.create")}</h2>
        <form onSubmit={createMeeting} style={{ marginTop: 8 }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("meeting.title")}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={ar ? "مثال: اجتماع مجلس الإدارة" : "e.g., Board Meeting"} required /></label>
            <label>{t("meeting.type")}
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="general">{ar ? "عام" : "General"}</option>
                <option value="committee">{ar ? "لجنة" : "Committee"}</option>
                <option value="election">{ar ? "انتخاب" : "Election"}</option>
              </select></label>
          </div>

          <div style={{ marginTop: 18 }}>
            <span style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>🗓️ {t("meeting.dateTime")}</span>
            <DateTimePicker value={form.dateTime} onChange={(v) => setForm({ ...form, dateTime: v })} ar={ar} />
          </div>

          <button className="btn" disabled={busy} style={{ marginTop: 22, width: "100%" }}>
            {busy ? t("common.loading") : t("meeting.create")}
          </button>
          {msg && <p style={{ marginTop: 12, textAlign: "center", fontWeight: 600 }}>{msg}</p>}
        </form>
      </section>
      )}

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
                {canHost && (
                <button className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => setMinutesFor(minutesFor === m.id ? null : m.id)}>
                  {t("meeting.recordMinutes")}
                </button>
                )}
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
