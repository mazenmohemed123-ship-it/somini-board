"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: string | null;
  tenantId: string | null;
  /** Force-reload the ID token so freshly-set custom claims (role/tenant)
   *  take effect without a full sign-out/sign-in. */
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  tenantId: null,
  refreshClaims: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Read claims off the token. Pass force=true to bypass the local cache and
   *  pull the very latest claims from the server. */
  const readClaims = useCallback(async (u: User, force = false) => {
    const token = await u.getIdTokenResult(force);
    setRole((token.claims as any).role || null);
    setTenantId((token.claims as any).firebase?.tenant ?? (token.claims as any).tenantId ?? null);
  }, []);

  const refreshClaims = useCallback(async () => {
    if (auth.currentUser) await readClaims(auth.currentUser, true);
  }, [readClaims]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setTenantId(null);
      } else {
        // Force a refresh on sign-in so claims set during signup / role
        // assignment are picked up immediately (custom claims are otherwise
        // only refreshed roughly hourly).
        await readClaims(u, true);
      }
      setLoading(false);
    });
    return unsub;
  }, [readClaims]);

  return (
    <AuthContext.Provider value={{ user, loading, role, tenantId, refreshClaims }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
