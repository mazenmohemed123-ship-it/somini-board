"use client";

/**
 * All companies (tenants) across the platform. The owner can open a company's
 * detail page or freeze / re-activate it (toggleTenantStatus also flips email
 * sign-in on the company's Identity Platform tenant).
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface TenantRow {
  tenantId: string;
  companyName: string;
  plan: string;
  status: string;
  createdAt: number | null;
  employees: number;
  elections: number;
  subscriptionStatus: string;
}

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("ar-EG") : "—";

export default function AdminTenants() {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await call<{ tenants: TenantRow[] }>("listAllTenants");
      setTenants(r.tenants);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(tn: TenantRow) {
    setBusy(tn.tenantId);
    setErr("");
    try {
      const active = tn.status !== "active";
      await call("toggleTenantStatus", { tenantId: tn.tenantId, active });
      setTenants((prev) =>
        prev.map((x) => (x.tenantId === tn.tenantId ? { ...x, status: active ? "active" : "disabled" } : x))
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const badge = (status: string) => {
    const palette: Record<string, string> = {
      active: "#dcfce7", trial: "#dbeafe", disabled: "#fee2e2", expired: "#fef3c7", none: "#f3f4f6",
    };
    return (
      <span style={{ fontSize: "0.78rem", padding: "2px 10px", borderRadius: 999, background: palette[status] ?? "#f3f4f6" }}>
        {t(`admin.status.${status}`)}
      </span>
    );
  };

  return (
    <main className="container">
      <h1>{t("admin.allCompanies")}</h1>
      {err && <p style={{ color: "crimson", marginTop: 12 }}>{t("common.error")}: {err}</p>}

      <section className="card" style={{ marginTop: 20 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.name")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.tenantId")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.employees")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.elections")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.plan")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.subscription")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.status")}</th>
                <th style={{ textAlign: "start", padding: "8px 6px" }}>{t("admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tn) => (
                <tr key={tn.tenantId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>{tn.companyName}</td>
                  <td style={{ padding: "10px 6px", color: "var(--muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>{tn.tenantId}</td>
                  <td style={{ padding: "10px 6px" }}>{tn.employees}</td>
                  <td style={{ padding: "10px 6px" }}>{tn.elections}</td>
                  <td style={{ padding: "10px 6px" }}>{tn.plan}</td>
                  <td style={{ padding: "10px 6px" }}>{badge(tn.subscriptionStatus)}</td>
                  <td style={{ padding: "10px 6px" }}>{badge(tn.status)}</td>
                  <td style={{ padding: "10px 6px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Link className="btn btn-outline" style={{ padding: "4px 10px", fontSize: "0.8rem" }} href={`/admin/tenants/${tn.tenantId}`}>
                        {t("admin.viewDetails")}
                      </Link>
                      <button
                        className="btn"
                        style={{ padding: "4px 10px", fontSize: "0.8rem", background: tn.status === "active" ? "#dc2626" : "#16a34a" }}
                        disabled={busy === tn.tenantId}
                        onClick={() => toggle(tn)}
                      >
                        {tn.status === "active" ? t("admin.disable") : t("admin.enable")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>{t("admin.empty")}</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>{t("common.loading")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
