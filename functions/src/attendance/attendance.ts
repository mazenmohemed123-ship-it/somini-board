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
 *  getMonthlyReport (staff): get attendance stats for a month.
 *  getEmployeeLocations (manager): get real-time locations of branch employees.
 *  exportAttendanceExcel (staff): export attendance data as Excel file (async).
 *  sendAttendanceAlerts (scheduled): send daily notifications for late/absent employees.
 *
 * Attendance is written exclusively by these functions (Admin SDK), so the
 * Firestore rules keep the collection read-only for clients.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
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

/**
 * Run a Firestore query, translating the "requires an index" /
 * FAILED_PRECONDITION error into a clear client-facing message instead of a
 * generic "internal" error. A freshly deployed composite index can take a few
 * minutes to build; during that window queries fail with this code.
 */
async function runQuery(
  query: FirebaseFirestore.Query
): Promise<FirebaseFirestore.QuerySnapshot> {
  try {
    return await query.get();
  } catch (err: any) {
    if (err?.code === 9 || /FAILED_PRECONDITION|requires an index/i.test(String(err?.message))) {
      logger.error("Attendance query needs an index (still building?):", err?.message);
      throw new HttpsError(
        "failed-precondition",
        "The report index is still being built. Please try again in a few minutes."
      );
    }
    throw err;
  }
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

// ---------------------------------------------------------------------------
// Monthly Reports (staff)
// ---------------------------------------------------------------------------

export interface MonthlyReportStats {
  year: number;
  month: number;
  totalEmployees: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  averageWorkedMinutes: number;
  employeeStats: Array<{
    employeeId: string;
    fullName: string;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    totalWorkedMinutes: number;
  }>;
}

export const getMonthlyReport = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    if (!isStaff(caller)) throw new HttpsError("permission-denied", "Staff only.");
    const { year, month } = request.data || {};
    if (!year || !month || month < 1 || month > 12) {
      throw new HttpsError("invalid-argument", "Valid year and month (1-12) required.");
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const snapshot = await runQuery(
      db
        .collection("attendance")
        .where("tenantId", "==", caller.tenantId)
        .where("date", ">=", `${monthStr}-01`)
        .where("date", "<", `${monthStr}-32`)
    );

    const records = snapshot.docs.map((d) => d.data() as any);
    const empMap = new Map<string, any>();

    for (const rec of records) {
      if (!empMap.has(rec.employeeId)) {
        empMap.set(rec.employeeId, {
          employeeId: rec.employeeId,
          fullName: "",
          presentDays: 0,
          lateDays: 0,
          absentDays: 0,
          totalWorkedMinutes: 0,
        });
      }
      const emp = empMap.get(rec.employeeId);
      if (rec.status === "present") emp.presentDays++;
      else if (rec.status === "late") emp.lateDays++;
      else if (rec.status === "absent") emp.absentDays++;
      emp.totalWorkedMinutes += rec.workedMinutes || 0;
    }

    // Load employee names
    const empDocs = await db
      .collection("employees")
      .where("tenantId", "==", caller.tenantId)
      .get();
    for (const d of empDocs.docs) {
      const e = d.data() as any;
      if (empMap.has(d.id)) {
        empMap.get(d.id).fullName = e.fullName;
      }
    }

    const stats: MonthlyReportStats = {
      year,
      month,
      totalEmployees: empMap.size,
      presentDays: Array.from(empMap.values()).reduce((s, e) => s + e.presentDays, 0),
      lateDays: Array.from(empMap.values()).reduce((s, e) => s + e.lateDays, 0),
      absentDays: Array.from(empMap.values()).reduce((s, e) => s + e.absentDays, 0),
      averageWorkedMinutes:
        empMap.size > 0
          ? Math.round(Array.from(empMap.values()).reduce((s, e) => s + e.totalWorkedMinutes, 0) / empMap.size)
          : 0,
      employeeStats: Array.from(empMap.values()),
    };

    return stats;
  }
);

// ---------------------------------------------------------------------------
// Employee Locations (branch manager / staff)
// ---------------------------------------------------------------------------

export interface EmployeeLocation {
  employeeId: string;
  fullName: string;
  lat: number;
  lng: number;
  status: string;
  checkInAt: any;
  distance?: number;
}

