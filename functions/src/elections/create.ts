/**
 * createElection — callable. A companyAdmin/secretary creates a draft election
 * inside their own tenant. Tenant + role are read from verified auth claims so
 * the client cannot spoof them.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";

interface CreateElectionData {
  title: string;
  description?: string;
  startDate: number; // epoch ms
  endDate: number; // epoch ms
  votingDuration?: number; // minutes
  changeVoteWindow?: number; // minutes a voter may change their vote
  registrationMode: "open" | "roster"; // open to anyone vs pre-registered list
}

export const createElection = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const { auth } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const role = auth.token.role;
    const tenantId = auth.token.firebase?.tenant ?? (auth.token as any).tenantId;
    const companyId = (auth.token as any).companyId;

    if (role !== "companyAdmin" && role !== "secretary") {
      throw new HttpsError("permission-denied", "Only company staff may create elections.");
    }
    if (!tenantId) throw new HttpsError("failed-precondition", "Missing tenant on account.");

    const d = request.data as CreateElectionData;
    if (!d.title || typeof d.title !== "string") {
      throw new HttpsError("invalid-argument", "title is required.");
    }
    if (!d.startDate || !d.endDate || d.endDate <= d.startDate) {
      throw new HttpsError("invalid-argument", "endDate must be after startDate.");
    }
    if (!["open", "roster"].includes(d.registrationMode)) {
      throw new HttpsError("invalid-argument", "registrationMode must be 'open' or 'roster'.");
    }

    const ref = db.collection("elections").doc();
    await ref.set({
      electionId: ref.id,
      tenantId,
      companyId: companyId ?? null,
      title: d.title.trim(),
      description: d.description?.trim() ?? "",
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      votingDuration: d.votingDuration ?? null,
      changeVoteWindow: d.changeVoteWindow ?? 0,
      registrationMode: d.registrationMode,
      status: "draft",
      createdBy: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { electionId: ref.id };
  }
);
