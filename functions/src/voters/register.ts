/**
 * registerVoter — callable (no prior auth required; protected by App Check).
 * A person opens the public election link and submits their details. We:
 *   1. validate the election is open for registration,
 *   2. enforce national-ID uniqueness within the election (transaction),
 *   3. create an Auth user whose uid == voterId, scoped to the tenant,
 *   4. mint a short-lived custom token (the client exchanges it to sign in),
 *   5. store a voterTokens doc with TTL so it self-expires after 30 minutes.
 *
 * The national ID is hashed before storage so the uniqueness index never holds
 * the raw value at rest.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash } from "crypto";
import { db, auth, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";

const TOKEN_TTL_MS = 30 * 60 * 1000;

interface RegisterVoterData {
  electionId: string;
  fullName: string;
  nationalId: string;
  address?: string;
  email?: string;
  photo?: string; // Storage URL uploaded prior to registration
}

function hashNationalId(electionId: string, nationalId: string): string {
  // Salt with electionId so the same person across elections is not linkable.
  return createHash("sha256").update(`${electionId}:${nationalId}`).digest("hex");
}

export const registerVoter = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const d = request.data as RegisterVoterData;
    if (!d.electionId || !d.fullName || !d.nationalId) {
      throw new HttpsError("invalid-argument", "electionId, fullName and nationalId are required.");
    }

    const electionRef = db.collection("elections").doc(d.electionId);
    const electionSnap = await electionRef.get();
    if (!electionSnap.exists) throw new HttpsError("not-found", "Election not found.");
    const election = electionSnap.data()!;

    if (election.registrationMode !== "open") {
      throw new HttpsError("failed-precondition", "This election uses a fixed voter roster.");
    }
    if (election.status === "ended") {
      throw new HttpsError("failed-precondition", "Registration is closed.");
    }

    const tenantId: string = election.tenantId;
    const nidHash = hashNationalId(d.electionId, d.nationalId);
    const voterRef = electionRef.collection("voters").doc();
    const voterId = voterRef.id;

    // Transaction: ensure no existing voter in this election shares the nidHash.
    await db.runTransaction(async (tx) => {
      const dup = await tx.get(
        electionRef.collection("voters").where("nidHash", "==", nidHash).limit(1)
      );
      if (!dup.empty) {
        throw new HttpsError("already-exists", "This national ID has already registered.");
      }
      tx.set(voterRef, {
        voterId,
        tenantId,
        fullName: d.fullName.trim(),
        nidHash,
        address: d.address?.trim() ?? "",
        email: d.email?.trim() ?? "",
        photo: d.photo ?? "",
        hasVoted: false,
        votedFor: null,
        changeVoteUntil: null,
        registeredAt: FieldValue.serverTimestamp(),
      });
    });

    // Create the tenant-scoped auth user (uid == voterId) and set claims.
    const tenantAuth = tenantId ? auth.tenantManager().authForTenant(tenantId) : auth;
    await tenantAuth.createUser({ uid: voterId });
    await tenantAuth.setCustomUserClaims(voterId, {
      role: "voter",
      tenantId,
      electionId: d.electionId,
    });
    const customToken = await tenantAuth.createCustomToken(voterId, {
      role: "voter",
      electionId: d.electionId,
    });

    // TTL doc — Firestore auto-deletes when expireAt passes.
    await db.collection("voterTokens").doc(voterId).set({
      voterId,
      electionId: d.electionId,
      tenantId,
      expireAt: new Date(Date.now() + TOKEN_TTL_MS),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { voterId, customToken, tenantId, expiresInMs: TOKEN_TTL_MS };
  }
);
