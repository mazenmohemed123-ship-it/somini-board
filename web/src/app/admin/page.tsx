"use client";

/**
 * Platform-owner overview: headline stat cards, a company-growth chart, and a
 * table of the most recently registered companies. All data comes from the
 * superAdmin-only `getSuperAdminStats` / `listAllTenants` callables (the Admin
 * SDK aggregates across every tenant server-side).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";
import { GrowthChart } from "@/components/GrowthChart";

interface Stats {
  totalTenants: number;
  activeTenants: number;
  totalEmployees: number;
  activeElections: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  growth: { label: string; count: number }[];
}

interface TenantRow {
  tenantId: string;
  companyName: string;
  plan: string;
  status: string;
  createdAt: number | null;
  employees: number;
  elections: number;
}

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("ar-EG") : "—";

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const palette: Record<string, string> = {
    active: "#dcfce7",
    trial: "#dbeafe",
    disabled: "#fee2e2",
    expired: "#fef3c7",
    none: "#f3f4f6",
  };
  return (
    <span style={{ fontSize: "0.78rem", padding: "2px 10px", borderRadius: 999, background: palette[status] ?? "#f3f4f6" }}>
      {t(`admin.status.${status}`)}
    </span>
  );
}

export default function AdminOverview() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, tl] = await Promise.all([
          call<Stats>("getSuperAdminStats"),
          call<{ tenants: TenantRow[] }>("listAllTenants"),
        ]);
        setStats(s);
        setTenants(tl.tenants.slice(0, 8));
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, []);

  const cards = stats
    ? [
        { label: t("admin.stat.activeCompanies"), value: stats.activeTenants },
        { label: t("admin.stat.monthlySubscriptions"), value: stats.activeSubscriptions },
        { label: t("admin.stat.monthlyRevenue"), value: `${stats.monthlyRevenue.toLocaleString("ar-EG")} ` },
        { label: t("admin.stat.activeElections"), value: stats.activeElections },
        { label: t("admin.stat.totalEmployees"), value: stats.totalEmployees },
      ]
    : [];

  return (
    <main className="container">
      <h1>{t("admin.overview")}</h1>

      {err && <p style={{ color: "crimson", marginTop: 12 }}>{t("common.error")}: {err}</p>}

      <div className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--primary)" }}>
              {stats ? c.value : "…"}
            </div>
            <div style={{ color: "var(--muted)" }}>{c.label}</div>
          </div>
        ))}
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>{t("admin.growth.title")}</h2>
        {stats ? (
          <GrowthChart
            labels={stats.growth.map((g) => g.label)}
            data={stats.growth.map((g) => g.count)}
            label={t("admin.stat.totalCompanies")}
          />
        ) : (
          <p style={{ color: "var(--muted)" }}>{t("common.loading")}</p>
        )}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.1rem" }}>{t("admin.latestCompanies")}</h2>
          <Link className="btn btn-outline" style={{ padding: "4px 12px" }} href="/admin/tenants">
            {t("admin.allCompanies")}
          </Link>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "start", color: "var(--muted)" }}>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.name")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.tenantId")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.plan")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.employees")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.createdAt")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tn) => (
                <tr key={tn.tenantId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                    <Link href={`/admin/tenants/${tn.tenantId}`}>{tn.companyName}</Link>
                  </td>
                  <td style={{ padding: "10px 6px", color: "var(--muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>{tn.tenantId}</td>
                  <td style={{ padding: "10px 6px" }}>{tn.plan}</td>
                  <td style={{ padding: "10px 6px" }}>{tn.employees}</td>
                  <td style={{ padding: "10px 6px" }}>{fmtDate(tn.createdAt)}</td>
                  <td style={{ padding: "10px 6px" }}><StatusBadge status={tn.status} /></td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
                    {t("admin.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
