/**
 * Active store for Firestore paths.
 * Set from Auth Custom Claim `storeId` after login (see auth-store).
 * Local mode (no Firebase) falls back to DEFAULT_STORE_ID.
 */
import { DEFAULT_STORE_ID } from "@/lib/firebase/client";

let activeStoreId: string | null = null;

export function setActiveStoreId(storeId: string | null): void {
  activeStoreId = storeId;
}

export function peekActiveStoreId(): string | null {
  return activeStoreId;
}

/** Store used by Firestore helpers when callers omit storeId. */
export function getActiveStoreId(): string {
  return activeStoreId ?? DEFAULT_STORE_ID;
}

export const STORE_ID_CLAIM = "storeId";
