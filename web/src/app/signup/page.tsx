"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import Logo from "@/components/Logo";
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
  const isRTL = locale === "ar";
  const passwordStrength = checkPasswordStrength(password);
  const strengthLabel = strengthLabels[locale as "ar" | "en"][passwordStrength];
  const strengthColor = strengthColors[passwordStrength];

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMsgType("error");
      setMsg(locale === "ar" ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل" : "Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await call("registerCompany", {
        companyName,
        adminEmail: email,
        adminPassword: password,
        contactEmail: email,
      });
      setMsgType("success");
      setMsg(locale === "ar" ? "تم إنشاء الشركة! جارٍ تسجيل الدخول..." : "Company created! Signing in...");
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: any) {
      setMsgType("error");
      const m = err?.message || String(err);
      setMsg(`${t("common.error")}: ${m}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authContainer} dir={isRTL ? "rtl" : "ltr"}>
      <div className={styles.formCard}>
        <div className={styles.logoContainer}>
          <Logo size="md" />
        </div>

        <h2 className={styles.formTitle}>
          {locale === "ar" ? "إنشاء شركة" : "Create Company"}
        </h2>

        <form onSubmit={register} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="companyName" className={styles.label}>
              {locale === "ar" ? "اسم الشركة" : "Company Name"}
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={locale === "ar" ? "شركتي للاستثمار" : "My Company Inc."}
              required
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              {locale === "ar" ? "البريد الإلكتروني للمدير" : "Admin Email"}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              required
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              {locale === "ar" ? "كلمة المرور" : "Password"}
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className={styles.input}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={styles.passwordToggle}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (locale === "ar" ? "إخفاء" : "Hide") : (locale === "ar" ? "عرض" : "Show")}
              </button>
            </div>
            {password && (
              <div className={styles.strengthMeter}>
                <div className={styles.strengthBar}>
                  <div
                    className={styles.strengthFill}
                    style={{
                      width: passwordStrength === "weak" ? "33%" : passwordStrength === "good" ? "66%" : "100%",
                      backgroundColor: strengthColor,
                    }}
                  />
                </div>
                <span className={styles.strengthLabel} style={{ color: strengthColor }}>
                  {locale === "ar" ? "قوة: " : "Strength: "} {strengthLabel}
                </span>
              </div>
            )}
          </div>

          {msg && <p className={msgType === "error" ? styles.error : styles.success}>{msg}</p>}

          <button type="submit" disabled={busy} className={styles.submitButton}>
            {busy ? t("common.loading") : (locale === "ar" ? "إنشاء الشركة" : "Create Company")}
            <span className={styles.arrow}>→</span>
          </button>
        </form>

        <p className={styles.signupText}>
          {locale === "ar" ? "لديك حساب بالفعل؟ " : "Already have an account? "}
          <a href="/auth" className={styles.signupLink}>
            {locale === "ar" ? "سجّل الدخول" : "Sign in"}
          </a>
        </p>

        <footer className={styles.footer}>
          <a href="#">{locale === "ar" ? "الشروط" : "Terms"}</a>
          <span>·</span>
          <a href="#">{locale === "ar" ? "الخصوصية" : "Privacy"}</a>
        </footer>
      </div>
    </main>
  );
}
