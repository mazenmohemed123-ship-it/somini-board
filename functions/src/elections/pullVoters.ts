/**
 * pullVotersFromEmployees — callable. Populates an election's voter roster from
 * the company's employees, filtered by scope:
 *   { scope: "all" }                          -> every employee in the tenant
 *   { scope: "branch", branchId }             -> one branch
 *   { scope: "department", department }        -> one department
 *   { scope: "committee", committeeId }        -> a committee's members
 *
 * Each employee becomes a voter doc keyed by their employeeId so the
 * employee↔election link is preserved and they can authenticate as themselves.
 * Idempotent: existing voter docs (same id) are merged, not duplicated.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";
import { getCaller, canManageBranch } from "../lib/context";

interface PullInput {
  electionId: string;
  scope: "all" | "branch" | "department" | "committee";
  branchId?: string;
  department?: string;
  committeeId?: string;
}

export const pullVotersFromEmployees = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 120 },
  async (request) => {
    const caller = getCaller(request);
    const d = request.data as PullInput;
    if (!d.electionId || !d.scope) {
      throw new HttpsError("invalid-argument", "electionId and scope required.");
    }

    const electionRef = db.collection("elections").doc(d.electionId);
    const electionSnap = await electionRef.get();
    if (!electionSnap.exists || electionSnap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Election not found.");
    }
    const election = electionSnap.data()!;
    if (election.status !== "draft") {
      throw new HttpsError("failed-precondition", "Roster can only be filled while draft.");
    }
    if (!canManageBranch(caller, election.branchId)) {
      throw new HttpsError("permission-denied", "Not allowed for this election's scope.");
    }

    // Resolve the employee set for the requested scope.
    let employees: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (d.scope === "committee") {
      if (!d.committeeId) throw new HttpsError("invalid-argument", "committeeId required.");
      const committee = await db.collection("committees").doc(d.committeeId).get();
      if (!committee.exists || committee.data()!.tenantId !== caller.tenantId) {
        throw new HttpsError("not-found", "Committee not found.");
      }
      const memberIds: string[] = committee.data()!.members ?? [];
      // Fetch member employee docs (chunked by 10 for the 'in' query).
      for (let i = 0; i < memberIds.length; i += 10) {
        const chunk = memberIds.slice(i, i + 10);
        const snap = await db.collection("employees")
          .where("tenantId", "==", caller.tenantId)
          .where("employeeId", "in", chunk)
          .get();
        employees.push(...snap.docs);
      }
    } else {
      let q: FirebaseFirestore.Query = db
        .collection("employees")
        .where("tenantId", "==", caller.tenantId);
      if (d.scope === "branch") {
        if (!d.branchId) throw new HttpsError("invalid-argument", "branchId required.");
        q = q.where("branchId", "==", d.branchId);
      } else if (d.scope === "department") {
        if (!d.department) throw new HttpsError("invalid-argument", "department required.");
        q = q.where("department", "==", d.department);
      }
      employees = (await q.get()).docs;
    }

    if (employees.length === 0) return { added: 0 };

    // Write voter docs in batches keyed by employeeId.
    let added = 0;
    for (let i = 0; i < employees.length; i += 400) {
      const slice = employees.slice(i, i + 400);
      const batch = db.batch();
      for (const emp of slice) {
        const e = emp.data();
        const voterRef = electionRef.collection("voters").doc(emp.id);
        batch.set(
          voterRef,
          {
            voterId: emp.id,
            employeeId: emp.id,
            tenantId: caller.tenantId,
            fullName: e.fullName ?? "",
            email: e.email ?? "",
            nidHash: e.nationalIdHash ?? null,
            hasVoted: false,
            votedFor: null,
            changeVoteUntil: null,
            source: "employee",
            addedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        added++;
      }
      await batch.commit();
    }

    await electionRef.update({ rosterCount: FieldValue.increment(added) });
    return { added };
  }
);
