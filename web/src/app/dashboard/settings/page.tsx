"use client";

/**
 * Settings page — manage user roles and permissions.
 * Accessible to companyAdmin and above.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface User {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  branchId: string | null;
  employeeId: string | null;
}

interface Branch {
  id: string;
  name: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, loading, tenantId, role, refreshClaims } = useAuth();
  const ar = locale === "ar";

  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "companyAdmin" || role === "superAdmin";

  // Only bounce out if genuinely signed out. We deliberately DON'T redirect on
  // a non-admin role — a stale token can briefly read the wrong role and that
  // produced a jarring "open then bounce". Instead we show an access card with
  // a one-click "refresh permissions" below.
  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [user, loading, router]);

  // Fetch users and branches.
  useEffect(() => {
    if (!tenantId) return;

    async function load() {
      setLoadingUsers(true);
      setError("");
      try {
        const [usersRes, branchesRes] = await Promise.all([
          call("listTenantUsers", { tenantId }),
          call("getAllBranches", {}),
        ]);
        setUsers(usersRes.users || []);
        setBranches(branchesRes.branches || []);
      } catch (err: any) {
        setError(`${t("common.error")}: ${err.message}`);
      } finally {
        setLoadingUsers(false);
      }
    }

    load();
  }, [tenantId, t]);

  async function updateUserRole(uid: string, newRole: string, branchId: string | null) {
    if (!newRole) return;
    setSaving(true);
    setMsg("");
    try {
      const payload: any = { uid, role: newRole };
      if (branchId) payload.branchId = branchId;
      await call("setUserRole", payload);

      // Update local state.
      setUsers(
        users.map((u) =>
          u.uid === uid
            ? { ...u, role: newRole, branchId: branchId || null }
            : u
        )
      );

      setMsg(t("settings.saved") + " — " + t("settings.relogin"));
      setEditingUid(null);
      setTimeout(() => setMsg(""), 8000);
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  // Non-admin (or stale-token) view: no bounce — offer an in-place fix.
  if (!isAdmin) {
    return (
      <main className="container">
        <h1>{t("settings.title")}</h1>
        <section className="card" style={{ marginTop: 16, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: "2.5rem" }}>🔒</div>
          <h2 style={{ marginTop: 8 }}>{t("settings.adminOnly")}</h2>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>{t("settings.adminOnlyHint")}</p>
          <p style={{ color: "var(--muted)", marginTop: 4, fontSize: "0.85rem" }}>
            {ar ? "دورك الحالي" : "Your current role"}: <strong>{role || (ar ? "بدون" : "none")}</strong>
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try { await refreshClaims(); } finally { setRefreshing(false); }
              }}
            >
              {refreshing ? t("common.loading") : t("settings.refreshPerms")}
            </button>
            <button
              className="btn btn-outline"
              onClick={async () => { await signOut(auth); router.replace("/auth"); }}
            >
              {ar ? "تسجيل خروج ودخول" : "Sign out & back in"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const roleOptions = [
    { value: "employee", label: t("settings.roles.employee") },
    { value: "secretary", label: t("settings.roles.secretary") },
    { value: "hr", label: t("settings.roles.hr") },
    { value: "branchManager", label: t("settings.roles.branchManager") },
    ...(role === "superAdmin"
      ? [{ value: "companyAdmin", label: t("settings.roles.companyAdmin") }]
      : []),
  ];

  return (
    <main className="container">
      <h1>{t("settings.title")}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <h2>{t("settings.roles")}</h2>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {t("settings.roleDescription")}
          </p>
        </div>

        {error && (
          <div
            style={{
              color: "red",
              marginBottom: 16,
              padding: 12,
              backgroundColor: "#fee2e2",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        {msg && (
          <div
            style={{
              color: "green",
              marginBottom: 16,
              padding: 12,
              backgroundColor: "#dcfce7",
              borderRadius: 8,
            }}
          >
            {msg}
          </div>
        )}

        {loadingUsers ? (
          <p style={{ color: "var(--muted)" }}>{t("common.loading")}</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{t("settings.noUsers")}</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ padding: 8, textAlign: "right" }}>
                    {t("settings.col.email")}
                  </th>
                  <th style={{ padding: 8, textAlign: "right" }}>
                    {t("settings.col.role")}
                  </th>
                  <th style={{ padding: 8, textAlign: "right" }}>
                    {t("settings.col.branch")}
                  </th>
                  <th style={{ padding: 8 }}>{t("settings.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.uid}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: 8 }}>{u.email}</td>
                    <td style={{ padding: 8 }}>
                      {editingUid === u.uid ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          style={{
                            padding: 6,
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <option value="">{t("settings.roleSelect")}</option>
                          {roleOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.role
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {editingUid === u.uid &&
                      editRole === "branchManager" ? (
                        <select
                          value={editBranchId}
                          onChange={(e) => setEditBranchId(e.target.value)}
                          style={{
                            padding: 6,
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <option value="">
                            {t("settings.branchSelect")}
                          </option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.branchId || "—"
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {editingUid === u.uid ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() =>
                              updateUserRole(
                                u.uid,
                                editRole,
                                editRole === "branchManager"
                                  ? editBranchId || null
                                  : null
                              )
                            }
                            disabled={!editRole || saving}
                            style={{
                              padding: "6px 12px",
                              background: "var(--primary)",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: saving ? "not-allowed" : "pointer",
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            {saving ? t("settings.saving") : t("common.save")}
                          </button>
                          <button
                            onClick={() => {
                              setEditingUid(null);
                              setEditRole("");
                              setEditBranchId("");
                            }}
                            disabled={saving}
                            style={{
                              padding: "6px 12px",
                              background: "transparent",
                              color: "var(--muted)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              cursor: saving ? "not-allowed" : "pointer",
                            }}
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingUid(u.uid);
                            setEditRole(u.role);
                            setEditBranchId(u.branchId || "");
                          }}
                          style={{
                            color: "var(--primary)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {t("settings.editRole")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
