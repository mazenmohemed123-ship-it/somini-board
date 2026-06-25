"use client";

/** Dashboard navigation — now a slide-in side drawer with a hamburger.
 *  Role-aware: employees see a trimmed menu (their own data only), while
 *  admins / staff / managers see the full management menu. */
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth-context";
import { SideNav, NavLink } from "@/components/SideNav";

export function DashboardNav() {
  const { t } = useI18n();
  const { role } = useAuth();

  // A plain employee only manages their own attendance and participates in
  // elections / motions / meetings. They do NOT see company-management areas.
  const isEmployee = role === "employee";
  const isAdmin = role === "companyAdmin" || role === "secretary" || role === "superAdmin";

  const employeeLinks: NavLink[] = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "▣" },
    { href: "/dashboard/attendance", label: t("nav.attendance"), icon: "🕐" },
    { href: "/dashboard/elections", label: t("nav.elections"), icon: "🗳️" },
    { href: "/dashboard/motions", label: t("nav.motions"), icon: "📋" },
    { href: "/dashboard/meetings", label: t("nav.meetings"), icon: "🎥" },
  ];

  const fullLinks: NavLink[] = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "▣" },
    { href: "/dashboard/employees", label: t("nav.employees"), icon: "👥" },
    { href: "/dashboard/attendance", label: t("nav.attendance"), icon: "🕐" },
    { href: "/dashboard/branches", label: t("nav.branches"), icon: "🏢" },
    { href: "/dashboard/committees", label: t("nav.committees"), icon: "🤝" },
    { href: "/dashboard/elections", label: t("nav.elections"), icon: "🗳️" },
    { href: "/dashboard/motions", label: t("nav.motions"), icon: "📋" },
    { href: "/dashboard/meetings", label: t("nav.meetings"), icon: "🎥" },
    { href: "/dashboard/integrations", label: t("nav.integrations"), icon: "🔌" },
    // Only company admins manage roles & permissions.
    ...(isAdmin
      ? [{ href: "/dashboard/settings", label: t("settings.title"), icon: "⚙️" }]
      : []),
  ];

  const links = isEmployee ? employeeLinks : fullLinks;

  return <SideNav links={links} title={t("app.name")} homeHref="/dashboard" />;
}
