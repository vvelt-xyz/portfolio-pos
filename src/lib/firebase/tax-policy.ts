/**
 * Firestore tax policy: stores/{storeId}/config/taxPolicy
 */
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type FirestoreDataConverter,
  type SnapshotOptions,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  migrateTaxPolicy,
  type TaxPolicy,
} from "@/domain/tax-policy";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

export type TaxPolicyDoc = {
  policy: TaxPolicy;
  updatedAt: string;
};

export const taxPolicyConverter: FirestoreDataConverter<TaxPolicyDoc> = {
  toFirestore(model: TaxPolicyDoc): DocumentData {
    return {
      policy: migrateTaxPolicy(model.policy),
      updatedAt: model.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): TaxPolicyDoc {
    const data = snapshot.data(options);
    return {
      policy: migrateTaxPolicy(data.policy ?? data),
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
    };
  },
};

export function taxPolicyDocRef(storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "config", "taxPolicy").withConverter(
    taxPolicyConverter,
  );
}

export async function fetchTaxPolicyFromFirestore(
  storeId: string = getActiveStoreId(),
): Promise<TaxPolicy | null> {
  const ref = taxPolicyDocRef(storeId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().policy;
}

export async function writeTaxPolicyToFirestore(
  policy: TaxPolicy,
  storeId: string = getActiveStoreId(),
): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }
  const ref = taxPolicyDocRef(storeId);
  if (!ref) throw new Error("Firebase is not configured");
  await setDoc(ref, {
    policy: migrateTaxPolicy(policy),
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeTaxPolicy(
  onData: (policy: TaxPolicy) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): Unsubscribe | null {
  const ref = taxPolicyDocRef(storeId);
  if (!ref) return null;
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      onData(snap.data().policy);
    },
    (err) => onError(err),
  );
}
