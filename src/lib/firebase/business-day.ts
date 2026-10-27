/**
 * Firestore business-day lifecycle: stores/{storeId}/businessDays/{YYYYMMDD}
 * MUST: create on open; update only open → closed; no reopen/delete.
 * EN: Open create; single close update; never reopen.
 */
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  type FirestoreDataConverter,
  type SnapshotOptions,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  BusinessDayDocSchema,
  buildBusinessDayOpen,
  parseBusinessDayDoc,
  phaseOfBusinessDay,
  type BusinessDayClose,
  type BusinessDayDoc,
  type BusinessDayOpen,
  type BusinessDayPhase,
} from "@/domain/business-day";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";

export const businessDayConverter: FirestoreDataConverter<BusinessDayDoc> = {
  toFirestore(model: BusinessDayDoc): DocumentData {
    return BusinessDayDocSchema.parse(model);
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions,
  ): BusinessDayDoc {
    return parseBusinessDayDoc(snapshot.data(options));
  },
};

export function businessDayDocRef(
  businessDate: string,
  storeId: string = getActiveStoreId(),
) {
  const db = getDb();
  if (!db) return null;
  return doc(db, "stores", storeId, "businessDays", businessDate).withConverter(
    businessDayConverter,
  );
}

export async function fetchBusinessDayDoc(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<BusinessDayDoc | null> {
  const ref = businessDayDocRef(businessDate, storeId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/** @deprecated Prefer fetchBusinessDayDoc; returns only when status=closed. */
export async function fetchBusinessDayClose(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<BusinessDayClose | null> {
  const doc = await fetchBusinessDayDoc(businessDate, storeId);
  return doc?.status === "closed" ? doc : null;
}

export async function resolveBusinessDayPhase(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<BusinessDayPhase> {
  const local = getBusinessDayDocLocal(businessDate);
  if (local?.status === "closed") return "closed";
  if (!isFirebaseConfigured()) {
    return phaseOfBusinessDay(local);
  }
  try {
    const cloud = await fetchBusinessDayDoc(businessDate, storeId);
    if (cloud) {
      saveBusinessDayDocLocal(cloud);
      return phaseOfBusinessDay(cloud);
    }
    // Cloud missing: trust local open, else not_started
    return phaseOfBusinessDay(local);
  } catch (err) {
    console.warn("business day phase check failed; using local", err);
    return phaseOfBusinessDay(local);
  }
}

export async function isBusinessDayOpen(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<boolean> {
  return (await resolveBusinessDayPhase(businessDate, storeId)) === "open";
}

export async function isBusinessDayClosed(
  businessDate: string,
  storeId: string = getActiveStoreId(),
): Promise<boolean> {
  return (await resolveBusinessDayPhase(businessDate, storeId)) === "closed";
}

export async function writeBusinessDayOpen(
  open: BusinessDayOpen,
  storeId: string = getActiveStoreId(),
): Promise<"created" | "exists" | "closed" | "skipped_no_firebase"> {
  const local = getBusinessDayDocLocal(open.businessDate);
  if (local?.status === "closed") return "closed";
  if (local?.status === "open") {
    // Keep local; still try cloud for other devices
  } else {
    saveBusinessDayDocLocal(open);
  }

  if (!isFirebaseConfigured()) return "skipped_no_firebase";
  const db = getDb();
  const ref = businessDayDocRef(open.businessDate, storeId);
  if (!db || !ref) return "skipped_no_firebase";
  const outcome = await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      const data = existing.data();
      if (data.status === "closed") return { kind: "closed" as const, data };
      return { kind: "exists" as const, data };
    }
    tx.set(ref, BusinessDayDocSchema.parse(open));
    return { kind: "created" as const };
  });
  if (outcome.kind === "closed" || outcome.kind === "exists") {
    saveBusinessDayDocLocal(outcome.data);
    return outcome.kind === "closed" ? "closed" : "exists";
  }
  saveBusinessDayDocLocal(open);
  return "created";
}

/**
 * Close an open day. Requires prior open (or legacy create closed if none — rejected).
 */
export async function writeBusinessDayClose(
  close: BusinessDayClose,
  storeId: string = getActiveStoreId(),
): Promise<
  "created" | "updated" | "exists" | "not_open" | "skipped_no_firebase"
> {
  const local = getBusinessDayDocLocal(close.businessDate);
  if (local?.status === "closed") return "exists";

  if (!isFirebaseConfigured()) {
    if (local?.status !== "open") return "not_open";
    saveBusinessDayDocLocal(close);
    return "skipped_no_firebase";
  }

  const db = getDb();
  const ref = businessDayDocRef(close.businessDate, storeId);
  if (!db || !ref) {
    if (local?.status !== "open") return "not_open";
    saveBusinessDayDocLocal(close);
    return "skipped_no_firebase";
  }

  const outcome = await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists()) {
      if (local?.status !== "open") return { kind: "not_open" as const };
      tx.set(ref, BusinessDayDocSchema.parse(close));
      return { kind: "created" as const };
    }
    const data = existing.data();
    if (data.status === "closed") return { kind: "exists" as const, data };
    const closed: BusinessDayClose = { ...close, openedAt: data.openedAt };
    tx.set(ref, BusinessDayDocSchema.parse(closed));
    return { kind: "updated" as const, closed };
  });
  if (outcome.kind === "not_open") return "not_open";
  if (outcome.kind === "exists") {
    saveBusinessDayDocLocal(outcome.data);
    return "exists";
  }
  if (outcome.kind === "updated") {
    saveBusinessDayDocLocal(outcome.closed);
    return "updated";
  }
  saveBusinessDayDocLocal(close);
  return "created";
}

