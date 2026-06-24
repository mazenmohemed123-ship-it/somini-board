"use client";

/**
 * All subscriptions across every company, with a filter for those expiring
 * soon or already expired. Powered by the superAdmin-only listAllSubscriptions.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Sub {
  id: string;
  tenantId: string;
  companyName: string;
  plan: string;
  status: string;
  monthlyPrice: number;
  startDate: number | null;
  endDate: number | null;
}

type Filter = "all" | "expiring" | "expired";

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("ar-EG") : "—";

export default function AdminSubscriptions() {
  const { t } = useI18n();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const r = await call<{ subscriptions: Sub[] }>("listAllSubscriptions", f === "all" ? {} : { filter: f });
      setSubs(r.subscriptions);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const badge = (status: string) => {
    const palette: Record<string, string> = { active: "#dcfce7", expired: "#fef3c7", none: "#f3f4f6" };
    return (
      <span style={{ fontSize: "0.78rem", padding: "2px 10px", borderRadius: 999, background: palette[status] ?? "#f3f4f6" }}>
        {t(`admin.status.${status}`)}
      </span>
    );
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("admin.filter.all") },
    { key: "expiring", label: t("admin.filter.expiring") },
    { key: "expired", label: t("admin.filter.expired") },
  ];

  return (
    <main className="container">
      <h1>{t("admin.allSubscriptions")}</h1>
      {err && <p style={{ color: "crimson", marginTop: 12 }}>{t("common.error")}: {err}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {filters.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "btn" : "btn btn-outline"}
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.company")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.plan")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.tenant.monthlyPrice")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.startDate")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.endDate")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                    <Link href={`/admin/tenants/${s.tenantId}`}>{s.companyName}</Link>
                  </td>
                  <td style={{ padding: "10px 6px" }}>{s.plan}</td>
                  <td style={{ padding: "10px 6px" }}>{s.monthlyPrice ? s.monthlyPrice.toLocaleString("ar-EG") : "—"}</td>
                  <td style={{ padding: "10px 6px" }}>{fmtDate(s.startDate)}</td>
                  <td style={{ padding: "10px 6px" }}>{fmtDate(s.endDate)}</td>
                  <td style={{ padding: "10px 6px" }}>{badge(s.status)}</td>
                </tr>
              ))}
              {!loading && subs.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>{t("admin.empty")}</td></tr>
              )}
              {loading && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>{t("common.loading")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
