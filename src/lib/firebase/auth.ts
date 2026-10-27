import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  normalizeLoginId,
} from "@/lib/firebase/client";
import { STORE_ID_CLAIM } from "@/lib/firebase/store-id";

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/** Read `storeId` custom claim. Force-refresh when `forceRefresh` is true. */
export async function resolveStoreIdClaim(
  user: User,
  forceRefresh = false,
): Promise<string | null> {
  const token = await user.getIdTokenResult(forceRefresh);
  const raw = token.claims[STORE_ID_CLAIM];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function signInWithLoginId(
  loginId: string,
  password: string,
): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured");
  }
  const email = normalizeLoginId(loginId);
  if (!email || !password) {
    throw new Error("missing_credentials");
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // Pick up claims set just before login.
  await cred.user.getIdToken(true);
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function authRequired(): boolean {
  return isFirebaseConfigured();
}
