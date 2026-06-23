/**
 * Shared helpers for reading the verified caller context out of a callable
 * request, plus small guards used across the governance functions.
 */
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { createHash } from "crypto";

export interface CallerContext {
  uid: string;
  role: string;
  tenantId: string;
  companyId?: string;
  branchId?: string;
  employeeId?: string;
}

/** Extract and validate the caller; throws if unauthenticated or tenant-less. */
export function getCaller(request: CallableRequest): CallerContext {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const token = auth.token as Record<string, any>;
  const tenantId = token.firebase?.tenant ?? token.tenantId;
  if (!tenantId) throw new HttpsError("failed-precondition", "Account has no tenant.");
  return {
    uid: auth.uid,
    role: token.role,
    tenantId,
    companyId: token.companyId,
    branchId: token.branchId,
    employeeId: token.employeeId,
  };
}

export function requireRole(caller: CallerContext, ...roles: string[]): void {
  if (!roles.includes(caller.role)) {
    throw new HttpsError("permission-denied", `Requires one of: ${roles.join(", ")}.`);
  }
}

/** Company staff = companyAdmin or secretary. */
export function isStaff(caller: CallerContext): boolean {
  return caller.role === "companyAdmin" || caller.role === "secretary";
}

/** Can the caller manage this branch (staff, or that branch's manager)? */
export function canManageBranch(caller: CallerContext, branchId?: string): boolean {
  if (isStaff(caller)) return true;
  return caller.role === "branchManager" && !!branchId && caller.branchId === branchId;
}

/** Hash a national ID, salted per-tenant so the same person isn't cross-linkable. */
export function hashNationalId(tenantId: string, nationalId: string): string {
  return createHash("sha256").update(`${tenantId}:${nationalId}`).digest("hex");
}