export const getEmployeeLocations = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const caller = getCaller(request);
    if (!isStaff(caller)) throw new HttpsError("permission-denied", "Staff only.");
    const { branchId } = request.data || {};

    // date == today already scopes to today's records; no extra time filter
    // is needed (and keeping it minimal avoids a wider composite index).
    const todayStr = new Date().toISOString().slice(0, 10);
    let query = db
      .collection("attendance")
      .where("tenantId", "==", caller.tenantId)
      .where("date", "==", todayStr);
    if (branchId) query = query.where("branchId", "==", branchId);

    const snapshot = await runQuery(query);

    const locations: EmployeeLocation[] = [];
    const empMap = new Map<string, any>();

    // Get employee data
    const empDocs = await (branchId
      ? db.collection("employees").where("tenantId", "==", caller.tenantId).where("branchId", "==", branchId)
      : db.collection("employees").where("tenantId", "==", caller.tenantId)
    ).get();

    for (const d of empDocs.docs) {
      empMap.set(d.id, d.data());
    }

    for (const doc of snapshot.docs) {
      const rec = doc.data() as any;
      const emp = empMap.get(rec.employeeId);
      if (emp && rec.checkInLocation) {
        locations.push({
          employeeId: rec.employeeId,
          fullName: emp.fullName || "",
          lat: rec.checkInLocation.lat,
          lng: rec.checkInLocation.lng,
          status: rec.status,
          checkInAt: rec.checkInAt,
          distance: rec.checkInDistance,
        });
      }
    }

    return { locations };
  }
);

// ---------------------------------------------------------------------------
// Excel Export (staff) — async task
// ---------------------------------------------------------------------------

export const exportAttendanceExcel = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, memory: "1GiB" },
  async (request) => {
    const caller = getCaller(request);
    if (!isStaff(caller)) throw new HttpsError("permission-denied", "Staff only.");
    const { year, month } = request.data || {};
    if (!year || !month || month < 1 || month > 12) {
      throw new HttpsError("invalid-argument", "Valid year and month required.");
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const snapshot = await runQuery(
      db
        .collection("attendance")
        .where("tenantId", "==", caller.tenantId)
        .where("date", ">=", `${monthStr}-01`)
        .where("date", "<", `${monthStr}-32`)
        .orderBy("date")
        .orderBy("employeeId")
    );

    const records = snapshot.docs.map((d) => d.data() as any);

    // Build CSV (Excel-compatible)
    const headers = ["Date", "Employee ID", "Name", "Branch", "Status", "Check-In", "Check-Out", "Worked Hours"];
    const rows = records.map((r) => [
      r.date,
      r.employeeId,
      "", // will fill with name lookup
      r.branchId || "",
      r.status || "absent",
      r.checkInAt?.toDate?.().toISOString() || "",
      r.checkOutAt?.toDate?.().toISOString() || "",
      ((r.workedMinutes || 0) / 60).toFixed(2),
    ]);

    // Fill employee names
    const empDocs = await db
      .collection("employees")
      .where("tenantId", "==", caller.tenantId)
      .get();
    const nameMap = new Map(empDocs.docs.map((d) => [d.id, (d.data() as any).fullName]));
    rows.forEach((r) => {
      r[2] = nameMap.get(r[1]) || "";
    });

    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

    // Return as data URL for download (in prod, would upload to Cloud Storage)
    return {
      ok: true,
      csv,
      filename: `attendance_${year}_${month}.csv`,
    };
  }
);

// ---------------------------------------------------------------------------
// Daily Alerts (scheduled — runs at 9:30 AM Cairo time)
// ---------------------------------------------------------------------------

export const sendAttendanceAlerts = onSchedule(
  { region: REGION, schedule: "30 7 * * *", timeZone: "Africa/Cairo" },
  async (context) => {
    // Get all active tenants
    const tenants = await db.collection("tenants").where("attendanceConfig", "!=", null).get();
    let alertCount = 0;

    for (const tenantDoc of tenants.docs) {
      const tenantId = tenantDoc.id;
      const config = (tenantDoc.data() as any).attendanceConfig as AttendanceConfig;

      // Check today's attendance
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayRecords = await db
        .collection("attendance")
        .where("tenantId", "==", tenantId)
        .where("date", "==", todayStr)
        .get();

      const recordsMap = new Map(todayRecords.docs.map((d) => [d.data().employeeId, d.data()]));

      // Get all employees
      const employees = await db.collection("employees").where("tenantId", "==", tenantId).get();

      const alerts = [];

      for (const empDoc of employees.docs) {
        const emp = empDoc.data() as any;
        const empId = empDoc.id;
        const rec = recordsMap.get(empId);

        // Missing check-in
        if (!rec) {
          const isWorkDay = config.workDays.includes(new Date().getDay());
          if (isWorkDay) {
            alerts.push({
              type: "absent",
              employeeId: empId,
              fullName: emp.fullName,
              message: `${emp.fullName} has not checked in today`,
            });
          }
        } else if (rec.status === "late") {
          alerts.push({
            type: "late",
            employeeId: empId,
            fullName: emp.fullName,
            lateMinutes: rec.lateMinutes,
            message: `${emp.fullName} is ${rec.lateMinutes} minutes late`,
          });
        }
      }

      // Store alerts in a collection for managers to view
      if (alerts.length > 0) {
        const alertDocRef = db.collection("attendanceAlerts").doc();
        await alertDocRef.set({
          tenantId,
          date: todayStr,
          alertCount: alerts.length,
          alerts,
          createdAt: FieldValue.serverTimestamp(),
        });
        alertCount += alerts.length;
      }
    }

    logger.info(`Sent ${alertCount} attendance alerts across all tenants`);
  }
);
