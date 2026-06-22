"use client";

/**
 * Auth page. Simple sign-in for company staff. Voters sign in via the
 * registerVoter flow which mints a custom token.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/i18n";

export default function AuthPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/dashboard");
    });
    return unsub;
  }, [router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <div style={{ maxWidth: 400, margin: "60px auto" }}>
        <h1 style={{ textAlign: "center", marginBottom: 32 }}>{t("app.name")}</h1>

        <form className="card" onSubmit={signIn}>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%", marginTop: 20 }}>
            {busy ? t("common.loading") : "دخول"}
          </button>
          {msg && <p style={{ marginTop: 12, color: "crimson" }}>{msg}</p>}
        </form>
      </div>
    </main>
  );
}
