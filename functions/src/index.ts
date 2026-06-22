/**
 * Somni Board — Cloud Functions entry point (2nd gen).
 * Each export below becomes a deployable function.
 */
import { setGlobalOptions } from "firebase-functions/v2";

// Sensible defaults for every function; individual functions can override.
setGlobalOptions({ region: "europe-west1", maxInstances: 20 });

// Elections
export { createElection } from "./elections/create";
export { openCloseElections } from "./elections/schedule";

// Voters
export { registerVoter } from "./voters/register";

// Voting
export { castVote } from "./voting/cast";
export { changeVote } from "./voting/change";

// Results / PDF
export { generateReport, regenerateReport } from "./results/pdf";

// Payments (Paymob)
export { createPaymentIntent, paymobWebhook } from "./payments/paymob";

// Integrations (connected apps)
export { api } from "./integrations/api";
export { deliverWebhook } from "./integrations/webhooks";

// Admin / provisioning
export { provisionCompany, setUserRole, createIntegration } from "./admin/provisioning";
