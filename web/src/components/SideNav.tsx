"use client";

/**
 * Reusable slide-in side navigation. A hamburger on the bar opens a drawer
 * (from the inline-start edge — right in RTL) with the links, theme switcher,
 * language picker and logout. Shared by the dashboard and admin areas.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n, LOCALES } from "@/i18n";
import Logo from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import styles from "./SideNav.module.css";

export interface NavLink {
  href: string;
  label: string;
  icon: string;
}

export function SideNav({
  links,
  title,
  dark = false,
  homeHref = "/dashboard",
}: {
  links: NavLink[];
  title: string;
  dark?: boolean;
  homeHref?: string;
}) {
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on route change and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === homeHref ? pathname === homeHref : pathname.startsWith(href);

  return (
    <>
      <div className={`${styles.bar} ${dark ? styles.barDark : ""}`}>
        <button
          className={styles.hamburger}
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>
        <Link href={homeHref} className={styles.barTitle}>
          <Logo size="sm" variant={dark ? "white" : "color"} />
        </Link>
        <div className={styles.spacer} />
        <ThemeSwitcher compact />
      </div>

      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} aria-hidden={!open}>
        <div className={styles.drawerHead}>
          <Logo size="sm" />
          <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav className={styles.links}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`${styles.link} ${isActive(l.href) ? styles.linkActive : ""}`}
            >
              <span className={styles.linkIcon} aria-hidden>
                {l.icon}
              </span>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.drawerFoot}>
          <div className={styles.footRow}>
            <ThemeSwitcher />
            <select
              className={styles.localeSelect}
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            className={styles.logout}
            onClick={async () => {
              await signOut(auth);
              router.replace("/auth");
            }}
          >
            {locale === "ar" ? "تسجيل الخروج" : "Log out"}
          </button>
        </div>
      </aside>
    </>
  );
}
