"use client";

/** Platform-owner (superAdmin) navigation — slide-in side drawer. */
import { useI18n } from "@/i18n";
import { SideNav, NavLink } from "@/components/SideNav";

export function AdminNav() {
  const { t, locale } = useI18n();
  const ar = locale === "ar";

  const links: NavLink[] = [
    { href: "/admin", label: t("admin.overview"), icon: "📊" },
    { href: "/admin/tenants", label: t("admin.tenants"), icon: "🏢" },
    { href: "/admin/subscriptions", label: t("admin.subscriptions"), icon: "💳" },
    { href: "/admin/setup", label: ar ? "إضافة شركة" : "Add company", icon: "➕" },
  ];

  return <SideNav links={links} title={t("admin.console")} dark homeHref="/admin" />;
}
