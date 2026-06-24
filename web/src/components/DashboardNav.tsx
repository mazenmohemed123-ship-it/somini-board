"use client";

/** Shared top navigation for the dashboard area. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n, LOCALES } from "@/i18n";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/dashboard/employees", key: "nav.employees" },
  { href: "/dashboard/branches", key: "nav.branches" },
  { href: "/dashboard/committees", key: "nav.committees" },
  { href: "/dashboard/elections", key: "nav.elections" },
  { href: "/dashboard/motions", key: "nav.motions" },
  { href: "/dashboard/meetings", key: "nav.meetings" },
  { href: "/dashboard/integrations", key: "nav.integrations" },
];

export function DashboardNav() {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 0",
        marginBottom: 8,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "0 24px" }}
      >
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size="sm" />
        </Link>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href !== "/dashboard" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.9rem",
                  background: active ? "#eef2ff" : "transparent",
                  color: active ? "var(--primary)" : "var(--text)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {t(l.key)}
              </Link>
            );
          })}
        </div>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as any)}
          style={{ width: "auto", padding: "4px 8px" }}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={() => signOut(auth)}>
          {t("nav.logout")}
        </button>
      </div>
    </nav>
  );
}
