"use client";

/** Dashboard navigation — now a slide-in side drawer with a hamburger. */
import { useI18n } from "@/i18n";
import { SideNav, NavLink } from "@/components/SideNav";

export function DashboardNav() {
  const { t } = useI18n();

  const links: NavLink[] = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "▣" },
    { href: "/dashboard/employees", label: t("nav.employees"), icon: "👥" },
    { href: "/dashboard/branches", label: t("nav.branches"), icon: "🏢" },
    { href: "/dashboard/committees", label: t("nav.committees"), icon: "🤝" },
    { href: "/dashboard/elections", label: t("nav.elections"), icon: "🗳️" },
    { href: "/dashboard/motions", label: t("nav.motions"), icon: "📋" },
    { href: "/dashboard/meetings", label: t("nav.meetings"), icon: "🎥" },
    { href: "/dashboard/integrations", label: t("nav.integrations"), icon: "🔌" },
  ];

  return <SideNav links={links} title={t("app.name")} homeHref="/dashboard" />;
}
