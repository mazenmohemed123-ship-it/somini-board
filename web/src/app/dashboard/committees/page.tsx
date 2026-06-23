"use client";

/** Committee management: create committees and set their members (employees). */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient } from "@/lib/firebase";
import { call } from "@/lib/api";
import { useI18n } from "@/i18n";

interface Committee {
  id: string;
  name: string;
  members: string[];
}
interface Employee {
  id: string;
  fullName: string;
}

export default function CommitteesPage() {
  const { t } = useI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        const token = u ? await u.getIdTokenResult() : null;
        setTenantId((token?.claims as any)?.firebase?.tenant ?? (token?.claims as any)?.tenantId ?? null);
      }),
    []
  );

  useEffect(() => {
    if (!tenantId) return;
    const uc = onSnapshot(query(collection(dbClient, "committees"), where("tenantId", "==", tenantId)), (s) =>
      setCommittees(s.docs.map((d) => ({ id: d.id, name: d.data().name, members: d.data().members ?? [] })))
    );
    const ue = onSnapshot(query(collection(dbClient, "employees"), where("tenantId", "==", tenantId)), (s) =>
      setEmployees(s.docs.map((d) => ({ id: d.id, fullName: d.data().fullName })))
    );
    return () => {
      uc();
      ue();
    };
  }, [tenantId]);

  function startEdit(c: Committee) {
    setEditing(c.id);
    setSelected(new Set(c.members));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function saveMembers() {
    setBusy(true);
    setMsg("");
    try {
      await call("setCommitteeMembers", { committeeId: editing, members: Array.from(selected) });
      setEditing(null);
      setMsg("✓");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>{t("nav.committees")}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("committee.add")}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await call("createCommittee", { name, members: [] });
              setName("");
            } catch (err: any) {
              setMsg(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>{t("committee.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <button className="btn" disabled={busy} style={{ marginTop: 16 }}>{t("committee.add")}</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        {committees.map((c) => (
          <div key={c.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{c.name}</strong>
              <button className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => startEdit(c)}>
                {t("committee.members")} ({c.members.length})
              </button>
            </div>
            {editing === c.id && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                  {employees.map((e) => (
                    <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto", marginTop: 0 }}
                        checked={selected.has(e.id)}
                        onChange={() => toggle(e.id)}
                      />
                      {e.fullName}
                    </label>
                  ))}
                </div>
                <button className="btn" disabled={busy} onClick={saveMembers} style={{ marginTop: 12 }}>
                  {t("common.save")}
                </button>
              </div>
            )}
          </div>
        ))}
        {committees.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد لجان بعد</p>}
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>
    </main>
  );
}
