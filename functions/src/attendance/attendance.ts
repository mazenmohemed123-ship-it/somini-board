/**
 * Attendance & time tracking.
 *
 *  setAttendanceConfig (companyAdmin): work hours, late grace, work days and
 *      GPS geofence radius — stored on the tenant doc. Company admin only.
 *  setBranchLocation  (staff): set a branch's GPS coordinates (the geofence
 *      centre employees must be near to check in).
 *  createEmployeeLogin (companyAdmin/hr): create a login account for an
 *      employee so they can check in/out themselves. Works for both
 *      self-registered (project-level) and Identity-Platform tenants.
 *  checkIn  (employee): verify the caller is inside their branch geofence,
 *      record check-in, and compute present/late + late minutes.
 *  checkOut (employee): record check-out and worked minutes.
 *
 * Attendance is written exclusively by these functions (Admin SDK), so the
 * Firestore rules keep the collection read-only for clients.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, auth, FieldValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";
import { getCaller, requireRole, isStaff } from "../lib/context";

export interface AttendanceConfig {
  workStart: string;        // "HH:MM" 24h, local to timezone
  workEnd: string;          // "HH:MM"
  lateAfterMinutes: number; // grace period after workStart
  workDays: number[];       // 0=Sun .. 6=Sat
  geofenceRadius: number;   // metres
  timezone: string;         // IANA tz, e.g. "Africa/Cairo"
}

// Sensible defaults (Egypt work week Sun–Thu, 9–5, 15-min grace, 150 m).
const DEFAULT_CONFIG: AttendanceConfig = {
  workStart: "09:00",
  workEnd: "17:00",
  lateAfterMinutes: 15,
  workDays: [0, 1, 2, 3, 4],
  geofenceRadius: 150,
  timezone: "Africa/Cairo",
};

// ---------------------------------------------------------------------------
// Small geo / time helpers
// ---------------------------------------------------------------------------

/** Great-circle distance between two lat/lng points, in metres (Haversine). */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** "HH:MM" -> minutes since midnight. */
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Current local date string + minutes-since-midnight + weekday in a timezone. */
function nowInTz(tz: string): { date: string; minutes: number; dayOfWeek: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const dayOfWeek = WEEKDAY_MAP[get("weekday")] ?? new Date().getDay();
  return { date, minutes, dayOfWeek };
}

