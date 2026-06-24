/**
 * Platform-owner (superAdmin) callables.
 *
 * These power the `/admin` dashboard, which lets the platform owner manage
 * every tenant company from one place. The superAdmin is a project-level user
 * (it does NOT belong to any Identity Platform tenant), so these functions are
 * guarded purely by the `superAdmin` role claim — never by tenant membership.
 *
 * All cross-tenant aggregation runs through the Admin SDK here (which bypasses
 * Firestore rules) so the dashboard never needs broad client-side read access
 * to other companies' data.
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db, auth, FieldValue, REGION } from "../lib/admin";

/**
 * Shared options for the owner callables. App Check is verified when a token is
 * present but not *enforced*, so the console works before a reCAPTCHA key is
 * wired up. Access control never relies on App Check — every function below
 * re-checks the `superAdmin` role claim server-side, so a missing/forged App
 * Check token cannot reach any data. Set ENFORCE_APP_CHECK=true once a
 * reCAPTCHA v3 site key is configured for full anti-abuse hardening.
 */
const OWNER_OPTS = {
  region: REGION,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true",
} as const;

/** Throw unless the caller carries the superAdmin role claim. */
function requireSuperAdmin(request: CallableRequest): string {
  const token = request.auth?.token as Record<string, any> | undefined;
  if (!token || token.role !== "superAdmin") {
    throw new HttpsError("permission-denied", "superAdmin only.");
  }
  return request.auth!.uid;
}

/** Count documents in a query without reading them (server-side aggregation). */
async function countOf(query: FirebaseFirestore.Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

const startOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * getSuperAdminStats — headline numbers for the dashboard cards plus a
 * six-month tenant-growth series for the chart.
 */
export const getSuperAdminStats = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);

    const tenantsCol = db.collection("tenants");
    const [
      totalTenants,
      activeTenants,
      totalEmployees,
      activeElections,
      activeSubscriptions,
    ] = await Promise.all([
      countOf(tenantsCol),
      countOf(tenantsCol.where("status", "in", ["active", "trial"])),
      countOf(db.collection("employees")),
      countOf(db.collection("elections").where("status", "==", "active")),
      countOf(db.collection("subscriptions").where("status", "==", "active")),
    ]);

    // Monthly subscription revenue (sum of active subscriptions' monthlyPrice).
    const subsSnap = await db
      .collection("subscriptions")
      .where("status", "==", "active")
      .get();
    let monthlyRevenue = 0;
    for (const s of subsSnap.docs) {
      monthlyRevenue += Number(s.data().monthlyPrice ?? 0);
    }

    // Tenant-growth series: number of companies created in each of the last
    // six months (oldest first), for the dashboard chart.
    const now = new Date();
    const buckets: { label: string; from: Date; to: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const from = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
      const to = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i + 1, 1));
      buckets.push({
        label: from.toLocaleDateString("ar-EG", { month: "short", year: "numeric" }),
        from,
        to,
      });
    }
    const growth = await Promise.all(
      buckets.map(async (b) => ({
        label: b.label,
        count: await countOf(
          tenantsCol
            .where("createdAt", ">=", b.from)
            .where("createdAt", "<", b.to)
        ),
      }))
    );

    return {
      totalTenants,
      activeTenants,
      totalEmployees,
      activeElections,
      activeSubscriptions,
      monthlyRevenue,
      growth,
    };
  }
);

/**
 * listAllTenants — every company with a compact stats summary for the table.
 */
export const listAllTenants = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);

    const snap = await db.collection("tenants").orderBy("createdAt", "desc").get();

    const tenants = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data();
        const tenantId = doc.id;
        const [employees, elections] = await Promise.all([
          countOf(db.collection("employees").where("tenantId", "==", tenantId)),
          countOf(db.collection("elections").where("tenantId", "==", tenantId)),
        ]);
        // Most recent subscription for this tenant (if any).
        const subSnap = await db
          .collection("subscriptions")
          .where("tenantId", "==", tenantId)
          .orderBy("endDate", "desc")
          .limit(1)
          .get();
        const sub = subSnap.empty ? null : subSnap.docs[0].data();

        return {
          tenantId,
          companyName: data.companyName ?? "—",
          plan: data.plan ?? "free",
          status: data.status ?? "active",
          createdAt: data.createdAt?.toMillis?.() ?? null,
          employees,
          elections,
          subscriptionStatus: sub?.status ?? "none",
          subscriptionEndDate: sub?.endDate?.toMillis?.() ?? null,
        };
      })
    );

    return { tenants };
  }
);

/**
 * getTenantDetails — full picture for one company's detail page.
 */
