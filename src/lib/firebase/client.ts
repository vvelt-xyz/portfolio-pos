import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    return null;
  }
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

/** True when all NEXT_PUBLIC_FIREBASE_* vars are set. */
export function isFirebaseConfigured(): boolean {
  return readConfig() != null;
}

export function getFirebaseApp(): FirebaseApp | null {
  const config = readConfig();
  if (!config) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
  }
  return app;
}

export function getDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!db) db = getFirestore(firebaseApp);
  return db;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  return auth;
}

/**
 * Fallback store when Auth claim is absent (local / no Firebase).
 * Production paths use getActiveStoreId() from the `storeId` custom claim.
 */
export const DEFAULT_STORE_ID = "default";

/**
 * Login ID `demo` → Firebase email `demo@vvelt.xyz`.
 * Firebase Email/Password requires an email-shaped identifier.
 * Showcase only — no self-signup; password is published in README.
 */
export const AUTH_EMAIL_DOMAIN = "vvelt.xyz";
export const AUTH_LOGIN_ID = "demo";
export const AUTH_EMAIL = `${AUTH_LOGIN_ID}@${AUTH_EMAIL_DOMAIN}`;

/** Map UI login id (`test` or full email) to Firebase email. */
export function normalizeLoginId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@${AUTH_EMAIL_DOMAIN}`;
}
