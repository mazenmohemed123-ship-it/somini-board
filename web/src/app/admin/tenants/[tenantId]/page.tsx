"use client";

/**
 * Single-company detail page for the platform owner: core info, cross-section
 * stats, and a form to change the company's plan / extend its subscription
 * (updateSubscription) or freeze it (toggleTenantStatus).
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Details {
  tenantId: string;
  companyName: string;
  plan: string;
  status: string;
  createdAt: number | null;
  contactEmail: string | null;
  stats: {
    employees: number;
    branches: number;
    elections: number;
    motions: number;
    committees: number;
    meetings: number;
  };
  subscription: {
    id: string;
    plan: string;
    status: string;
    monthlyPrice?: number;
    startDate: number | null;
    endDate: number | null;
  } | null;
}

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString("ar-EG") : "—";
const toInputDate = (ms: number | null) =>
  ms ? new Date(ms).toISOString().slice(0, 10) : "";

export default function TenantDetail() {
  const { t } = useI18n();
  const params = useParams();
  const tenantId = String(params.tenantId);
  const [d, setD] = useState<Details | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await call<Details>("getTenantDetails", { tenantId });
      setD(r);
      setPlan(r.plan);
      setEndDate(toInputDate(r.subscription?.endDate ?? null));
      setMonthlyPrice(String(r.subscription?.monthlyPrice ?? ""));
    } catch (e: any) {
      setErr(e.message);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await call("updateSubscription", {
        tenantId,
        plan,
        endDate: endDate ? new Date(endDate).getTime() : null,
        monthlyPrice: Number(monthlyPrice || 0),
      });
      setMsg("✓");
      await load();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!d) return;
    setBusy(true);
    setMsg("");
    try {
      const active = d.status !== "active";
      await call("toggleTenantStatus", { tenantId, active });
      await load();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <main className="container"><p style={{ color: "crimson" }}>{err}</p></main>;
  if (!d) return <main className="container"><p style={{ color: "var(--muted)" }}>{t("common.loading")}</p></main>;

  const statItems = [
    { label: t("nav.employees"), value: d.stats.employees },
    { label: t("nav.branches"), value: d.stats.branches },
    { label: t("nav.elections"), value: d.stats.elections },
    { label: t("nav.motions"), value: d.stats.motions },
    { label: t("nav.committees"), value: d.stats.committees },
    { label: t("nav.meetings"), value: d.stats.meetings },
  ];

  return (
    <main className="container">
      <Link href="/admin/tenants" style={{ fontSize: "0.9rem" }}>← {t("common.back")}</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <h1>{d.companyName}</h1>
        <button
          className="btn"
          style={{ background: d.status === "active" ? "#dc2626" : "#16a34a" }}
          disabled={busy}
          onClick={toggleStatus}
        >
          {d.status === "active" ? t("admin.disable") : t("admin.enable")}
        </button>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>{t("admin.tenant.details")}</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))" }}>
          <div><div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t("admin.col.tenantId")}</div><div style={{ fontFamily: "monospace" }}>{d.tenantId}</div></div>
          <div><div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t("admin.col.plan")}</div><div>{d.plan}</div></div>
          <div><div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t("admin.col.status")}</div><div>{t(`admin.status.${d.status}`)}</div></div>
          <div><div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t("admin.col.createdAt")}</div><div>{fmtDate(d.createdAt)}</div></div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>{t("admin.tenant.stats")}</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))" }}>
          {statItems.map((s) => (
            <div key={s.label} style={{ textAlign: "center", padding: "12px 8px", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)" }}>{s.value}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 4 }}>{t("admin.tenant.changePlan")}</h2>
        {d.subscription && (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {t("admin.col.subscription")}: {t(`admin.status.${d.subscription.status}`)} · {t("admin.col.endDate")} {fmtDate(d.subscription.endDate)}
          </p>
        )}
        <form onSubmit={saveSubscription}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label>{t("admin.col.plan")}
              <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="free">free</option>
                <option value="basic">basic</option>
                <option value="pro">pro</option>
                <option value="enterprise">enterprise</option>
              </select>
            </label>
            <label>{t("admin.tenant.newEndDate")}
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label>{t("admin.tenant.monthlyPrice")}
              <input type="number" min={0} value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} />
            </label>
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("admin.tenant.save")}</button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>
    </main>
  );
}
