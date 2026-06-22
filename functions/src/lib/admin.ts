/**
 * Shared Firebase Admin SDK singletons. Importing this module initializes the
 * default app exactly once across all function instances.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export const rtdb = getDatabase();
export const storage = getStorage();
export { FieldValue, ServerValue };

/** Common region for all 2nd-gen functions. */
export const REGION = "europe-west1";
