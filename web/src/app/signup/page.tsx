"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import Logo from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { GeoBackground } from "@/components/GeoBackground";
import { checkPasswordStrength, strengthLabels, strengthColors } from "@/lib/password-strength";
import styles from "../auth/auth.module.css";

export default function SignupPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("error");
  const ar = locale === "ar";
  const isRTL = ar;
  const passwordStrength = checkPasswordStrength(password);
  const strengthLabel = strengthLabels[ar ? "ar" : "en"][passwordStrength];
  const strengthColor = strengthColors[passwordStrength];

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMsgType("error");
      setMsg(ar ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل" : "Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await call("registerCompany", { companyName, adminEmail: email, adminPassword: password, contactEmail: email });
      setMsgType("success");
      setMsg(ar ? "تم إنشاء الشركة! جارٍ تسجيل الدخول..." : "Company created! Signing in...");
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: any) {
      setMsgType("error");
      setMsg(`${t("common.error")}: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
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
          <div className={styles.badge}>{ar ? "ابدأ مجاناً" : "Start for free"}</div>
          <h1 className={styles.heroHeadline}>{ar ? "أنشئ شركتك في دقيقة" : "Create your company in a minute"}</h1>
          <p className={styles.heroSubtext}>
            {ar
              ? "سجّل شركتك وأدر كل شيء بنفسك — موظفين، انتخابات، اجتماعات وقرارات."
              : "Register your company and run everything yourself — employees, elections, meetings, decisions."}
          </p>
          <div className={styles.statsCard}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{ar ? "مجاناً" : "Free"}</span>
              <span className={styles.statLabel}>{ar ? "خطة البداية" : "Starter plan"}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNumber}>∞</span>
              <span className={styles.statLabel}>{ar ? "موظفين" : "Employees"}</span>
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

          <h2 className={styles.formTitle}>{ar ? "إنشاء شركة" : "Create Company"}</h2>

          <form onSubmit={register} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="companyName" className={styles.label}>{ar ? "اسم الشركة" : "Company Name"}</label>
              <input id="companyName" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder={ar ? "شركتي للاستثمار" : "My Company Inc."} required className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>{ar ? "البريد الإلكتروني للمدير" : "Admin Email"}</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com" required className={styles.input} />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>{ar ? "كلمة المرور" : "Password"}</label>
              <div className={styles.passwordWrapper}>
                <input id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} className={styles.input} />
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

            {msg && <p className={msgType === "error" ? styles.error : styles.success}>{msg}</p>}

            <button type="submit" disabled={busy} className={styles.submitButton}>
              {busy ? t("common.loading") : (ar ? "إنشاء الشركة" : "Create Company")}
              <span className={styles.arrow}>→</span>
            </button>
          </form>

          <p className={styles.signupText}>
            {ar ? "لديك حساب بالفعل؟ " : "Already have an account? "}
            <a href="/auth" className={styles.signupLink}>{ar ? "سجّل الدخول" : "Sign in"}</a>
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
