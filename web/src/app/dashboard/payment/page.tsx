"use client";

/**
 * Payment page. A companyAdmin can:
 *   - Subscribe monthly/yearly (createPaymentIntent -> Paymob iframe)
 *   - Pay per-meeting for a draft election
 * After successful payment the Paymob webhook updates the subscription or
 * election payment status, and the UI reflects that.
 */
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient, functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Subscription {
  plan: string;
  endDate: any;
  status: string;
}

export default function PaymentPage() {
  const { t } = useI18n();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [purpose, setPurpose] = useState<"subscription_monthly" | "subscription_yearly" | "meeting_fee">(
    "subscription_monthly"
  );
  const [electionId, setElectionId] = useState("");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        const token = u ? await u.getIdTokenResult() : null;
        setCompanyId((token?.claims as any)?.companyId ?? null);
      }),
    []
  );

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(dbClient, "subscriptions"), where("companyId", "==", companyId));
    return onSnapshot(q, (snap) => {
      setSubscription(snap.docs[0]?.data() as Subscription | null);
    });
  }, [companyId]);

  async function initiatePayment() {
    setBusy(true);
    setMsg("");
    setIframeUrl(null);
    try {
      const call = httpsCallable(functions, "createPaymentIntent");
      const data = {
        purpose,
        ...(purpose === "meeting_fee" && { electionId }),
      };
      const res: any = await call(data);
      setIframeUrl(res.data.iframeUrl);
      setMsg(`💰 ${res.data.amount / 100} ${res.data.currency} (Tier: ${res.data.tier})`);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>{t("payment.title")}</h1>

      {subscription && (
        <section className="card" style={{ marginTop: 16, background: "#ecfdf5" }}>
          <h2>✓ {t("payment.subscribe")}</h2>
          <p>
            Plan: <strong>{subscription.plan}</strong>
            <br />
            {t("common.loading")}:{" "}
            <strong>
              {subscription.endDate?.toDate?.().toLocaleDateString?.("ar-EG") || "—"}
            </strong>
          </p>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{subscription ? "الترقية / الاشتراك الإضافي" : t("payment.subscribe")}</h2>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>
            نوع الدفع
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as any)}
              disabled={busy}
            >
              <option value="subscription_monthly">اشتراك شهري</option>
              <option value="subscription_yearly">اشتراك سنوي</option>
              <option value="meeting_fee">رسوم اجتماع واحد</option>
            </select>
          </label>
          {purpose === "meeting_fee" && (
            <label>
              معرّف الانتخاب
              <input
                value={electionId}
                onChange={(e) => setElectionId(e.target.value)}
                placeholder="uuid..."
              />
            </label>
          )}
        </div>
        <button className="btn" onClick={initiatePayment} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? t("common.loading") : "ادفع الآن"}
        </button>
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>

      {iframeUrl && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Paymob Checkout</h2>
          <iframe
            src={iframeUrl}
            width="100%"
            height={600}
            frameBorder="0"
            style={{ borderRadius: 12 }}
          />
        </section>
      )}
    </main>
  );
}
