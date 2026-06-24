"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n } from "@/i18n";
import Logo from "@/components/Logo";
import styles from "./auth.module.css";

export default function AuthPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isRTL = locale === "ar";

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
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authContainer} dir={isRTL ? "rtl" : "ltr"}>
      {/* Left Panel - Hero Section */}
      <div className={styles.heroPanel}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            منصة حوكمة مؤسسية
          </div>
          <h1 className={styles.heroHeadline}>
            أدر شركتك بثقة
          </h1>
          <p className={styles.heroSubtext}>
            منصة متكاملة لإدارة الموظفين والانتخابات والاجتماعات والقرارات
          </p>
          <div className={styles.statsCard}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>٣٥٠+</span>
              <span className={styles.statLabel}>شركة</span>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>١.٥M+</span>
              <span className={styles.statLabel}>موظف</span>
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

          <h2 className={styles.formTitle}>تسجيل الدخول</h2>

          <form onSubmit={signIn} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
                required
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>
                كلمة المرور
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={styles.input}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.passwordToggle}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "إخفاء" : "عرض"}
                </button>
              </div>
            </div>

            <div className={styles.formRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>تذكرني</span>
              </label>
              <a href="#" className={styles.link}>
                هل نسيت كلمة المرور؟
              </a>
            </div>

            {msg && <p className={styles.error}>{msg}</p>}

            <button
              type="submit"
              disabled={busy}
              className={styles.submitButton}
            >
              {busy ? t("common.loading") : "دخول"}
              <span className={styles.arrow}>➔</span>
            </button>
          </form>

          <div className={styles.divider}></div>

          <p className={styles.signupText}>
            ليس لديك حساب؟{" "}
            <a href="/signup" className={styles.signupLink}>
              أنشئ حساب جديد
            </a>
          </p>

          <footer className={styles.footer}>
            <a href="#">حقوق النشر © ٢٠٢٦</a>
            <span>·</span>
            <a href="#">الشروط والأحكام</a>
            <span>·</span>
            <a href="#">سياسة الخصوصية</a>
          </footer>
        </div>
      </div>
    </main>
  );
}
