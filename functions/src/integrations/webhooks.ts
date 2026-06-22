/**
 * Outbound webhooks to connected apps.
 *
 * When an election ends we notify every active integration in that company via
 * its callback URL. Delivery goes through Cloud Tasks (deliverWebhook) so each
 * call is retried with backoff and signed with the integration's secret.
 */
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { logger } from "firebase-functions/v2";
import { createHmac } from "crypto";
import { db, REGION } from "../lib/admin";

interface WebhookPayload {
  integrationId: string;
  callbackUrl: string;
  signingSecret: string;
  event: string;
  data: Record<string, unknown>;
}

/** Find active integrations for a company and enqueue a delivery task each. */
export async function dispatchElectionEndedWebhooks(
  electionId: string,
  tenantId: string,
  companyId: string | null
): Promise<void> {
  if (!companyId) return;
  const integrations = await db
    .collection("integrations")
    .where("companyId", "==", companyId)
    .where("status", "==", "active")
    .get();
  if (integrations.empty) return;

  // Aggregate the results once.
  const electionRef = db.collection("elections").doc(electionId);
  const [candidates, votes] = await Promise.all([
    electionRef.collection("candidates").get(),
    electionRef.collection("votes").get(),
  ]);
  const counts = new Map<string, number>();
  votes.forEach((v) => counts.set(v.data().candidateId, (counts.get(v.data().candidateId) ?? 0) + 1));
  const results = candidates.docs.map((c) => ({
    candidateId: c.id,
    name: c.data().fullName,
    votes: counts.get(c.id) ?? 0,
  }));

  const { getFunctions } = await import("firebase-admin/functions");
  const queue = getFunctions().taskQueue("deliverWebhook");

  await Promise.all(
    integrations.docs
      .filter((d) => d.data().callbackUrl)
      .map((d) =>
        queue.enqueue({
          integrationId: d.id,
          callbackUrl: d.data().callbackUrl,
          signingSecret: d.data().signingSecret ?? "",
          event: "election.ended",
          data: { electionId, tenantId, totalVotes: votes.size, results },
        } as WebhookPayload)
      )
  );
  logger.info(`Enqueued ${integrations.size} webhook(s) for election ${electionId}`);
}

export const deliverWebhook = onTaskDispatched(
  {
    region: REGION,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 30, maxBackoffSeconds: 3600 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const p = req.data as WebhookPayload;
    const body = JSON.stringify({ event: p.event, data: p.data, sentAt: Date.now() });
    const signature = p.signingSecret
      ? createHmac("sha256", p.signingSecret).update(body).digest("hex")
      : "";

    const res = await fetch(p.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Somni-Event": p.event,
        "X-Somni-Signature": signature,
      },
      body,
    });
    if (!res.ok) {
      // Throwing makes Cloud Tasks retry per retryConfig.
      throw new Error(`Webhook ${p.integrationId} returned ${res.status}`);
    }
    logger.info(`Webhook delivered to ${p.integrationId} (${res.status})`);
  }
);
