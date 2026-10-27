/**
 * Firestore canonical sales (append-only).
 * Path: stores/{storeId}/sales/{saleId}
 *
 * MUST: create only — never update/delete settled sales (corrections = reverse sale later).
 * EN: Append-only sales docs; no update/delete of settled checks.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  orderBy,
  limit,
  type FirestoreDataConverter,
  type SnapshotOptions,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  SaleSchema,
  buildTaxBreakdownFromLines,
  type Sale,
} from "@/domain/types";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

export type SaleFirestoreDoc = Sale & {
  /** Server-side write marker (not part of domain Sale for local). */
  writtenAt?: string;
};

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeSale(raw: unknown): Sale {
  const parsed = SaleSchema.parse(raw);
  const taxBreakdown =
    parsed.taxBreakdown && parsed.taxBreakdown.length > 0
      ? parsed.taxBreakdown
      : buildTaxBreakdownFromLines(parsed.lines);
  return {
    ...parsed,
    kind: parsed.kind ?? "sale",
    writeOffs: parsed.writeOffs ?? [],
    writeOffTotalTaxIncluded: parsed.writeOffTotalTaxIncluded ?? 0,
    taxBreakdown,
  };
}

export const saleConverter: FirestoreDataConverter<Sale> = {
  toFirestore(model: Sale): DocumentData {
    const sale = normalizeSale(model);
    // MUST: Firestore rejects undefined field values (e.g. optional serviceDiscount).
    // EN: Strip undefined before write or setDoc fails and admin never sees the sale.
    return stripUndefined({
      ...sale,
      writtenAt: new Date().toISOString(),
    }) as DocumentData;
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): Sale {
    const data = snapshot.data(options);
    const { writtenAt: _w, ...rest } = data;
    return normalizeSale(rest);
  },
};

export function salesCollectionRef(storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return collection(db, "stores", storeId, "sales").withConverter(saleConverter);
}

export function saleDocRef(saleId: string, storeId: string = getActiveStoreId()) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "sales", saleId).withConverter(saleConverter);
}

/**
 * Append a settled sale. Idempotent if doc already exists.
 * MUST NOT overwrite existing docs.
 * EN: Create-only; skip if already present.
 */
export async function appendSaleToFirestore(
  sale: Sale,
  storeId: string = getActiveStoreId(),
): Promise<"created" | "exists" | "skipped_no_firebase"> {
  if (!isFirebaseConfigured()) return "skipped_no_firebase";
  const ref = saleDocRef(sale.id, storeId);
  if (!ref) return "skipped_no_firebase";
  const existing = await getDoc(ref);
  if (existing.exists()) return "exists";
  // Pass through converter (stripUndefined in toFirestore).
  await setDoc(ref, sale);
  return "created";
}

export async function fetchSalesByBusinessDate(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<Sale[]> {
  const col = salesCollectionRef(storeId);
  if (!col) return [];
  // Equality-only query (auto index). Sort client-side by paidAt.
  const q = query(col, where("businessDate", "==", businessDate));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

/** Recent sales for export / backfill awareness (bounded). */
export async function fetchRecentSales(
  max = 500,
  storeId: string = getActiveStoreId(),
): Promise<Sale[]> {
  const col = salesCollectionRef(storeId);
  if (!col) return [];
  const q = query(col, orderBy("paidAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).reverse();
}

export function subscribeSalesByBusinessDate(
  businessDate: string,
  onData: (sales: Sale[]) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): Unsubscribe | null {
  const col = salesCollectionRef(storeId);
  if (!col) return null;
  const q = query(col, where("businessDate", "==", businessDate));
  return onSnapshot(
    q,
    (snap) => {
      const sales = snap.docs
        .map((d) => d.data())
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
      onData(sales);
    },
    (err) => onError(err),
  );
}

/** Push local-only sales that are missing in Firestore (one-shot backfill). */
export async function backfillLocalSalesToFirestore(
  localSales: Sale[],
  storeId: string = getActiveStoreId(),
): Promise<{ created: number; skipped: number }> {
  if (!isFirebaseConfigured()) return { created: 0, skipped: localSales.length };
  let created = 0;
  let skipped = 0;
  for (const sale of localSales) {
    const result = await appendSaleToFirestore(sale, storeId);
    if (result === "created") created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}
