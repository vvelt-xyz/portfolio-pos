/**
 * Firestore session-tag catalog: stores/{storeId}/config/sessionTags
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
  migrateSessionTagCatalog,
  type SessionTagCatalog,
} from "@/domain/session-tags";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

export type SessionTagsDoc = {
  catalog: SessionTagCatalog;
  updatedAt: string;
};

export const sessionTagsConverter: FirestoreDataConverter<SessionTagsDoc> = {
  toFirestore(model: SessionTagsDoc): DocumentData {
    return {
      catalog: migrateSessionTagCatalog(model.catalog),
      updatedAt: model.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): SessionTagsDoc {
    const data = snapshot.data(options);
    return {
      catalog: migrateSessionTagCatalog(data.catalog ?? data),
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
    };
  },
};

export function sessionTagsDocRef(storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "config", "sessionTags").withConverter(
    sessionTagsConverter,
  );
}

export async function fetchSessionTagsFromFirestore(
  storeId: string = getActiveStoreId(),
): Promise<SessionTagCatalog | null> {
  const ref = sessionTagsDocRef(storeId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().catalog;
}

export async function writeSessionTagsToFirestore(
  catalog: SessionTagCatalog,
  storeId: string = getActiveStoreId(),
): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }
  const ref = sessionTagsDocRef(storeId);
  if (!ref) throw new Error("Firebase is not configured");
  await setDoc(ref, {
    catalog: migrateSessionTagCatalog(catalog),
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeSessionTags(
  onData: (catalog: SessionTagCatalog) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): Unsubscribe | null {
  const ref = sessionTagsDocRef(storeId);
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
