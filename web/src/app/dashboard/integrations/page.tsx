"use client";

/**
 * Connected apps screen. Lists the company's registered integrations (name +
 * logo + status) and lets an admin register a new one. The API key is returned
 * exactly once by createIntegration and shown in a copy-once banner.
 */
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient, functions } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Integration {
  id: string;
  appName: string;
  appLogo?: string;
  status: "active" | "disabled";
}

export default function IntegrationsPage() {
  const { t } = useI18n();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [items, setItems] = useState<Integration[]>([]);
  const [appName, setAppName] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

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
    const q = query(collection(dbClient, "integrations"), where("companyId", "==", companyId));
    return onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [companyId]);

  async function addApp(e: React.FormEvent) {
    e.preventDefault();
    const res: any = await httpsCallable(functions, "createIntegration")({ appName, callbackUrl });
    setNewKey(res.data.apiKey);
    setAppName("");
    setCallbackUrl("");
  }

  async function toggle(it: Integration) {
    await updateDoc(doc(dbClient, "integrations", it.id), {
      status: it.status === "active" ? "disabled" : "active",
    });
  }

  return (
    <main className="container">
      <h1>{t("integrations.title")}</h1>

      {newKey && (
        <div className="card" style={{ marginTop: 16, background: "#fffbeb", borderColor: "#f59e0b" }}>
          <strong>{t("integrations.copyKeyOnce")}</strong>
          <pre style={{ marginTop: 8, overflowX: "auto" }}>{newKey}</pre>
        </div>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("integrations.add")}</h2>
        <form onSubmit={addApp}>
          <label>
            {t("integrations.appName")}
            <input value={appName} onChange={(e) => setAppName(e.target.value)} required />
          </label>
          <label>
            Callback URL
            <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://..." />
          </label>
          <button className="btn" style={{ marginTop: 16 }}>
            {t("integrations.add")}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {it.appLogo && <img src={it.appLogo} alt="" width={32} height={32} style={{ borderRadius: 6 }} />}
              <strong>{it.appName}</strong>
            </span>
            <button className="btn btn-outline" onClick={() => toggle(it)}>
              {t(`integrations.status.${it.status}`)}
            </button>
          </div>
        ))}
        {items.length === 0 && <p style={{ color: "var(--muted)" }}>—</p>}
      </section>
    </main>
  );
}
