/**
 * Public REST API for connected apps (MCP-style integrations).
 *
 * Endpoints (all under the single onRequest handler, routed by method+path):
 *   POST /api/elections          -> create an election on behalf of a company
 *   POST /api/voters             -> bulk add voters to a roster election
 *   GET  /api/results/:electionId -> fetch aggregated results
 *
 * Auth model: callers send `Authorization: Bearer <apiKey>`. The key is hashed
 * and matched against the integrations collection; the integration must be
 * active. App Check is also enforced at the platform edge. The integration's
 * tenantId scopes every operation, so a key can never touch another tenant.
 */
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { createHash } from "crypto";
import { db, FieldValue, REGION } from "../lib/admin";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

interface Integration {
  integrationId: string;
  companyId: string;
  tenantId: string;
  status: "active" | "disabled";
}

async function resolveIntegration(authHeader?: string): Promise<Integration | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const key = authHeader.slice(7).trim();
  const snap = await db
    .collection("integrations")
    .where("apiKeyHash", "==", hashKey(key))
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    integrationId: snap.docs[0].id,
    companyId: data.companyId,
    tenantId: data.tenantId,
    status: data.status,
  };
}

export const api = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    const integration = await resolveIntegration(req.headers.authorization);
    if (!integration) {
      res.status(401).json({ error: "Invalid or inactive API key" });
      return;
    }

    const path = req.path.replace(/^\/api/, "");

    try {
      // ---- POST /elections ----
      if (req.method === "POST" && path === "/elections") {
        const { title, description, startDate, endDate, changeVoteWindow, registrationMode } = req.body || {};
        if (!title || !startDate || !endDate) {
          res.status(400).json({ error: "title, startDate, endDate required" });
          return;
        }
        const ref = db.collection("elections").doc();
        await ref.set({
          electionId: ref.id,
          tenantId: integration.tenantId,
          companyId: integration.companyId,
          title,
          description: description ?? "",
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          changeVoteWindow: changeVoteWindow ?? 0,
          registrationMode: registrationMode === "roster" ? "roster" : "open",
          status: "draft",
          createdBy: `integration:${integration.integrationId}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        res.status(201).json({ electionId: ref.id });
        return;
      }

      // ---- POST /voters ----
      if (req.method === "POST" && path === "/voters") {
        const { electionId, voters } = req.body || {};
        if (!electionId || !Array.isArray(voters)) {
          res.status(400).json({ error: "electionId and voters[] required" });
          return;
        }
        const electionRef = db.collection("elections").doc(electionId);
        const electionSnap = await electionRef.get();
        if (!electionSnap.exists || electionSnap.data()!.tenantId !== integration.tenantId) {
          res.status(404).json({ error: "Election not found in this tenant" });
          return;
        }
        const batch = db.batch();
        for (const v of voters.slice(0, 450)) {
          const vref = electionRef.collection("voters").doc();
          batch.set(vref, {
            voterId: vref.id,
            tenantId: integration.tenantId,
            fullName: v.fullName ?? "",
            nidHash: v.nationalId
              ? createHash("sha256").update(`${electionId}:${v.nationalId}`).digest("hex")
              : null,
            email: v.email ?? "",
            hasVoted: false,
            votedFor: null,
            registeredAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        res.status(201).json({ added: Math.min(voters.length, 450) });
        return;
      }

      // ---- POST /employees ----
      if (req.method === "POST" && path === "/employees") {
        const { fullName, email, phone, branchId, department, position, nationalId } = req.body || {};
        if (!fullName) {
          res.status(400).json({ error: "fullName required" });
          return;
        }
        const ref = db.collection("employees").doc();
        await ref.set({
          employeeId: ref.id,
          tenantId: integration.tenantId,
          branchId: branchId ?? null,
          fullName,
          email: email ?? "",
          phone: phone ?? "",
          department: department ?? null,
          position: position ?? "",
          nationalIdHash: nationalId
            ? createHash("sha256").update(`${integration.tenantId}:${nationalId}`).digest("hex")
            : null,
          managerId: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        res.status(201).json({ employeeId: ref.id });
        return;
      }

      // ---- POST /motions ----
      if (req.method === "POST" && path === "/motions") {
        const { title, description, options, eligibleScope, startDate, endDate } = req.body || {};
        if (!title || !Array.isArray(options) || options.length < 2 || !startDate || !endDate) {
          res.status(400).json({ error: "title, options[>=2], startDate, endDate required" });
          return;
        }
        const ref = db.collection("motions").doc();
        await ref.set({
          motionId: ref.id,
          tenantId: integration.tenantId,
          title,
          description: description ?? "",
          options: options.slice(0, 10),
          eligibleScope: eligibleScope ?? "all",
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          changeVoteWindow: 0,
          status: "draft",
          createdBy: `integration:${integration.integrationId}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        res.status(201).json({ motionId: ref.id });
        return;
      }

      // ---- GET /results/:electionId ----
      const resultsMatch = path.match(/^\/results\/(.+)$/);
      if (req.method === "GET" && resultsMatch) {
        const electionId = resultsMatch[1];
        const electionRef = db.collection("elections").doc(electionId);
        const electionSnap = await electionRef.get();
        if (!electionSnap.exists || electionSnap.data()!.tenantId !== integration.tenantId) {
          res.status(404).json({ error: "Election not found in this tenant" });
          return;
        }
        const [candidates, votes] = await Promise.all([
          electionRef.collection("candidates").get(),
          electionRef.collection("votes").get(),
        ]);
        const counts = new Map<string, number>();
        votes.forEach((v) => counts.set(v.data().candidateId, (counts.get(v.data().candidateId) ?? 0) + 1));
        res.json({
          electionId,
          status: electionSnap.data()!.status,
          totalVotes: votes.size,
          results: candidates.docs.map((c) => ({
            candidateId: c.id,
            name: c.data().fullName,
            votes: counts.get(c.id) ?? 0,
          })),
        });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("integrations api error", err);
      res.status(500).json({ error: "Internal error" });
    }
  }
);
