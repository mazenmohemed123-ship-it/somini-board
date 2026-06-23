"use client";

/** Thin wrapper around Firebase callable functions with typed-ish helpers. */
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export async function call<T = any>(name: string, data?: unknown): Promise<T> {
  const res = await httpsCallable(functions, name)(data ?? {});
  return res.data as T;
}
