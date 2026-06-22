/**
 * Paymob integration.
 *
 *  createPaymentIntent (callable): builds a Paymob payment and returns an
 *  iframe token the client renders. Flow: auth token -> order -> payment key.
 *  Secrets (API key, integration id, iframe id, HMAC) come from Secret Manager.
 *
 *  paymobWebhook (HTTP): receives the transaction callback, verifies the HMAC
 *  signature, then activates the subscription or marks the meeting fee paid.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { createHmac } from "crypto";
import { db, FieldValue, REGION } from "../lib/admin";
import { getSecret } from "../lib/secrets";
import { resolvePricing } from "./pricing";

const PAYMOB_BASE = "https://accept.paymob.com/api";

interface CreateIntentData {
  purpose: "subscription_monthly" | "subscription_yearly" | "meeting_fee";
  electionId?: string;
}

async function paymobAuth(): Promise<string> {
  const apiKey = await getSecret("PAYMOB_API_KEY");
  const res = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) throw new HttpsError("internal", "Paymob auth failed.");
  return (await res.json()).token;
}

const PAYMOB_SECRETS = ["PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID", "PAYMOB_HMAC"];

export const createPaymentIntent = onCall(
  { region: REGION, enforceAppCheck: true, secrets: PAYMOB_SECRETS },
  async (request) => {
    const { auth, rawRequest } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
    if (auth.token.role !== "companyAdmin") {
      throw new HttpsError("permission-denied", "Only company admins may pay.");
    }
    const companyId = (auth.token as any).companyId;
    const tenantId = auth.token.firebase?.tenant ?? (auth.token as any).tenantId;
    const d = request.data as CreateIntentData;

    const ip =
      (rawRequest.headers["x-forwarded-for"] as string) || rawRequest.socket?.remoteAddress;
    const { prices, tier, suspectedProxy } = resolvePricing(ip);

    let amount: number;
    if (d.purpose === "subscription_monthly") amount = prices.monthly;
    else if (d.purpose === "subscription_yearly") amount = prices.yearly;
    else amount = prices.meetingFee;

    // 1) auth token
    const token = await paymobAuth();
    const integrationId = Number(await getSecret("PAYMOB_INTEGRATION_ID"));
    const iframeId = await getSecret("PAYMOB_IFRAME_ID");

    // 2) order
    const orderRes = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: false,
        amount_cents: amount,
        currency: prices.currency,
        items: [],
      }),
    });
    if (!orderRes.ok) throw new HttpsError("internal", "Paymob order failed.");
    const order = await orderRes.json();

    // 3) payment key (used by the iframe)
    const keyRes = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: amount,
        expiration: 3600,
        order_id: order.id,
        currency: prices.currency,
        integration_id: integrationId,
        billing_data: {
          email: auth.token.email ?? "billing@somni.board",
          first_name: "Company",
          last_name: "Admin",
          phone_number: "+200000000000",
          country: "EG",
          city: "NA",
          street: "NA",
          building: "NA",
          floor: "NA",
          apartment: "NA",
        },
      }),
    });
    if (!keyRes.ok) throw new HttpsError("internal", "Paymob payment key failed.");
    const paymentToken = (await keyRes.json()).token;

    // Persist a pending intent the webhook will reconcile against order id.
    const intentRef = db.collection("paymentIntents").doc(String(order.id));
    await intentRef.set({
      orderId: order.id,
      companyId: companyId ?? null,
      tenantId: tenantId ?? null,
      amount,
      currency: prices.currency,
      tier,
      suspectedProxy: !!suspectedProxy,
      purpose: d.purpose,
      electionId: d.electionId ?? null,
      status: "pending",
      createdBy: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
      orderId: order.id,
      amount,
      currency: prices.currency,
      tier,
    };
  }
);

/** Verify Paymob HMAC over the canonical ordered field list. */
function verifyHmac(obj: any, hmacSecret: string, provided: string): boolean {
  const ordered = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
    "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];
  const concat = ordered
    .map((path) => path.split(".").reduce((o, k) => (o == null ? "" : o[k]), obj))
    .join("");
  const digest = createHmac("sha512", hmacSecret).update(concat).digest("hex");
  return digest === provided;
}

export const paymobWebhook = onRequest({ region: REGION, secrets: PAYMOB_SECRETS }, async (req, res) => {
  try {
    const hmacSecret = await getSecret("PAYMOB_HMAC");
    const provided = (req.query.hmac as string) || "";
    const obj = req.body?.obj ?? req.body;
    if (!verifyHmac(obj, hmacSecret, provided)) {
      logger.warn("Paymob webhook HMAC mismatch");
      res.status(403).send("invalid hmac");
      return;
    }

    const orderId = String(obj?.order?.id);
    const success = obj?.success === true || obj?.success === "true";
    const intentRef = db.collection("paymentIntents").doc(orderId);
    const intentSnap = await intentRef.get();
    if (!intentSnap.exists) {
      res.status(404).send("unknown order");
      return;
    }
    const intent = intentSnap.data()!;

    await intentRef.update({
      status: success ? "paid" : "failed",
      paymobTransactionId: obj?.id ?? null,
      processedAt: FieldValue.serverTimestamp(),
    });

    if (success) {
      if (intent.purpose.startsWith("subscription")) {
        const months = intent.purpose === "subscription_yearly" ? 12 : 1;
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);
        await db.collection("subscriptions").doc(intent.companyId).set(
          {
            companyId: intent.companyId,
            tenantId: intent.tenantId,
            plan: intent.purpose,
            startDate: start,
            endDate: end,
            status: "active",
            paymentMethod: "paymob",
            orderId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else if (intent.purpose === "meeting_fee" && intent.electionId) {
        await db.collection("elections").doc(intent.electionId).update({
          paymentStatus: "paid",
          paidOrderId: orderId,
        });
      }
    }

    res.status(200).send("ok");
  } catch (err) {
    logger.error("paymobWebhook error", err);
    res.status(500).send("error");
  }
});
