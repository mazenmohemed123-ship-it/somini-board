/**
 * Meetings & minutes.
 *
 *  createMeeting (callable): creates a meeting tied to a committee / election /
 *      general assembly, generates a Jitsi room name, and schedules two
 *      reminder Cloud Tasks (24h and 1h before) that fan out FCM + email.
 *  sendMeetingReminder (task): delivers the reminder to participants.
 *  recordMinutes (callable): stores meeting minutes content + uploads a PDF,
 *      and tracks who signed.
 *  signMinutes (callable): an attendee signs the minutes (append-only).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { logger } from "firebase-functions/v2";
import { db, storage, messaging, FieldValue, REGION } from "../lib/admin";
import { getCaller, isStaff, canManageBranch } from "../lib/context";

interface CreateMeetingInput {
  title: string;
  dateTime: number; // epoch ms
  committeeId?: string;
  electionId?: string;
  branchId?: string;
  type?: "committee" | "election" | "general";
  participantUids?: string[]; // for reminders
}

const JITSI_PREFIX = "SomniBoard";

export const createMeeting = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const caller = getCaller(request);
  const d = request.data as CreateMeetingInput;
  if (!d.title || !d.dateTime) {
    throw new HttpsError("invalid-argument", "title and dateTime required.");
  }
  if (!isStaff(caller) && !canManageBranch(caller, d.branchId)) {
    throw new HttpsError("permission-denied", "Not allowed to create meetings.");
  }

  const ref = db.collection("meetings").doc();
  const jitsiRoom = `${JITSI_PREFIX}-${ref.id}`;
  await ref.set({
    meetingId: ref.id,
    tenantId: caller.tenantId,
    committeeId: d.committeeId ?? null,
    electionId: d.electionId ?? null,
    branchId: d.branchId ?? null,
    type: d.type ?? "general",
    title: d.title.trim(),
    dateTime: new Date(d.dateTime),
    jitsiRoom,
    jitsiUrl: `https://meet.jit.si/${jitsiRoom}`,
    minutesUrl: null,
    status: "scheduled",
    participantUids: d.participantUids ?? [],
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Schedule reminders (24h and 1h before), if those times are still future.
  try {
    const { getFunctions } = await import("firebase-admin/functions");
    const queue = getFunctions().taskQueue("sendMeetingReminder");
    const reminders = [
      { offsetMs: 24 * 3600_000, label: "24h" },
      { offsetMs: 3600_000, label: "1h" },
    ];
    for (const r of reminders) {
      const fireAt = d.dateTime - r.offsetMs;
      if (fireAt > Date.now()) {
        await queue.enqueue(
          { meetingId: ref.id, tenantId: caller.tenantId, label: r.label },
          { scheduleTime: new Date(fireAt) }
        );
      }
    }
  } catch (err) {
    logger.error("Failed to schedule meeting reminders", err);
  }

  return { meetingId: ref.id, jitsiRoom, jitsiUrl: `https://meet.jit.si/${jitsiRoom}` };
});

export const sendMeetingReminder = onTaskDispatched(
  { region: REGION, retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 } },
  async (req) => {
    const { meetingId, label } = req.data as { meetingId: string; tenantId: string; label: string };
    const snap = await db.collection("meetings").doc(meetingId).get();
    if (!snap.exists) return;
    const m = snap.data()!;
    if (m.status === "cancelled") return;

    const uids: string[] = m.participantUids ?? [];
    if (uids.length === 0) return;

    // Resolve participant emails (employees) for the Trigger Email extension.
    const emails: string[] = [];
    for (let i = 0; i < uids.length; i += 10) {
      const chunk = uids.slice(i, i + 10);
      const emps = await db
        .collection("employees")
        .where("employeeId", "in", chunk)
        .get();
      emps.forEach((e) => e.data().email && emails.push(e.data().email));
    }

    // Email via the "mail" collection (firestore-send-email extension).
    if (emails.length) {
      await db.collection("mail").add({
        to: emails,
        message: {
          subject: `تذكير بالاجتماع: ${m.title}`,
          text: `لديك اجتماع "${m.title}" في ${new Date(m.dateTime.toDate()).toLocaleString(
            "ar-EG"
          )}.\nرابط البث المباشر: ${m.jitsiUrl}`,
        },
      });
    }

    // Best-effort FCM topic push (clients subscribe to meeting-{id}).
    try {
      await messaging.send({
        topic: `meeting-${meetingId}`,
        notification: {
          title: `تذكير (${label}): ${m.title}`,
          body: "اضغط للانضمام للبث المباشر",
        },
        data: { meetingId, jitsiUrl: m.jitsiUrl },
      });
    } catch (err) {
      logger.warn(`FCM reminder skipped for ${meetingId}`, err);
    }
  }
);

export const recordMinutes = onCall({ region: REGION, enforceAppCheck: true, memory: "1GiB" }, async (request) => {
  const caller = getCaller(request);
  if (!isStaff(caller)) throw new HttpsError("permission-denied", "Company staff only.");
  const { meetingId, content } = request.data || {};
  if (!meetingId || !content) {
    throw new HttpsError("invalid-argument", "meetingId and content required.");
  }

  const meetingRef = db.collection("meetings").doc(meetingId);
  const meetingSnap = await meetingRef.get();
  if (!meetingSnap.exists || meetingSnap.data()!.tenantId !== caller.tenantId) {
    throw new HttpsError("not-found", "Meeting not found.");
  }

  // Render minutes to PDF (lazy puppeteer import).
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  let path: string;
  try {
    const page = await browser.newPage();
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#1f2937}
      h1{color:#4f46e5}pre{white-space:pre-wrap;line-height:1.8}</style></head>
      <body><h1>محضر اجتماع: ${String(meetingSnap.data()!.title)}</h1>
      <p>${new Date().toLocaleString("ar-EG")}</p><hr/><pre>${String(content)
        .replace(/</g, "&lt;")}</pre></body></html>`;
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    path = `tenants/${caller.tenantId}/minutes/${meetingId}.pdf`;
    await storage.bucket().file(path).save(Buffer.from(pdf), { contentType: "application/pdf" });
  } finally {
    await browser.close();
  }

  const minuteRef = db.collection("minutes").doc();
  await minuteRef.set({
    minuteId: minuteRef.id,
    meetingId,
    tenantId: caller.tenantId,
    content,
    pdfPath: path,
    signedBy: [],
    createdAt: FieldValue.serverTimestamp(),
  });
  await meetingRef.update({ minutesUrl: path, status: "completed" });

  return { minuteId: minuteRef.id, pdfPath: path };
});

export const signMinutes = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const caller = getCaller(request);
  const { minuteId } = request.data || {};
  if (!minuteId) throw new HttpsError("invalid-argument", "minuteId required.");
  const ref = db.collection("minutes").doc(minuteId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
    throw new HttpsError("not-found", "Minutes not found.");
  }
  await ref.update({ signedBy: FieldValue.arrayUnion(caller.uid) });
  return { ok: true };
});
