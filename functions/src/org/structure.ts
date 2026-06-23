/**
 * Organizational structure: branches, departments, committees.
 *
 *  createBranch / assignBranchManager — companyAdmin/secretary.
 *      assignBranchManager also sets the branchManager role claim on the user
 *      so Firestore rules (claims().branchId) and functions agree.
 *  createDepartment — staff.
 *  createCommittee / setCommitteeMembers — staff; members are employeeIds.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, auth, FieldValue, REGION } from "../lib/admin";
import { getCaller, requireRole } from "../lib/context";

export const createBranch = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const caller = getCaller(request);
  requireRole(caller, "companyAdmin", "secretary");
  const { name, address } = request.data || {};
  if (!name) throw new HttpsError("invalid-argument", "name required.");

  const ref = db.collection("branches").doc();
  await ref.set({
    branchId: ref.id,
    tenantId: caller.tenantId,
    name: String(name).trim(),
    address: address ?? "",
    managerId: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { branchId: ref.id };
});

/**
 * Assign an employee (by their auth uid == employeeId) as the manager of a
 * branch. Sets the branchManager role claim scoped to that branch.
 */
export const assignBranchManager = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const caller = getCaller(request);
    requireRole(caller, "companyAdmin");
    const { branchId, managerUid } = request.data || {};
    if (!branchId || !managerUid) {
      throw new HttpsError("invalid-argument", "branchId and managerUid required.");
    }

    const branchRef = db.collection("branches").doc(branchId);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists || branchSnap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Branch not found.");
    }

    await branchRef.update({ managerId: managerUid });

    const tenantAuth = auth.tenantManager().authForTenant(caller.tenantId);
    await tenantAuth.setCustomUserClaims(managerUid, {
      role: "branchManager",
      tenantId: caller.tenantId,
      companyId: caller.companyId,
      branchId,
      employeeId: managerUid,
    });

    return { ok: true };
  }
);

export const createDepartment = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const caller = getCaller(request);
    requireRole(caller, "companyAdmin", "secretary");
    const { name } = request.data || {};
    if (!name) throw new HttpsError("invalid-argument", "name required.");

    const ref = db.collection("departments").doc();
    await ref.set({
      deptId: ref.id,
      tenantId: caller.tenantId,
      name: String(name).trim(),
      createdAt: FieldValue.serverTimestamp(),
    });
    return { deptId: ref.id };
  }
);

export const createCommittee = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const caller = getCaller(request);
    requireRole(caller, "companyAdmin", "secretary");
    const { name, members } = request.data || {};
    if (!name) throw new HttpsError("invalid-argument", "name required.");

    const ref = db.collection("committees").doc();
    await ref.set({
      committeeId: ref.id,
      tenantId: caller.tenantId,
      name: String(name).trim(),
      members: Array.isArray(members) ? members : [],
      createdAt: FieldValue.serverTimestamp(),
    });
    return { committeeId: ref.id };
  }
);

export const setCommitteeMembers = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const caller = getCaller(request);
    requireRole(caller, "companyAdmin", "secretary");
    const { committeeId, members } = request.data || {};
    if (!committeeId || !Array.isArray(members)) {
      throw new HttpsError("invalid-argument", "committeeId and members[] required.");
    }
    const ref = db.collection("committees").doc(committeeId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Committee not found.");
    }
    await ref.update({ members, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, count: members.length };
  }
);
