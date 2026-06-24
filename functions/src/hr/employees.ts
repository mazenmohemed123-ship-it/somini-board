/**
 * Employee (HR core) management.
 *
 *  createEmployee  (callable): add one employee with national-ID uniqueness.
 *  updateEmployee  (callable): edit mutable fields.
 *  deleteEmployee  (callable): remove an employee (staff only).
 *  bulkImportEmployees (callable): accept parsed CSV rows; small batches run
 *      inline, large ones are handed to a Cloud Task (importEmployeesTask).
 *
 * Employees are tenant-scoped and optionally linked to a branch + department.
 * The national ID is stored hashed (nationalIdHash) and enforced unique within
 * the tenant via a transaction against that hash.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { logger } from "firebase-functions/v2";
import { db, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";
import { getCaller, canManageBranch, hashNationalId } from "../lib/context";

interface EmployeeInput {
  fullName: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  branchId?: string;
  department?: string;
  position?: string;
  managerId?: string;
}

async function assertUniqueNationalId(
  tenantId: string,
  nidHash: string,
  tx: FirebaseFirestore.Transaction
) {
  const dup = await tx.get(
    db.collection("employees")
      .where("tenantId", "==", tenantId)
      .where("nationalIdHash", "==", nidHash)
      .limit(1)
  );
  if (!dup.empty) {
    throw new HttpsError("already-exists", "An employee with this national ID already exists.");
  }
}

export const createEmployee = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = getCaller(request);
  const d = request.data as EmployeeInput;
  if (!d.fullName) throw new HttpsError("invalid-argument", "fullName is required.");
  if (!canManageBranch(caller, d.branchId)) {
    throw new HttpsError("permission-denied", "Not allowed to manage this branch.");
  }

  const ref = db.collection("employees").doc();
  const nidHash = d.nationalId ? hashNationalId(caller.tenantId, d.nationalId) : null;

  await db.runTransaction(async (tx) => {
    if (nidHash) await assertUniqueNationalId(caller.tenantId, nidHash, tx);
    tx.set(ref, {
      employeeId: ref.id,
      tenantId: caller.tenantId,
      branchId: d.branchId ?? null,
      fullName: d.fullName.trim(),
      email: d.email?.trim() ?? "",
      phone: d.phone?.trim() ?? "",
      nationalIdHash: nidHash,
      department: d.department ?? null,
      position: d.position ?? "",
      managerId: d.managerId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { employeeId: ref.id };
});

export const updateEmployee = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = getCaller(request);
  const { employeeId, ...patch } = request.data || {};
  if (!employeeId) throw new HttpsError("invalid-argument", "employeeId required.");

  const ref = db.collection("employees").doc(employeeId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  if (!canManageBranch(caller, snap.data()!.branchId)) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
  // Immutable: tenantId + nationalIdHash.
  delete patch.tenantId;
  delete patch.nationalIdHash;
  delete patch.nationalId;
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const deleteEmployee = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = getCaller(request);
  const { employeeId } = request.data || {};
  if (caller.role !== "companyAdmin" && caller.role !== "secretary") {
    throw new HttpsError("permission-denied", "Company staff only.");
  }
  const ref = db.collection("employees").doc(employeeId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  await ref.delete();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Bulk CSV import
// ---------------------------------------------------------------------------
const INLINE_LIMIT = 200; // rows we write directly; above this we use a task

async function writeEmployeeBatch(tenantId: string, rows: EmployeeInput[]): Promise<number> {
  let written = 0;
  // Firestore batches cap at 500 writes.
  for (let i = 0; i < rows.length; i += 400) {
    const slice = rows.slice(i, i + 400);
    const batch = db.batch();
    for (const r of slice) {
      if (!r.fullName) continue;
      const ref = db.collection("employees").doc();
      batch.set(ref, {
        employeeId: ref.id,
        tenantId,
        branchId: r.branchId ?? null,
        fullName: String(r.fullName).trim(),
        email: r.email ?? "",
        phone: r.phone ?? "",
        nationalIdHash: r.nationalId ? hashNationalId(tenantId, String(r.nationalId)) : null,
        department: r.department ?? null,
        position: r.position ?? "",
        managerId: r.managerId ?? null,
        importedAt: FieldValue.serverTimestamp(),
      });
      written++;
    }
    await batch.commit();
  }
  return written;
}

export const bulkImportEmployees = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, timeoutSeconds: 120 },
  async (request) => {
    const caller = getCaller(request);
    if (caller.role !== "companyAdmin" && caller.role !== "secretary") {
      throw new HttpsError("permission-denied", "Company staff only.");
    }
    const rows = (request.data?.rows ?? []) as EmployeeInput[];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new HttpsError("invalid-argument", "rows[] required.");
    }

    if (rows.length <= INLINE_LIMIT) {
      const written = await writeEmployeeBatch(caller.tenantId, rows);
      return { mode: "inline", written };
    }

    // Large import: chunk into tasks so we don't block the caller / hit timeouts.
    const { getFunctions } = await import("firebase-admin/functions");
    const queue = getFunctions().taskQueue("importEmployeesTask");
    let enqueued = 0;
    for (let i = 0; i < rows.length; i += INLINE_LIMIT) {
      await queue.enqueue({ tenantId: caller.tenantId, rows: rows.slice(i, i + INLINE_LIMIT) });
      enqueued++;
    }
    return { mode: "queued", chunks: enqueued, total: rows.length };
  }
);

export const importEmployeesTask = onTaskDispatched(
  { region: REGION, retryConfig: { maxAttempts: 5, minBackoffSeconds: 30 } },
  async (req) => {
    const { tenantId, rows } = req.data as { tenantId: string; rows: EmployeeInput[] };
    const written = await writeEmployeeBatch(tenantId, rows);
    logger.info(`importEmployeesTask wrote ${written} employees for ${tenantId}`);
  }
);