async function loadConfig(tenantId: string): Promise<AttendanceConfig> {
  const snap = await db.collection("tenants").doc(tenantId).get();
  const cfg = snap.exists ? (snap.data()!.attendanceConfig as Partial<AttendanceConfig>) : null;
  return { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
}

// ---------------------------------------------------------------------------
// Configuration (admin)
// ---------------------------------------------------------------------------

export const setAttendanceConfig = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    // Only the company admin may set the work schedule (per product decision).
    requireRole(caller, "companyAdmin");
    const d = (request.data || {}) as Partial<AttendanceConfig>;

    const merged: AttendanceConfig = { ...DEFAULT_CONFIG };
    if (typeof d.workStart === "string" && /^\d{2}:\d{2}$/.test(d.workStart)) merged.workStart = d.workStart;
    if (typeof d.workEnd === "string" && /^\d{2}:\d{2}$/.test(d.workEnd)) merged.workEnd = d.workEnd;
    if (Number.isFinite(d.lateAfterMinutes)) merged.lateAfterMinutes = Math.max(0, Number(d.lateAfterMinutes));
    if (Array.isArray(d.workDays)) merged.workDays = d.workDays.filter((n) => n >= 0 && n <= 6);
    if (Number.isFinite(d.geofenceRadius)) merged.geofenceRadius = Math.max(20, Number(d.geofenceRadius));
    if (typeof d.timezone === "string" && d.timezone) merged.timezone = d.timezone;

    await db.collection("tenants").doc(caller.tenantId).set(
      { attendanceConfig: merged, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { ok: true, config: merged };
  }
);

export const setBranchLocation = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    if (!isStaff(caller)) throw new HttpsError("permission-denied", "Company staff only.");
    const { branchId, lat, lng, radius } = request.data || {};
    if (!branchId) throw new HttpsError("invalid-argument", "branchId required.");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpsError("invalid-argument", "Valid lat/lng required.");
    }

    const ref = db.collection("branches").doc(branchId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Branch not found.");
    }
    await ref.update({
      location: { lat: Number(lat), lng: Number(lng) },
      ...(Number.isFinite(radius) ? { geofenceRadius: Math.max(20, Number(radius)) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// Employee login provisioning (admin / hr)
// ---------------------------------------------------------------------------

export const createEmployeeLogin = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, memory: "512MiB" },
  async (request) => {
    const caller = getCaller(request);
    requireRole(caller, "companyAdmin", "hr");
    const { employeeId, email, password } = request.data || {};
    if (!employeeId || !email || !password) {
      throw new HttpsError("invalid-argument", "employeeId, email and password are required.");
    }
    if (String(password).length < 8) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }

    const empRef = db.collection("employees").doc(employeeId);
    const empSnap = await empRef.get();
    if (!empSnap.exists || empSnap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Employee not found.");
    }
    const emp = empSnap.data()!;
    if (emp.authUid) {
      throw new HttpsError("already-exists", "This employee already has a login.");
    }

    // Identity-Platform tenant vs. project-level (self-registered) company.
    const isIdentityTenant = !!(request.auth!.token.firebase as any)?.tenant;
    const targetAuth = isIdentityTenant
      ? auth.tenantManager().authForTenant(caller.tenantId)
      : auth;

    let user;
    try {
      user = await targetAuth.createUser({
        email: String(email).trim(),
        password: String(password),
        displayName: emp.fullName,
      });
    } catch (e: any) {
      if (e?.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "This email is already in use.");
      }
      throw new HttpsError("internal", "Could not create the login account.");
    }

    const claims: Record<string, unknown> = {
      role: "employee",
      tenantId: caller.tenantId,
      companyId: caller.companyId ?? caller.tenantId,
      employeeId,
    };
    if (emp.branchId) claims.branchId = emp.branchId;
    await targetAuth.setCustomUserClaims(user.uid, claims);

    await empRef.update({
      authUid: user.uid,
      hasLogin: true,
      email: String(email).trim(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, authUid: user.uid };
  }
);

// ---------------------------------------------------------------------------
// Check-in / check-out (employee)
// ---------------------------------------------------------------------------

export const checkIn = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    if (!caller.employeeId) {
      throw new HttpsError("permission-denied", "Only employees with a profile can check in.");
    }
    const { lat, lng } = request.data || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpsError("invalid-argument", "Location (lat/lng) is required to check in.");
    }

    const empSnap = await db.collection("employees").doc(caller.employeeId).get();
    if (!empSnap.exists || empSnap.data()!.tenantId !== caller.tenantId) {
      throw new HttpsError("not-found", "Employee profile not found.");
    }
    const emp = empSnap.data()!;
    if (!emp.branchId) {
      throw new HttpsError("failed-precondition", "You are not assigned to a branch.");
    }

    const branchSnap = await db.collection("branches").doc(emp.branchId).get();
    if (!branchSnap.exists) throw new HttpsError("not-found", "Branch not found.");
    const branch = branchSnap.data()!;
    if (!branch.location?.lat || !branch.location?.lng) {
      throw new HttpsError("failed-precondition", "Your branch has no location set. Ask your admin.");
    }

    const config = await loadConfig(caller.tenantId);
    const radius = Number(branch.geofenceRadius) || config.geofenceRadius;
    const distance = distanceMeters({ lat, lng }, branch.location);
    if (distance > radius) {
      throw new HttpsError(
        "failed-precondition",
        `You are ${distance}m from the branch (allowed ${radius}m). Move closer to check in.`
      );
    }

    const { date, minutes, dayOfWeek } = nowInTz(config.timezone);
    const recordId = `${caller.employeeId}_${date}`;
    const ref = db.collection("attendance").doc(recordId);

    const lateThreshold = parseHHMM(config.workStart) + config.lateAfterMinutes;
    const isLate = minutes > lateThreshold;
    const lateMinutes = isLate ? minutes - parseHHMM(config.workStart) : 0;
    const isWorkDay = config.workDays.includes(dayOfWeek);

    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && existing.data()!.checkInAt) {
        throw new HttpsError("already-exists", "You already checked in today.");
      }
      tx.set(ref, {
        attendanceId: recordId,
        tenantId: caller.tenantId,
        employeeId: caller.employeeId,
        branchId: emp.branchId,
        date,
        checkInAt: FieldValue.serverTimestamp(),
        checkInLocation: { lat: Number(lat), lng: Number(lng) },
        checkInDistance: distance,
        checkOutAt: null,
        workedMinutes: null,
        status: isLate ? "late" : "present",
        lateMinutes,
        offDay: !isWorkDay,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { status: isLate ? "late" : "present", lateMinutes, distance };
    });

    return { ok: true, ...result };
  }
);

export const checkOut = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    if (!caller.employeeId) {
      throw new HttpsError("permission-denied", "Only employees with a profile can check out.");
    }
    const { lat, lng } = request.data || {};

    const config = await loadConfig(caller.tenantId);
    const { date } = nowInTz(config.timezone);
    const ref = db.collection("attendance").doc(`${caller.employeeId}_${date}`);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || !snap.data()!.checkInAt) {
        throw new HttpsError("failed-precondition", "You have not checked in today.");
      }
      if (snap.data()!.checkOutAt) {
        throw new HttpsError("already-exists", "You already checked out today.");
      }
      const checkInAt = snap.data()!.checkInAt.toDate();
      const workedMinutes = Math.max(0, Math.round((Date.now() - checkInAt.getTime()) / 60000));
      tx.update(ref, {
        checkOutAt: FieldValue.serverTimestamp(),
        ...(Number.isFinite(lat) && Number.isFinite(lng)
          ? { checkOutLocation: { lat: Number(lat), lng: Number(lng) } }
          : {}),
        workedMinutes,
      });
      return { workedMinutes };
    });

    return { ok: true, ...result };
  }
);
