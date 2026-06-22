"use client";

/**
 * Firebase client SDK initialization with App Check (reCAPTCHA v3).
 * Config values come from NEXT_PUBLIC_* env vars so they can differ per
 * environment without code changes. Fill them from the Firebase console
 * (Project settings -> Your apps -> Web app) and set the reCAPTCHA v3 site key.
 */
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

const firebaseConfig: FirebaseOptions = {
  // A non-empty placeholder keeps getAuth() from throwing during the server
  // prerender/build (no env vars present then). The real key is injected at
  // runtime in the browser, which is the only place auth calls actually run.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "build-time-placeholder",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "somini-board",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check — only in the browser, and only once.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* already initialized (HMR) */
  }
}

export const auth = getAuth(app);
export const dbClient = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");
export const realtimeDb = getDatabase(app);

// Wire up emulators in local dev.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(dbClient, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectDatabaseEmulator(realtimeDb, "localhost", 9000);
}
