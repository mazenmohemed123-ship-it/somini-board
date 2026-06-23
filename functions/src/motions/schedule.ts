/**
 * closeExpiredMotions — scheduled (every 5 min). Flips active motions whose
 * endDate has passed to "ended" so results become final. Activation is manual
 * (publishMotion), but closing is automatic.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db, FieldValue, REGION } from "../lib/admin";

export const closeExpiredMotions = onSchedule(
  { region: REGION, schedule: "every 5 minutes" },
  async () => {
    const now = new Date();
    const expired = await db
      .collection("motions")
      .where("status", "==", "active")
      .where("endDate", "<=", now)
      .get();
    for (const doc of expired.docs) {
      await doc.ref.update({ status: "ended", endedAt: FieldValue.serverTimestamp() });
      logger.info(`Motion ${doc.id} -> ended`);
    }
  }
);
