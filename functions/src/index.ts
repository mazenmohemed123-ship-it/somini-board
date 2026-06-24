/**
 * Somni Board — Cloud Functions entry point (2nd gen).
 * Each export below becomes a deployable function.
 */
import { setGlobalOptions } from "firebase-functions/v2";

// Sensible defaults for every function; individual functions can override.
setGlobalOptions({ region: "europe-west1", maxInstances: 20 });

// --- HR (employees) ---
export {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  bulkImportEmployees,
  importEmployeesTask,
} from "./hr/employees";

// --- Org structure (branches, departments, committees) ---
export {
  createBranch,
  assignBranchManager,
  createDepartment,
  createCommittee,
  setCommitteeMembers,
} from "./org/structure";

// --- Elections ---
export { createElection } from "./elections/create";
export { openCloseElections } from "./elections/schedule";
export { pullVotersFromEmployees } from "./elections/pullVoters";
export { registerVoter } from "./voters/register";
export { castVote } from "./voting/cast";
export { changeVote } from "./voting/change";
export { generateReport, regenerateReport } from "./results/pdf";

// --- Motions (decision voting) ---
export { createMotion, publishMotion, castMotionVote } from "./motions/motions";
export { closeExpiredMotions } from "./motions/schedule";

// --- Meetings & minutes ---
export {
  createMeeting,
  sendMeetingReminder,
  recordMinutes,
  signMinutes,
} from "./meetings/meetings";

// --- Payments (Paymob) ---
export { createPaymentIntent, paymobWebhook } from "./payments/paymob";

// --- Integrations (connected apps) ---
export { api } from "./integrations/api";
export { deliverWebhook } from "./integrations/webhooks";

// --- Admin / provisioning ---
export { provisionCompany, setUserRole, createIntegration } from "./admin/provisioning";

// --- Platform owner (superAdmin) dashboard ---
export {
  getSuperAdminStats,
  listAllTenants,
  getTenantDetails,
  toggleTenantStatus,
  updateSubscription,
  listAllSubscriptions,
} from "./admin/superadmin";
