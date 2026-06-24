"use client";

/**
 * Self-service company registration. Any visitor can create their company and
 * become its first companyAdmin. Calls the public `registerCompany` callable,
 * then signs the new admin in automatically and routes to the dashboard.
 */
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
      setMsg(locale === "ar" ? "تم إنشاء الشركة بنجاح! جارٍ تسجيل الدخول..." : "Company created! Signing you in...");
      // Auto sign-in the new admin and route to the dashboard.
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
      {/* Left Panel - Hero */}
      <div className={styles.heroPanel}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            {locale === "ar" ? "ابدأ مجاناً" : "Start for free"}
          </div>
          <h1 className={styles.heroHeadline}>
            {locale === "ar" ? "أنشئ شركتك في دقيقة" : "Create your company in a minute"}
          </h1>
          <p className={styles.heroSubtext}>
            {locale === "ar"
              ? "سجّل شركتك وأدر الموظفين والانتخابات والاجتماعات والقرارات من مكان واحد"
              : "Register your company and manage employees, elections, meetings and decisions from one place"}
          </p>
          <div className={styles.statsCard}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{locale === "ar" ? "مجاناً" : "Free"}</span>
              <span className={styles.statLabel}>{locale === "ar" ? "خطة البداية" : "Starter plan"}</span>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>∞</span>
              <span className={styles.statLabel}>{locale === "ar" ? "موظفين" : "Employees"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <div className={styles.logoContainer}>
            <Logo size="md" />
          </div>

          <h2 className={styles.formTitle}>
            {locale === "ar" ? "تسجيل شركة جديدة" : "Register a new company"}
          </h2>

          <form onSubmit={register} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="companyName" className={styles.label}>
                {locale === "ar" ? "اسم الشركة" : "Company name"}
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
                {locale === "ar" ? "البريد الإلكتروني للمدير" : "Admin email"}
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
              {busy ? t("common.loading") : (locale === "ar" ? "إنشاء الشركة" : "Create company")}
              <span className={styles.arrow}>➔</span>
            </button>
          </form>

          <div className={styles.divider}></div>

          <p className={styles.signupText}>
            {locale === "ar" ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
            <a href="/auth" className={styles.signupLink}>
              {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
            </a>
          </p>

          <footer className={styles.footer}>
            <a href="#">{locale === "ar" ? "حقوق النشر © ٢٠٢٦" : "Copyright © 2026"}</a>
            <span>·</span>
            <a href="#">{locale === "ar" ? "الشروط والأحكام" : "Terms"}</a>
            <span>·</span>
            <a href="#">{locale === "ar" ? "سياسة الخصوصية" : "Privacy"}</a>
          </footer>
        </div>
      </div>
    </main>
  );
}
