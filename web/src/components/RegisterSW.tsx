"use client";

import { useEffect } from "react";

/** Registers the service worker in production browsers only. */
export function RegisterSW() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort */
      });
    }
  }, []);
  return null;
}
