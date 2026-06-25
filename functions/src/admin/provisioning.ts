/**
 * Provisioning callables used by the superAdmin / companyAdmin dashboards.
 *
 *  provisionCompany  (superAdmin): creates an Identity Platform tenant, a
 *                     company doc, and the first companyAdmin user.
 *  setUserRole       (superAdmin/companyAdmin): assigns role claims within a
 *                     tenant (cannot escalate beyond own tenant).
 *  createIntegration (companyAdmin): registers a connected app and returns a
 *                     one-time API key (only the hash is stored).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomBytes, createHash } from "crypto";
import { db, auth, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";

function newApiKey(): { key: string; hash: string } {
  const key = `sk_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash };
}

/**
 * registerCompany — PUBLIC self-service signup.
 *
 * Any visitor can register their own company and become its first
 * companyAdmin. Unlike provisionCompany (superAdmin-only, Identity Platform
 * tenant), this creates a *project-level* user carrying a `tenantId` custom
 * claim. Tenant isolation in the rules/functions falls back to that claim
 * (callerTenant() reads token.firebase.tenant OR token.tenantId), so a
 * project-level companyAdmin is fully scoped to its own company with no
 * Identity Platform tenant needed. This keeps sign-in dead simple: the user
 * just signs in with email/password against the default project auth.
 *
 * App Check is NOT enforced here so signup works before a reCAPTCHA key is
 * wired up; abuse is mitigated by email uniqueness + the trial plan default.
 */
export const registerCompany = onCall(
  { region: REGION, enforceAppCheck: false, memory: "512MiB", invoker: "public" },
  async (request) => {
    const { companyName, adminEmail, adminPassword, contactEmail } = request.data || {};
    if (!companyName || !adminEmail || !adminPassword) {
      throw new HttpsError(
        "invalid-argument",
        "companyName, adminEmail and adminPassword are required."
      );
    }
    if (String(adminPassword).length < 8) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }

    // Reject if the email is already registered at the project level.
    try {
      await auth.getUserByEmail(adminEmail);
      throw new HttpsError("already-exists", "This email is already registered.");
    } catch (e: any) {
      if (e instanceof HttpsError) throw e;
      // auth/user-not-found is the happy path — continue.
      if (e?.code && e.code !== "auth/user-not-found") {
        throw new HttpsError("internal", "Could not verify email availability.");
      }
    }

    // Create the project-level admin user.
    const user = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: `${companyName} Admin`,
    });

    // The tenant/company id is the admin's uid — unique and stable.
    const tenantId = user.uid;

    // Company root record (status "trial" so it shows up as active).
    await db.collection("tenants").doc(tenantId).set({
      tenantId,
      companyName,
      plan: "free",
      status: "trial",
      contactEmail: contactEmail ?? adminEmail,
      selfRegistered: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Scope the user to their own company via custom claims.
    await auth.setCustomUserClaims(user.uid, {
      role: "companyAdmin",
      tenantId,
      companyId: tenantId,
    });

    return { ok: true, tenantId, companyId: tenantId, adminUid: user.uid };
  }
);

export const provisionCompany = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (request.auth?.token.role !== "superAdmin") {
      throw new HttpsError("permission-denied", "superAdmin only.");
    }
    const { name, plan, adminEmail, adminPassword } = request.data || {};
    if (!name || !adminEmail || !adminPassword) {
      throw new HttpsError("invalid-argument", "name, adminEmail, adminPassword required.");
    }

    // Create an isolated Identity Platform tenant for this company.
    const tenant = await auth.tenantManager().createTenant({
      displayName: String(name).slice(0, 36),
      emailSignInConfig: { enabled: true, passwordRequired: true },
      multiFactorConfig: { state: "ENABLED", factorIds: ["phone"] },
    });
    const tenantId = tenant.tenantId;

    // The tenant root record (companyName lives here per the data model).
    await db.collection("tenants").doc(tenantId).set({
      tenantId,
      companyName: name,
      plan: plan ?? "free",
      createdAt: FieldValue.serverTimestamp(),
    });

    // First companyAdmin, scoped to the new tenant.
    const tenantAuth = auth.tenantManager().authForTenant(tenantId);
    const user = await tenantAuth.createUser({ email: adminEmail, password: adminPassword });
    await tenantAuth.setCustomUserClaims(user.uid, {
      role: "companyAdmin",
      tenantId,
      companyId: tenantId,
    });

    return { companyId: tenantId, tenantId, adminUid: user.uid };
  }
);

