"use client";

/**
 * Manage candidates for a draft election. Upload photos to Cloud Storage,
 * add/remove candidates. Once the election goes active candidates are locked.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, onSnapshot, doc, getDoc, addDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, dbClient, storage } from "@/lib/firebase";
import { useI18n } from "@/i18n";

interface Candidate {
  id: string;
  fullName: string;
  photo?: string;
  description?: string;
}

interface Election {
  title: string;
  status: string;
  tenantId?: string;
}

export default function CandidatesPage() {
  const { electionId } = useParams<{ electionId: string }>();
  const { t } = useI18n();
  const [election, setElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        const token = await u.getIdTokenResult();
        const tid = (token.claims as any).firebase?.tenant ?? (token.claims as any).tenantId;
        setTenantId(tid);
      }
    });
  }, []);

  useEffect(() => {
    getDoc(doc(dbClient, "elections", electionId)).then((d) => {
      if (d.exists()) setElection(d.data() as Election);
    });
  }, [electionId]);

  useEffect(() => {
    const q = collection(dbClient, "elections", electionId, "candidates");
    return onSnapshot(q, (snap) =>
      setCandidates(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [electionId]);

  async function addCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (election?.status !== "draft") {
      setMsg("لا يمكن تعديل المرشحين بعد بدء الانتخاب");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      let photoUrl = "";
      if (photo && tenantId) {
        const photoRef = ref(
          storage,
          `tenants/${tenantId}/elections/${electionId}/candidates/${photo.name}-${Date.now()}`
        );
        await uploadBytes(photoRef, photo);
        photoUrl = await getDownloadURL(photoRef);
      }

      await addDoc(collection(dbClient, "elections", electionId, "candidates"), {
        fullName: form.fullName,
        description: form.description,
        photo: photoUrl,
      });

      setForm({ fullName: "", description: "" });
      setPhoto(null);
      setMsg("✓ تم إضافة المرشح");
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeCandidate(id: string) {
    if (!confirm("متأكد من الحذف؟")) return;
    try {
      await deleteDoc(doc(dbClient, "elections", electionId, "candidates", id));
    } catch (err: any) {
      setMsg(`${t("common.error")}: ${err.message}`);
    }
  }

  return (
    <main className="container">
      <h1>المرشحون — {election?.title}</h1>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("vote.candidates")}</h2>
        <form onSubmit={addCandidate}>
          <label>
            {t("voter.fullName")}
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              disabled={election?.status !== "draft"}
              required
            />
          </label>
          <label>
            {t("election.description")}
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={election?.status !== "draft"}
            />
          </label>
          <label>
            صورة
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              disabled={election?.status !== "draft"}
            />
          </label>
          <button className="btn" type="submit" disabled={busy || election?.status !== "draft"}>
            {busy ? t("common.loading") : "إضافة"}
          </button>
          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {candidates.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                textAlign: "center",
              }}
            >
              {c.photo && (
                <img
                  src={c.photo}
                  alt={c.fullName}
                  style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }}
                />
              )}
              <strong style={{ display: "block", marginTop: 8 }}>{c.fullName}</strong>
              <small style={{ color: "var(--muted)" }}>{c.description}</small>
              <button
                className="btn"
                style={{
                  marginTop: 8,
                  width: "100%",
                  background: "#ef4444",
                  fontSize: "0.875rem",
                  padding: "6px 12px",
                }}
                onClick={() => removeCandidate(c.id)}
                disabled={election?.status !== "draft"}
              >
                حذف
              </button>
            </div>
          ))}
        </div>
        {candidates.length === 0 && <p style={{ color: "var(--muted)" }}>لا توجد مرشحين بعد</p>}
      </section>
    </main>
  );
}
