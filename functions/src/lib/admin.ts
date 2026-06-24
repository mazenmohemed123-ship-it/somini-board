/**
 * Shared Firebase Admin SDK singletons. Importing this module initializes the
 * default app exactly once across all function instances.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export const rtdb = getDatabase();
export const storage = getStorage();
export const messaging = getMessaging();
export { FieldValue, ServerValue };

/** Common region for all 2nd-gen functions. */
export const REGION = "europe-west1";

/**
 * App Check enforcement is opt-in. It only works when the web client is
 * configured with a reCAPTCHA v3 site key (NEXT_PUBLIC_RECAPTCHA_SITE_KEY).
 * Until that is set up, enforcing App Check rejects every authenticated call
 * with "unauthenticated" because no App Check token is sent. Flip this on by
 * setting ENFORCE_APP_CHECK=true in the functions environment once reCAPTCHA
 * is wired up on the client.
 */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";
