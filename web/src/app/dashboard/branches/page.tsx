"use client";

/** Branch management: create branches, assign managers, add departments. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { dbClient } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Branch {
  id: string;
  name: string;
  address?: string;
  managerId?: string | null;
}

export default function BranchesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, loading, tenantId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branchForm, setBranchForm] = useState({ name: "", address: "" });
  const [deptName, setDeptName] = useState("");
  const [assign, setAssign] = useState({ branchId: "", managerUid: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!tenantId) return;
    const ub = onSnapshot(
      query(collection(dbClient, "branches"), where("tenantId", "==", tenantId)),
      (s) => {
        setBranches(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setError("");
      },
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    const ud = onSnapshot(
      query(collection(dbClient, "departments"), where("tenantId", "==", tenantId)),
      (s) => setDepartments(s.docs.map((d) => ({ id: d.id, name: d.data().name }))),
      (err) => setError(`${t("common.error")}: ${err.message}`)
    );
    return () => {
      ub();
      ud();
    };
  }, [tenantId, t]);

  async function run(fn: () => Promise<any>, success = "✓") {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(success);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <main className="container">
      <h1>{t("nav.branches")}</h1>

      {error && <div style={{ color: "red", marginBottom: 16, padding: 12, backgroundColor: "#fee2e2", borderRadius: 8 }}>{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
        <section className="card">
          <h2>{t("branch.add")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await call("createBranch", branchForm);
                setBranchForm({ name: "", address: "" });
              });
            }}
          >
            <label>{t("branch.name")}
              <input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required /></label>
            <label>{t("branch.address")}
              <input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></label>
            <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("branch.add")}</button>
          </form>
        </section>

        <section className="card">
          <h2>{t("department.add")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await call("createDepartment", { name: deptName });
                setDeptName("");
              });
            }}
          >
            <label>{t("nav.departments")}
              <input value={deptName} onChange={(e) => setDeptName(e.target.value)} required /></label>
            <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("department.add")}</button>
          </form>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {departments.map((d) => (
              <span key={d.id} style={{ background: "#f3f4f6", padding: "4px 10px", borderRadius: 20, fontSize: "0.85rem" }}>{d.name}</span>
            ))}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("branch.assignManager")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await call("assignBranchManager", assign);
              setAssign({ branchId: "", managerUid: "" });
            });
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>{t("nav.branches")}
              <select value={assign.branchId} onChange={(e) => setAssign({ ...assign, branchId: e.target.value })} required>
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>{t("branch.manager")} (UID)
              <input value={assign.managerUid} onChange={(e) => setAssign({ ...assign, managerUid: e.target.value })} required /></label>
          </div>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("branch.assignManager")}</button>
        </form>
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{branches.length} {t("nav.branches")}</h2>
        <ul style={{ listStyle: "none", marginTop: 12 }}>
          {branches.map((b) => (
            <li key={b.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>{b.name}</strong> <small style={{ color: "var(--muted)" }}>{b.address}</small>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {b.managerId ? `مدير: ${b.managerId}` : "بدون مدير"} · ID: {b.id}
              </div>
            </li>
          ))}
        </ul>
        {branches.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد فروع بعد</p>}
      </section>
    </main>
  );
}