export const getTenantDetails = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);
    const { tenantId } = request.data || {};
    if (!tenantId) throw new HttpsError("invalid-argument", "tenantId required.");

    const tDoc = await db.collection("tenants").doc(tenantId).get();
    if (!tDoc.exists) throw new HttpsError("not-found", "Tenant not found.");
    const tenant = tDoc.data()!;

    const [employees, branches, elections, motions, committees, meetings] =
      await Promise.all([
        countOf(db.collection("employees").where("tenantId", "==", tenantId)),
        countOf(db.collection("branches").where("tenantId", "==", tenantId)),
        countOf(db.collection("elections").where("tenantId", "==", tenantId)),
        countOf(db.collection("motions").where("tenantId", "==", tenantId)),
        countOf(db.collection("committees").where("tenantId", "==", tenantId)),
        countOf(db.collection("meetings").where("tenantId", "==", tenantId)),
      ]);

    const subSnap = await db
      .collection("subscriptions")
      .where("tenantId", "==", tenantId)
      .orderBy("endDate", "desc")
      .limit(1)
      .get();
    const subscription = subSnap.empty
      ? null
      : {
          id: subSnap.docs[0].id,
          ...subSnap.docs[0].data(),
          startDate: subSnap.docs[0].data().startDate?.toMillis?.() ?? null,
          endDate: subSnap.docs[0].data().endDate?.toMillis?.() ?? null,
        };

    return {
      tenantId,
      companyName: tenant.companyName ?? "—",
      plan: tenant.plan ?? "free",
      status: tenant.status ?? "active",
      createdAt: tenant.createdAt?.toMillis?.() ?? null,
      contactEmail: tenant.contactEmail ?? null,
      stats: { employees, branches, elections, motions, committees, meetings },
      subscription,
    };
  }
);

/**
 * toggleTenantStatus — freeze or re-activate a company.
 *
 * Besides flipping the tenant doc's status, this disables email sign-in on the
 * company's Identity Platform tenant so frozen companies genuinely cannot
 * authenticate. The IP update is best-effort: if the tenant has no Identity
 * Platform counterpart (e.g. seeded demo data) we still record the status.
 */
export const toggleTenantStatus = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);
    const { tenantId, active } = request.data || {};
    if (!tenantId || typeof active !== "boolean") {
      throw new HttpsError("invalid-argument", "tenantId and active(boolean) required.");
    }

    const status = active ? "active" : "disabled";
    await db.collection("tenants").doc(tenantId).set(
      { status, statusUpdatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    let identityPlatformUpdated = false;
    try {
      await auth.tenantManager().updateTenant(tenantId, {
        emailSignInConfig: { enabled: active, passwordRequired: true },
      });
      identityPlatformUpdated = true;
    } catch {
      /* Demo/seed tenants may not have an IP tenant — status doc is the source of truth. */
    }

    return { ok: true, tenantId, status, identityPlatformUpdated };
  }
);

/**
 * updateSubscription — change a company's plan and/or extend its term.
 * Upserts the latest subscription record and mirrors the plan onto the tenant.
 */
export const updateSubscription = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);
    const { tenantId, plan, endDate, monthlyPrice } = request.data || {};
    if (!tenantId || !plan) {
      throw new HttpsError("invalid-argument", "tenantId and plan required.");
    }

    const end = endDate ? new Date(Number(endDate)) : null;
    const now = new Date();
    const active = !end || end.getTime() > now.getTime();

    // Find the tenant's current subscription, or create a new one.
    const existing = await db
      .collection("subscriptions")
      .where("tenantId", "==", tenantId)
      .orderBy("endDate", "desc")
      .limit(1)
      .get();
    const ref = existing.empty
      ? db.collection("subscriptions").doc()
      : existing.docs[0].ref;

    await ref.set(
      {
        subscriptionId: ref.id,
        tenantId,
        plan,
        status: active ? "active" : "expired",
        monthlyPrice: Number(monthlyPrice ?? 0),
        startDate: existing.empty ? FieldValue.serverTimestamp() : existing.docs[0].data().startDate,
        endDate: end ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth!.uid,
      },
      { merge: true }
    );

    await db.collection("tenants").doc(tenantId).set({ plan }, { merge: true });

    return { ok: true, subscriptionId: ref.id, status: active ? "active" : "expired" };
  }
);

/**
 * listAllSubscriptions — every subscription across all companies, with the
 * company name resolved for display. Supports an optional `filter`:
 *   "expiring" → ends within 30 days · "expired" → already past.
 */
export const listAllSubscriptions = onCall(
  OWNER_OPTS,
  async (request) => {
    requireSuperAdmin(request);
    const { filter } = request.data || {};

    const snap = await db.collection("subscriptions").orderBy("endDate", "desc").get();

    // Resolve tenant names in one pass.
    const tenantNames = new Map<string, string>();
    const tenantsSnap = await db.collection("tenants").get();
    tenantsSnap.docs.forEach((d) => tenantNames.set(d.id, d.data().companyName ?? d.id));

    const now = Date.now();
    const in30Days = now + 30 * 24 * 60 * 60 * 1000;

    let subscriptions = snap.docs.map((d) => {
      const data = d.data();
      const endMs = data.endDate?.toMillis?.() ?? null;
      return {
        id: d.id,
        tenantId: data.tenantId,
        companyName: tenantNames.get(data.tenantId) ?? data.tenantId,
        plan: data.plan ?? "free",
        status: data.status ?? "active",
        monthlyPrice: Number(data.monthlyPrice ?? 0),
        startDate: data.startDate?.toMillis?.() ?? null,
        endDate: endMs,
      };
    });

    if (filter === "expiring") {
      subscriptions = subscriptions.filter(
        (s) => s.endDate && s.endDate >= now && s.endDate <= in30Days
      );
    } else if (filter === "expired") {
      subscriptions = subscriptions.filter((s) => s.endDate && s.endDate < now);
    }

    return { subscriptions };
  }
);
