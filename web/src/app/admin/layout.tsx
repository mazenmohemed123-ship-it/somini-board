"use client";

/**
 * Admin (platform-owner) area layout. Gates every /admin route behind the
 * `superAdmin` role claim — no other user (companyAdmin, employee, voter…)
 * can see or use these pages. Unauthenticated users are sent to sign in.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/i18n";
import { AdminNav } from "@/components/AdminNav";

type GateState = "checking" | "allowed" | "denied" | "anon";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        if (!u) {
          setState("anon");
          return;
        }
        // Force-refresh so a freshly granted superAdmin claim is picked up.
        const token = await u.getIdTokenResult(true);
        setState(token.claims.role === "superAdmin" ? "allowed" : "denied");
      }),
    []
  );

  useEffect(() => {
    if (state === "anon") router.replace("/auth");
  }, [state, router]);

  if (state === "checking" || state === "anon") {
    return (
      <main className="container" style={{ paddingTop: 80, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>{t("common.loading")}</p>
      </main>
    );
  }

  if (state === "denied") {
    return (
      <main className="container" style={{ paddingTop: 80, textAlign: "center" }}>
        <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.3rem" }}>🔒 {t("admin.accessDenied")}</h1>
          <a className="btn" href="/dashboard" style={{ marginTop: 16 }}>
            {t("nav.dashboard")}
          </a>
        </div>
      </main>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <AdminNav />
      {children}
    </div>
  );
}
