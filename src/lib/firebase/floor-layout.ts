/**
 * Firestore floor layout: stores/{storeId}/config/floorLayout
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
  migrateFloorLayoutCatalog,
  type FloorLayoutCatalog,
} from "@/domain/floor-layout";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

export type FloorLayoutDoc = {
  catalog: FloorLayoutCatalog;
  updatedAt: string;
};

export const floorLayoutConverter: FirestoreDataConverter<FloorLayoutDoc> = {
  toFirestore(model: FloorLayoutDoc): DocumentData {
    return {
      catalog: migrateFloorLayoutCatalog(model.catalog),
      updatedAt: model.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): FloorLayoutDoc {
    const data = snapshot.data(options);
    return {
      catalog: migrateFloorLayoutCatalog(data.catalog ?? data),
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
    };
  },
};

export function floorLayoutDocRef(storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "config", "floorLayout").withConverter(
    floorLayoutConverter,
  );
}

export async function fetchFloorLayoutFromFirestore(
  storeId: string = getActiveStoreId(),
): Promise<FloorLayoutCatalog | null> {
  const ref = floorLayoutDocRef(storeId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().catalog;
}

export async function writeFloorLayoutToFirestore(
  catalog: FloorLayoutCatalog,
  storeId: string = getActiveStoreId(),
): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }
  const ref = floorLayoutDocRef(storeId);
  if (!ref) throw new Error("Firebase is not configured");
  await setDoc(ref, {
    catalog: migrateFloorLayoutCatalog(catalog),
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeFloorLayout(
  onData: (catalog: FloorLayoutCatalog) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): Unsubscribe | null {
  const ref = floorLayoutDocRef(storeId);
  if (!ref) return null;
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      onData(snap.data().catalog);
    },
    (err) => onError(err),
  );
}
