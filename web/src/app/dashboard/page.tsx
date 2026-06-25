"use client";

/**
 * Dashboard overview.
 *  - Admins / staff: high-level counts across the platform + management links.
 *  - Employees: a personal welcome with quick links to their own actions
 *    (check in/out, vote in elections/motions, join meetings).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n";

function useCount(coll: string, tenantId: string | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(query(collection(dbClient, coll), where("tenantId", "==", tenantId)), (s) => setN(s.size));
  }, [coll, tenantId]);
  return n;
}

export default function Dashboard() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId, role } = useAuth();
  const ar = locale === "ar";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  const employees = useCount("employees", tenantId);
  const branches = useCount("branches", tenantId);
  const elections = useCount("elections", tenantId);
  const motions = useCount("motions", tenantId);
  const meetings = useCount("meetings", tenantId);
  const committees = useCount("committees", tenantId);

  if (loading) return null;

  const isEmployee = role === "employee";

  // -------- Employee (personal) view --------
  if (isEmployee) {
    const tiles = [
      { label: t("nav.attendance"), icon: "🕐", href: "/dashboard/attendance", hint: ar ? "سجّل حضورك وانصرافك" : "Check in / out" },
      { label: t("nav.elections"), icon: "🗳️", href: "/dashboard/elections", hint: ar ? "شارك في التصويت" : "Vote in elections" },
      { label: t("nav.motions"), icon: "📋", href: "/dashboard/motions", hint: ar ? "صوّت على القرارات" : "Vote on motions" },
      { label: t("nav.meetings"), icon: "🎥", href: "/dashboard/meetings", hint: ar ? "انضم للاجتماعات" : "Join meetings" },
    ];
    return (
      <main className="container">
        <h1>{ar ? `أهلاً ${user?.displayName || ""}` : `Welcome ${user?.displayName || ""}`}</h1>
        <p style={{ color: "var(--muted)" }}>
          {ar ? "هذه لوحتك الشخصية. اختر ما تريد القيام به." : "This is your personal dashboard. Pick what you'd like to do."}
        </p>

        <div className="grid" style={{ marginTop: 24, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {tiles.map((c) => (
            <Link key={c.href} href={c.href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontSize: "2.4rem" }}>{c.icon}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 6 }}>{c.label}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 2 }}>{c.hint}</div>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  // -------- Admin / staff view --------
  const cards = [
    { label: t("nav.employees"), value: employees, href: "/dashboard/employees" },
    { label: t("nav.branches"), value: branches, href: "/dashboard/branches" },
    { label: t("nav.committees"), value: committees, href: "/dashboard/committees" },
    { label: t("nav.elections"), value: elections, href: "/dashboard/elections" },
    { label: t("nav.motions"), value: motions, href: "/dashboard/motions" },
    { label: t("nav.meetings"), value: meetings, href: "/dashboard/meetings" },
  ];

  return (
    <main className="container">
      <h1>{t("nav.dashboard")}</h1>
      <p style={{ color: "var(--muted)" }}>{t("app.tagline")}</p>

      <div
        className="grid"
        style={{ marginTop: 24, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--primary)" }}>{c.value}</div>
            <div style={{ color: "var(--muted)" }}>{c.label}</div>
          </Link>
        ))}
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>{ar ? "روابط سريعة" : "Quick links"}</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="btn" href="/dashboard/elections">{t("election.create")}</Link>
          <Link className="btn" href="/dashboard/motions">{t("motion.create")}</Link>
          <Link className="btn" href="/dashboard/meetings">{t("meeting.create")}</Link>
          <Link className="btn btn-outline" href="/dashboard/employees">{t("employee.add")}</Link>
          <Link className="btn btn-outline" href="/dashboard/settings">{t("settings.title")}</Link>
          <Link className="btn btn-outline" href="/dashboard/payment">{t("payment.title")}</Link>
        </div>
      </section>
    </main>
  );
}
