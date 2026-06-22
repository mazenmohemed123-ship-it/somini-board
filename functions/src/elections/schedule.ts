/**
 * openCloseElections — scheduled (every 1 min). Flips elections to "active"
 * when startDate passes and to "ended" when endDate passes. Status transitions
 * happen here (Admin SDK) rather than on the client so they can't be forged.
 * On close it enqueues report generation + integration webhooks.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db, FieldValue, REGION } from "../lib/admin";
import { enqueueReport } from "../results/pdf";
import { dispatchElectionEndedWebhooks } from "../integrations/webhooks";

export const openCloseElections = onSchedule(
  { region: REGION, schedule: "every 1 minutes", timeoutSeconds: 120 },
  async () => {
    const now = new Date();

    // Open: draft elections whose start time has arrived.
    const toOpen = await db
      .collection("elections")
      .where("status", "==", "draft")
      .where("startDate", "<=", now)
      .get();

    for (const doc of toOpen.docs) {
      const data = doc.data();
      if (data.endDate.toDate() <= now) continue; // already past, will be closed below
      await doc.ref.update({ status: "active", activatedAt: FieldValue.serverTimestamp() });
      logger.info(`Election ${doc.id} -> active`);
    }

    // Close: active elections whose end time has passed.
    const toClose = await db
      .collection("elections")
      .where("status", "==", "active")
      .where("endDate", "<=", now)
      .get();

    for (const doc of toClose.docs) {
      await doc.ref.update({ status: "ended", endedAt: FieldValue.serverTimestamp() });
      logger.info(`Election ${doc.id} -> ended`);
      try {
        await enqueueReport(doc.id);
        await dispatchElectionEndedWebhooks(doc.id, doc.data().tenantId, doc.data().companyId);
      } catch (err) {
        logger.error(`Post-close tasks failed for ${doc.id}`, err);
      }
    }
  }
);