const LOCAL_KEY = "pos_v1_business_day_closes";

function loadLocalMap(): Record<string, BusinessDayDoc> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, BusinessDayDoc> = {};
    for (const [k, v] of Object.entries(parsed)) {
      try {
        out[k] = parseBusinessDayDoc(v);
      } catch {
        /* skip corrupt */
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistLocalMap(map: Record<string, BusinessDayDoc>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
}

export function getBusinessDayDocLocal(
  businessDate: string,
): BusinessDayDoc | null {
  return loadLocalMap()[businessDate] ?? null;
}

export function getBusinessDayPhaseLocal(
  businessDate: string,
): BusinessDayPhase {
  return phaseOfBusinessDay(getBusinessDayDocLocal(businessDate));
}

export function isBusinessDayClosedLocal(businessDate: string): boolean {
  return getBusinessDayPhaseLocal(businessDate) === "closed";
}

export function isBusinessDayOpenLocal(businessDate: string): boolean {
  return getBusinessDayPhaseLocal(businessDate) === "open";
}

/** Persist open or open→closed. Never overwrite a closed doc. */
export function saveBusinessDayDocLocal(doc: BusinessDayDoc): void {
  if (typeof window === "undefined") return;
  const map = loadLocalMap();
  const prev = map[doc.businessDate];
  if (prev?.status === "closed") return;
  if (prev?.status === "open" && doc.status === "open") return;
  map[doc.businessDate] = doc;
  persistLocalMap(map);
}

/** @deprecated Use saveBusinessDayDocLocal */
export function saveBusinessDayCloseLocal(close: BusinessDayClose): void {
  saveBusinessDayDocLocal(close);
}

export function getBusinessDayCloseLocal(
  businessDate: string,
): BusinessDayClose | null {
  const doc = getBusinessDayDocLocal(businessDate);
  return doc?.status === "closed" ? doc : null;
}

export async function loadBusinessDayDoc(
  businessDate: string,
): Promise<BusinessDayDoc | null> {
  // MUST: Local closed wins (no reopen). Never return cloud-open while local is closed —
  // that desyncs UI phase from isBusinessDayOpenLocal / order gates.
  // EN: Prefer local closed over cloud open so UI and write gates stay aligned.
  const localFirst = getBusinessDayDocLocal(businessDate);
  if (localFirst?.status === "closed") return localFirst;

  if (isFirebaseConfigured()) {
    try {
      const cloud = await fetchBusinessDayDoc(businessDate);
      if (cloud) {
        saveBusinessDayDocLocal(cloud);
        const local = getBusinessDayDocLocal(businessDate);
        if (local?.status === "closed") return local;
        return cloud;
      }
    } catch {
      /* fall through */
    }
  }
  return getBusinessDayDocLocal(businessDate);
}

/** @deprecated Prefer loadBusinessDayDoc */
export async function loadBusinessDayClose(
  businessDate: string,
): Promise<BusinessDayClose | null> {
  const doc = await loadBusinessDayDoc(businessDate);
  return doc?.status === "closed" ? doc : null;
}

export { buildBusinessDayOpen, phaseOfBusinessDay };
