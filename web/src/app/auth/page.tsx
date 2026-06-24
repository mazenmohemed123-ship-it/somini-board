"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/i18n";
import Logo from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { GeoBackground } from "@/components/GeoBackground";
import { checkPasswordStrength, strengthLabels, strengthColors } from "@/lib/password-strength";
import styles from "./auth.module.css";

export default function AuthPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("error");
  const ar = locale === "ar";
  const isRTL = ar;
  const passwordStrength = checkPasswordStrength(password);
  const strengthLabel = strengthLabels[ar ? "ar" : "en"][passwordStrength];
  const strengthColor = strengthColors[passwordStrength];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const token = await u.getIdTokenResult();
      router.replace(token.claims.role === "superAdmin" ? "/admin" : "/dashboard");
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
      setMsgType("error");
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setMsg("");
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdTokenResult();
      if (!token.claims.role) router.replace("/signup?from=google");
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
        setGoogleBusy(false);
        return;
      }
      setMsgType("error");
      if (err?.code === "auth/operation-not-allowed" || err?.code === "auth/configuration-not-found") {
        setMsg(ar
          ? "تسجيل الدخول عبر Google غير مُفعّل. فعّله من Firebase Console → Authentication → Sign-in method → Google."
          : "Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method → Google.");
      } else {
        setMsg(`${t("common.error")}: ${err.message}`);
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <main className={styles.authContainer} dir={isRTL ? "rtl" : "ltr"}>
      {/* HERO */}
      <div className={styles.heroPanel}>
        <div className={styles.heroPhoto} />
        <GeoBackground className={styles.geo} />
        <div className={styles.heroThemeSwitch}>
          <ThemeSwitcher />
        </div>
        <div className={styles.heroContent}>
          <div className={styles.badge}>{ar ? "منصة حوكمة مؤسسية" : "Corporate Governance Platform"}</div>
          <h1 className={styles.heroHeadline}>{ar ? "أدر شركتك بثقة" : "Run Your Company with Confidence"}</h1>
          <p className={styles.heroSubtext}>
            {ar
              ? "إدارة الموظفين، الانتخابات، الاجتماعات والقرارات — من مكان واحد."
              : "Employees, elections, meetings and decisions — all from one place."}
          </p>
          <div className={styles.statsCard}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{ar ? "٣٥٠+" : "350+"}</span>
              <span className={styles.statLabel}>{ar ? "شركة" : "Companies"}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{ar ? "١.٥M+" : "1.5M+"}</span>
              <span className={styles.statLabel}>{ar ? "موظف" : "Employees"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FORM */}
      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <div className={styles.formTopBar}>
            <div className={styles.logoContainer}>
              <Logo size="md" />
            </div>
            <ThemeSwitcher compact />
          </div>

          <h2 className={styles.formTitle}>{ar ? "تسجيل الدخول" : "Sign In"}</h2>

          <form onSubmit={signIn} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>{ar ? "البريد الإلكتروني" : "Email"}</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>{ar ? "كلمة المرور" : "Password"}</label>
              <div className={styles.passwordWrapper}>
                <input id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={styles.input} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle}
                  aria-label="toggle">{showPassword ? (ar ? "إخفاء" : "Hide") : (ar ? "عرض" : "Show")}</button>
              </div>
              {password && (
                <div className={styles.strengthMeter}>
                  <div className={styles.strengthBar}>
                    <div className={styles.strengthFill} style={{
                      width: passwordStrength === "weak" ? "33%" : passwordStrength === "good" ? "66%" : "100%",
                      backgroundColor: strengthColor }} />
                  </div>
                  <span className={styles.strengthLabel} style={{ color: strengthColor }}>
                    {ar ? "قوة: " : "Strength: "}{strengthLabel}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.formRow}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className={styles.checkbox} />
                <span>{ar ? "تذكرني" : "Remember me"}</span>
              </label>
              <a href="#" className={styles.link}>{ar ? "هل نسيت كلمة المرور؟" : "Forgot password?"}</a>
            </div>

            {msg && <p className={msgType === "error" ? styles.error : styles.success}>{msg}</p>}

            <button type="submit" disabled={busy || googleBusy} className={styles.submitButton}>
              {busy ? t("common.loading") : (ar ? "دخول" : "Sign In")}
              <span className={styles.arrow}>→</span>
            </button>
          </form>

          <div className={styles.dividerWithText}><span>{ar ? "أو" : "OR"}</span></div>

          <button type="button" onClick={signInWithGoogle} disabled={googleBusy || busy} className={styles.googleButton}>
            <svg className={styles.googleIcon} viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {googleBusy ? t("common.loading") : "Google"}
          </button>

          <p className={styles.signupText}>
            {ar ? "ليس لديك حساب؟ " : "Don't have an account? "}
            <a href="/signup" className={styles.signupLink}>{ar ? "أنشئ شركتك" : "Create your company"}</a>
          </p>

          <footer className={styles.footer}>
            <a href="#">{ar ? "الشروط" : "Terms"}</a><span>·</span>
            <a href="#">{ar ? "الخصوصية" : "Privacy"}</a>
          </footer>
        </div>
      </div>
    </main>
  );
}
