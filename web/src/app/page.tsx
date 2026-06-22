"use client";

import Link from "next/link";
import { useI18n, LOCALES } from "@/i18n";

export default function Home() {
  const { t, setLocale, locale } = useI18n();
  return (
    <main className="container">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ color: "var(--primary)" }}>{t("app.name")}</h1>
        <select value={locale} onChange={(e) => setLocale(e.target.value as any)} style={{ width: "auto" }}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
      </header>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>{t("app.tagline")}</h2>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>
          Firebase · Identity Platform Tenants · Cloud Functions · Firestore · Jitsi · Paymob
        </p>
        <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="btn" href="/dashboard">
            {t("nav.dashboard")}
          </Link>
          <Link className="btn btn-outline" href="/dashboard/integrations">
            {t("nav.integrations")}
          </Link>
        </div>
      </section>
    </main>
  );
}
