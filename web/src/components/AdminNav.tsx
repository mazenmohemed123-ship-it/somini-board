"use client";

/**
 * Top navigation for the platform-owner (superAdmin) console. Mirrors the
 * dashboard nav styling but links to the cross-tenant /admin routes.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useI18n, LOCALES } from "@/i18n";
import Logo from "@/components/Logo";

export function AdminNav() {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/admin", label: t("admin.overview") },
    { href: "/admin/tenants", label: t("admin.tenants") },
    { href: "/admin/subscriptions", label: t("admin.subscriptions") },
    { href: "/admin/setup", label: t("nav.dashboard") === "Dashboard" ? "Add company" : "إضافة شركة" },
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 12, paddingBottom: 12, flexWrap: "wrap" }}
      >
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size="sm" variant="white" />
        </Link>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: isActive(l.href) ? "#fff" : "#94a3b8",
                background: isActive(l.href) ? "#4f46e5" : "transparent",
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as any)}
          style={{ width: "auto", marginTop: 0, background: "#1e293b", color: "#fff", border: "1px solid #334155" }}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          className="btn btn-outline"
          style={{ padding: "6px 14px", color: "#fff", borderColor: "#475569" }}
          onClick={async () => {
            await signOut(auth);
            router.replace("/auth");
          }}
        >
          {t("nav.logout") === "nav.logout" ? "خروج" : t("nav.logout")}
        </button>
      </div>
    </header>
  );
}
