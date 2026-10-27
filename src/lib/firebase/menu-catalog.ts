import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type FirestoreDataConverter,
  type SnapshotOptions,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  MenuCatalogSchema,
  migrateMenuCatalog,
  type MenuCatalog,
} from "@/domain/menu-catalog";
import { createSeedMenuCatalog } from "@/data/menu.seed";
import { getDb } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

/** Firestore document shape for the canonical menu. */
export type MenuCatalogDoc = {
  catalog: MenuCatalog;
  updatedAt: string;
  /** Semver-ish marker for seed lineage. */
  source: "seed" | "backoffice";
};

const MenuCatalogDocSchema = MenuCatalogSchema;

export const menuCatalogConverter: FirestoreDataConverter<MenuCatalogDoc> = {
  toFirestore(model: MenuCatalogDoc): DocumentData {
    const catalog = MenuCatalogDocSchema.parse(migrateMenuCatalog(model.catalog));
    return {
      catalog,
      updatedAt: model.updatedAt,
      source: model.source,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): MenuCatalogDoc {
    const data = snapshot.data(options);
    // Migrate legacy tax-excluded catalogs before Zod v2 parse.
    const catalog = MenuCatalogDocSchema.parse(
      migrateMenuCatalog(data.catalog),
    );
    return {
      catalog,
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
      source: data.source === "seed" ? "seed" : "backoffice",
    };
  },
};

export function menuCatalogDocRef(storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "config", "menuCatalog").withConverter(
    menuCatalogConverter,
  );
}

export async function fetchMenuCatalogFromFirestore(
  storeId: string = getActiveStoreId(),
): Promise<MenuCatalogDoc | null> {
  const ref = menuCatalogDocRef(storeId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/** Write canonical menu (正メニュー). Creates doc if missing. */
export async function writeMenuCatalogToFirestore(
  catalog: MenuCatalog,
  options: { source: "seed" | "backoffice"; storeId?: string } = {
    source: "backoffice",
  },
): Promise<void> {
  const ref = menuCatalogDocRef(options.storeId ?? getActiveStoreId());
  if (!ref) {
    throw new Error("Firebase is not configured");
  }
  const payload: MenuCatalogDoc = {
    catalog: migrateMenuCatalog(catalog),
    updatedAt: new Date().toISOString(),
    source: options.source,
  };
  await setDoc(ref, payload);
}

/** Ensure Firestore has 正メニュー (seed). Returns the catalog in use. */
export async function ensureCanonicalMenu(
  storeId: string = getActiveStoreId(),
): Promise<MenuCatalog> {
  const existing = await fetchMenuCatalogFromFirestore(storeId);
  if (existing) return existing.catalog;
  const seed = createSeedMenuCatalog();
  await writeMenuCatalogToFirestore(seed, { source: "seed", storeId });
  return seed;
}

export function subscribeMenuCatalog(
  onData: (doc: MenuCatalogDoc) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): (() => void) | null {
  const ref = menuCatalogDocRef(storeId);
  if (!ref) return null;
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      onData(snap.data());
    },
    (err) => onError(err),
  );
}