export const setUserRole = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = request.auth?.token;
    if (!caller) throw new HttpsError("unauthenticated", "Sign in required.");
    const { uid, role, branchId, employeeId } = request.data || {};
    const allowedRoles = ["companyAdmin", "branchManager", "secretary", "hr", "employee", "voter"];
    if (!uid || !allowedRoles.includes(role)) {
      throw new HttpsError("invalid-argument", "Valid uid and role required.");
    }
    // branchManager must be tied to a branch.
    if (role === "branchManager" && !branchId) {
      throw new HttpsError("invalid-argument", "branchManager requires branchId.");
    }

    const tenantId = caller.firebase?.tenant ?? (caller as any).tenantId;
    const companyId = (caller as any).companyId;
    const isSuper = caller.role === "superAdmin";
    const isAdmin = caller.role === "companyAdmin";
    if (!isSuper && !isAdmin) {
      throw new HttpsError("permission-denied", "Insufficient role.");
    }
    // companyAdmin may not mint another companyAdmin or cross tenants.
    if (isAdmin && role === "companyAdmin") {
      throw new HttpsError("permission-denied", "Cannot grant companyAdmin.");
    }

    const newClaims: Record<string, unknown> = { role, tenantId, companyId };
    if (branchId) newClaims.branchId = branchId;
    if (employeeId) newClaims.employeeId = employeeId;

    const tenantAuth = tenantId ? auth.tenantManager().authForTenant(tenantId) : auth;
    await tenantAuth.setCustomUserClaims(uid, newClaims);
    return { ok: true };
  }
);

/**
 * claimOwnership — self-service repair for a company owner whose admin claims
 * went missing (e.g. an old account from before claims were set, or a token
 * that never picked them up). SAFE BY CONSTRUCTION: registerCompany always uses
 * `tenantId = ownerUid`, so the tenant doc id IS the owner's uid. We only grant
 * companyAdmin when a tenant doc exists whose id equals the caller's uid — i.e.
 * the caller provably created that company. Nobody can claim someone else's.
 */
export const claimOwnership = onCall(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const tDoc = await db.collection("tenants").doc(uid).get();
    if (!tDoc.exists) {
      throw new HttpsError(
        "not-found",
        "This account does not own a company. Register a company first, or ask your admin for access."
      );
    }

    await auth.setCustomUserClaims(uid, {
      role: "companyAdmin",
      tenantId: uid,
      companyId: uid,
    });
    return { ok: true, tenantId: uid };
  }
);

export const listTenantUsers = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = request.auth?.token;
    if (!caller) throw new HttpsError("unauthenticated", "Sign in required.");
    const tenantId = caller.firebase?.tenant ?? (caller as any).tenantId;
    const role = caller.role as string;

    if (role !== "superAdmin" && role !== "companyAdmin") {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const targetTenantId = (request.data || {}).tenantId;
    if (!targetTenantId) throw new HttpsError("invalid-argument", "tenantId required.");

    // companyAdmin can only list users in their own tenant.
    if (role === "companyAdmin" && targetTenantId !== tenantId) {
      throw new HttpsError("permission-denied", "Cannot list other tenants.");
    }

    // List all users and filter by tenantId claim. This is the simplest approach
    // for project-level users. For Identity Platform tenants, we'd iterate the
    // tenantAuth API, but that's handled separately below.
    let users: any[] = [];
    let pageToken: string | undefined;

    // Project-level users (created via registerCompany).
    do {
      const result = await auth.listUsers(1000, pageToken);
      users.push(
        ...result.users
          .filter((u) => {
            const claims = u.customClaims || {};
            return claims.tenantId === targetTenantId;
          })
          .map((u) => ({
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "",
            role: u.customClaims?.role || "—",
            branchId: u.customClaims?.branchId || null,
            employeeId: u.customClaims?.employeeId || null,
          }))
      );
      pageToken = result.pageToken;
    } while (pageToken);

    // For Identity Platform tenants, also try listing from the tenant's auth instance.
    try {
      const tenantAuth = auth.tenantManager().authForTenant(targetTenantId);
      let tenantPageToken: string | undefined;
      do {
        const result = await tenantAuth.listUsers(1000, tenantPageToken);
        users.push(
          ...result.users.map((u) => ({
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "",
            role: u.customClaims?.role || "—",
            branchId: u.customClaims?.branchId || null,
            employeeId: u.customClaims?.employeeId || null,
          }))
        );
        tenantPageToken = result.pageToken;
      } while (tenantPageToken);
    } catch (e) {
      // Tenant may not be an Identity Platform tenant; that's fine.
    }

    return { users };
  }
);

export const createIntegration = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = request.auth?.token;
    if (caller?.role !== "companyAdmin") {
      throw new HttpsError("permission-denied", "companyAdmin only.");
    }
    const tenantId = caller.firebase?.tenant ?? (caller as any).tenantId;
    const companyId = (caller as any).companyId;
    const { appName, appLogo, callbackUrl } = request.data || {};
    if (!appName) throw new HttpsError("invalid-argument", "appName required.");

    const { key, hash } = newApiKey();
    const signingSecret = randomBytes(24).toString("hex");
    const ref = db.collection("integrations").doc();
    await ref.set({
      integrationId: ref.id,
      companyId,
      tenantId,
      appName,
      appLogo: appLogo ?? "",
      callbackUrl: callbackUrl ?? "",
      apiKeyHash: hash,
      apiKeyPrefix: key.slice(0, 12),
      signingSecret,
      status: "active",
      createdBy: request.auth!.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    // The raw key is returned exactly once; only the hash is persisted.
    return { integrationId: ref.id, apiKey: key, signingSecret };
  }
);
