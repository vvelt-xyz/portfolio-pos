"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  authRequired,
  resolveStoreIdClaim,
  signInWithLoginId,
  signOut,
  subscribeAuth,
} from "@/lib/firebase/auth";
import { setActiveStoreId } from "@/lib/firebase/store-id";

type AuthStatus =
  | "loading"
  | "signedOut"
  | "signedIn"
  | "local"
  | "missingStore"
  /** Production build without Firebase env — must not bypass AuthGate. */
  | "misconfigured";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  /** Claim-driven store; null when signed out / missing claim / local uses default via getActiveStoreId. */
  storeId: string | null;
  signIn: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const needsAuth = authRequired();
  const [user, setUser] = useState<User | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [ready, setReady] = useState(!needsAuth);

  useEffect(() => {
    if (!needsAuth) {
      setActiveStoreId(null);
      return;
    }
    return subscribeAuth((next) => {
      void (async () => {
        if (!next) {
          setUser(null);
          setStoreId(null);
          setActiveStoreId(null);
          setReady(true);
          return;
        }
        const sid = await resolveStoreIdClaim(next);
        setUser(next);
        setStoreId(sid);
        setActiveStoreId(sid);
        setReady(true);
      })();
    });
  }, [needsAuth]);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus;
    // MUST: Production without Firebase config must not enter local (auth-bypass) mode.
    // EN: Never treat a misconfigured production build as unauthenticated local POS.
    if (!needsAuth && process.env.NODE_ENV === "production") {
      status = "misconfigured";
    } else if (!needsAuth) status = "local";
    else if (!ready) status = "loading";
    else if (!user) status = "signedOut";
    else if (!storeId) status = "missingStore";
    else status = "signedIn";

    return {
      status,
      user,
      storeId,
      signIn: signInWithLoginId,
      signOut: async () => {
        setActiveStoreId(null);
        await signOut();
      },
    };
  }, [needsAuth, ready, user, storeId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
