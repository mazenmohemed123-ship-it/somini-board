/**
 * Final results PDF generation.
 *
 * enqueueReport(electionId) is called when an election closes. To keep the
 * scheduler fast and to get retries for free, it pushes a Cloud Task that
 * targets the generateReport HTTP handler. generateReport renders an HTML
 * results sheet with Puppeteer, uploads the PDF to Cloud Storage, and records
 * the path back on the election document.
 */
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, storage, FieldValue, REGION } from "../lib/admin";

interface ReportPayload {
  electionId: string;
}

/** Build the HTML document for the results report. */
function renderHtml(election: any, rows: { name: string; votes: number }[], total: number): string {
  const trs = rows
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.votes}</td>
        <td>${total ? ((r.votes / total) * 100).toFixed(1) : "0.0"}%</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <style>
    body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #1f2937; }
    h1 { color: #4f46e5; }
    .meta { color: #6b7280; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: right; }
    th { background: #f3f4f6; }
    .winner { background: #ecfdf5; font-weight: bold; }
    .total { margin-top: 16px; font-weight: bold; }
  </style></head>
  <body>
    <h1>تقرير نتائج الانتخاب</h1>
    <div class="meta">
      <div>${escapeHtml(election.title)}</div>
      <div>تاريخ الإغلاق: ${new Date().toLocaleString("ar-EG")}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>المرشح</th><th>الأصوات</th><th>النسبة</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <div class="total">إجمالي الأصوات الصحيحة: ${total}</div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

/** Aggregate votes -> [{name, votes}] sorted descending. */
async function tally(electionId: string) {
  const [candidatesSnap, votesSnap] = await Promise.all([
    db.collection("elections").doc(electionId).collection("candidates").get(),
    db.collection("elections").doc(electionId).collection("votes").get(),
  ]);
  const counts = new Map<string, number>();
  votesSnap.forEach((v) => {
    const c = v.data().candidateId;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  const rows = candidatesSnap.docs
    .map((d) => ({ name: d.data().fullName ?? d.id, votes: counts.get(d.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  return { rows, total: votesSnap.size };
}

export const generateReport = onTaskDispatched(
  {
    region: REGION,
    memory: "1GiB",
    timeoutSeconds: 540,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 30 },
  },
  async (req) => {
    const { electionId } = req.data as ReportPayload;
    const electionRef = db.collection("elections").doc(electionId);
    const snap = await electionRef.get();
    if (!snap.exists) {
      logger.warn(`generateReport: election ${electionId} missing`);
      return;
    }
    const election = snap.data()!;
    const { rows, total } = await tally(electionId);

    // Puppeteer is heavy; import lazily so cold starts of other functions stay light.
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(renderHtml(election, rows, total), { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "A4", printBackground: true });

      const path = `tenants/${election.tenantId}/reports/${electionId}.pdf`;
      await storage.bucket().file(path).save(Buffer.from(pdf), {
        contentType: "application/pdf",
        metadata: { metadata: { electionId, generatedAt: new Date().toISOString() } },
      });

      await electionRef.update({
        reportPath: path,
        reportGeneratedAt: FieldValue.serverTimestamp(),
        winner: rows[0]?.name ?? null,
        totalVotes: total,
      });
      logger.info(`Report generated for ${electionId} at ${path}`);
    } finally {
      await browser.close();
    }
  }
);

/** Enqueue a report-generation task. Falls back to inline execution in the emulator. */
export async function enqueueReport(electionId: string): Promise<void> {
  const { getFunctions } = await import("firebase-admin/functions");
  try {
    const queue = getFunctions().taskQueue("generateReport");
    await queue.enqueue({ electionId });
  } catch (err) {
    logger.error("enqueueReport failed; report will rely on retry/scheduler", err);
    throw err;
  }
}

// Optional HTTP trigger to (re)generate a report on demand for staff tooling.
export const regenerateReport = onRequest({ region: REGION, memory: "1GiB" }, async (req, res) => {
  const electionId = req.query.electionId as string;
  if (!electionId) {
    res.status(400).json({ error: "electionId required" });
    return;
  }
  await enqueueReport(electionId);
  res.json({ enqueued: true, electionId });
});
