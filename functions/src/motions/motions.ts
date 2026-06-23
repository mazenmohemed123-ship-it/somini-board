/**
 * Motions = decision voting (board/committee resolutions).
 *
 *  createMotion  (callable): staff or branch manager or committee creator posts
 *      a motion with custom options and an eligible-voter scope.
 *  publishMotion (callable): move draft -> active (opens voting).
 *  castMotionVote(callable): an eligible employee votes once; the change window
 *      (if any) allows switching options before it closes.
 *
 * Eligibility is denormalized onto the motion as `eligibleScope` +
 * (`branchId` | `department` | `committeeId`). At vote time we verify the
 * caller's employee record matches the scope. Tallies are written to RTDB for
 * live display, and the canonical ballots live in motions/{id}/votes.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, rtdb, FieldValue, ServerValue, REGION } from "../lib/admin";
import { getCaller, isStaff, canManageBranch } from "../lib/context";

interface CreateMotionInput {
  title: string;
  description?: string;
  options: string[]; // e.g. ["approve","reject","abstain"] or custom
  branchId?: string;
  committeeId?: string;
  department?: string;
  eligibleScope: "all" | "branch" | "department" | "committee";
  startDate: number;
  endDate: number;
  changeVoteWindow?: number; // minutes
}

export const createMotion = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const caller = getCaller(request);
  const d = request.data as CreateMotionInput;
  if (!d.title || !Array.isArray(d.options) || d.options.length < 2) {
    throw new HttpsError("invalid-argument", "title and at least two options required.");
  }
  if (!d.startDate || !d.endDate || d.endDate <= d.startDate) {
    throw new HttpsError("invalid-argument", "endDate must be after startDate.");
  }
  if (!isStaff(caller) && !canManageBranch(caller, d.branchId)) {
    throw new HttpsError("permission-denied", "Not allowed to create this motion.");
  }

  const ref = db.collection("motions").doc();
  await ref.set({
    motionId: ref.id,
    tenantId: caller.tenantId,
    branchId: d.branchId ?? null,
    committeeId: d.committeeId ?? null,
    department: d.department ?? null,
    eligibleScope: d.eligibleScope ?? "all",
    title: d.title.trim(),
    description: d.description?.trim() ?? "",
    options: d.options.map((o) => String(o).trim()).slice(0, 10),
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
    changeVoteWindow: d.changeVoteWindow ?? 0,
    status: "draft",
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { motionId: ref.id };
});

export const publishMotion = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const caller = getCaller(request);
  const { motionId } = request.data || {};
  const ref = db.collection("motions").doc(motionId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
    throw new HttpsError("not-found", "Motion not found.");
  }
  const m = snap.data()!;
  if (!isStaff(caller) && !canManageBranch(caller, m.branchId)) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
  await ref.update({ status: "active", publishedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/** Verify the caller's employee record satisfies the motion's eligible scope. */
async function assertEligible(
  tenantId: string,
  uid: string,
  motion: FirebaseFirestore.DocumentData
): Promise<void> {
  if (motion.eligibleScope === "all") return;

  if (motion.eligibleScope === "committee") {
    const committee = await db.collection("committees").doc(motion.committeeId).get();
    if (!committee.exists || !(committee.data()!.members ?? []).includes(uid)) {
      throw new HttpsError("permission-denied", "Not a member of the eligible committee.");
    }
    return;
  }

  const emp = await db.collection("employees").doc(uid).get();
  if (!emp.exists || emp.data()!.tenantId !== tenantId) {
    throw new HttpsError("permission-denied", "No matching employee record.");
  }
  if (motion.eligibleScope === "branch" && emp.data()!.branchId !== motion.branchId) {
    throw new HttpsError("permission-denied", "Not in the eligible branch.");
  }
  if (motion.eligibleScope === "department" && emp.data()!.department !== motion.department) {
    throw new HttpsError("permission-denied", "Not in the eligible department.");
  }
}

export const castMotionVote = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const caller = getCaller(request);
    const { motionId, optionChosen } = request.data || {};
    if (!motionId || optionChosen == null) {
      throw new HttpsError("invalid-argument", "motionId and optionChosen required.");
    }

    const motionRef = db.collection("motions").doc(motionId);
    const voteRef = motionRef.collection("votes").doc(caller.uid); // one ballot per voter
    let previousOption: string | null = null;

    await db.runTransaction(async (tx) => {
      const motionSnap = await tx.get(motionRef);
      if (!motionSnap.exists) throw new HttpsError("not-found", "Motion not found.");
      const m = motionSnap.data()!;
      if (m.tenantId !== caller.tenantId) {
        throw new HttpsError("permission-denied", "Wrong tenant.");
      }
      const now = new Date();
      if (m.status !== "active" || m.startDate.toDate() > now || m.endDate.toDate() < now) {
        throw new HttpsError("failed-precondition", "Motion is not open for voting.");
      }
      if (!m.options.includes(optionChosen)) {
        throw new HttpsError("invalid-argument", "Invalid option.");
      }

      // Eligibility (read happens inside the txn-adjacent context; it's a
      // separate get but acceptable for this denormalized model).
      await assertEligible(caller.tenantId, caller.uid, m);

      const existing = await tx.get(voteRef);
      const changeWindowMin = m.changeVoteWindow ?? 0;
      if (existing.exists) {
        // Changing an existing vote — only within the window.
        const until = existing.data()!.changeUntil?.toDate?.() ?? null;
        if (!until || until < now) {
          throw new HttpsError("failed-precondition", "Change-vote window has closed.");
        }
        previousOption = existing.data()!.optionChosen;
        if (previousOption === optionChosen) return;
        tx.update(voteRef, { optionChosen, changedAt: FieldValue.serverTimestamp() });
      } else {
        const changeUntil =
          changeWindowMin > 0 ? new Date(now.getTime() + changeWindowMin * 60_000) : null;
        tx.set(voteRef, {
          voteId: caller.uid,
          voterId: caller.uid,
          optionChosen,
          changeUntil,
          timestamp: FieldValue.serverTimestamp(),
        });
      }
    });

    // Live tally in RTDB (display only).
    const base = `motions/${motionId}/liveResults`;
    if (previousOption && previousOption !== optionChosen) {
      await Promise.all([
        rtdb.ref(`${base}/${previousOption}`).set(ServerValue.increment(-1)),
        rtdb.ref(`${base}/${optionChosen}`).set(ServerValue.increment(1)),
      ]);
    } else if (!previousOption) {
      await rtdb.ref(`${base}/${optionChosen}`).set(ServerValue.increment(1));
    }

    return { ok: true };
  }
);
