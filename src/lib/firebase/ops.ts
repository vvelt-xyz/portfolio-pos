/**
 * L2/L3 Firestore ops — sessions, batches, lines, writeOffs, seats, events.
 * MUST: When Firebase is configured, these collections are canonical (not localStorage).
 * EN: Cloud ops docs are source of truth when Firebase is on.
 */
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  type FirestoreDataConverter,
  type SnapshotOptions,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  OpsEventSchema,
  OpsMetaSchema,
  OrderBatchSchema,
  SeatStateSchema,
  type OpsEvent,
  type OpsMeta,
  type OrderBatch,
  type SeatState,
} from "@/domain/ops";
import {
  OrderItemSchema,
  ServiceSessionSchema,
  WriteOffSchema,
  type OrderItem,
  type ServiceSession,
  type WriteOff,
} from "@/domain/types";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { getActiveStoreId } from "@/lib/firebase/store-id";
import { businessDateKey, newId } from "@/lib/ids";

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function zodConverter<T>(
  schema: {
    parse: (data: unknown) => T;
    safeParse: (data: unknown) =>
      | { success: true; data: T }
      | { success: false; error: unknown };
  },
): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      return stripUndefined(schema.parse(model)) as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      const raw = snapshot.data(options);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        console.warn("Ops doc failed schema", snapshot.id, parsed.error);
        // Best-effort: return raw cast so one bad doc does not kill the listener.
        return raw as T;
      }
      return parsed.data;
    },
  };
}

const sessionConverter = zodConverter(ServiceSessionSchema);
const orderItemConverter = zodConverter(OrderItemSchema);
const writeOffConverter = zodConverter(WriteOffSchema);
const batchConverter = zodConverter(OrderBatchSchema);
const eventConverter = zodConverter(OpsEventSchema);
const seatConverter = zodConverter(SeatStateSchema);
const metaConverter = zodConverter(OpsMetaSchema);

function storeCol(storeId: string, name: string) {
  const db = getDb();
  if (!db) return null;
  return collection(db, "stores", storeId, name);
}

export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "pos_v1_device_id";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = newId("dev");
    window.localStorage.setItem(key, id);
  }
  return id;
}

export type OpsSnapshot = {
  sessions: ServiceSession[];
  orderItems: OrderItem[];
  writeOffs: WriteOff[];
  dailySeqByDate: Record<string, number>;
  /** True after sessions+lines+writeOffs+meta each fired at least once. */
  cloudReady: boolean;
};

/** Subscribe open sessions + all lines/writeOffs for those sessions (and any open-linked). */
export function subscribeOps(
  onData: (snap: OpsSnapshot) => void,
  onError: (error: Error) => void,
  storeId: string = getActiveStoreId(),
): Unsubscribe | null {
  if (!isFirebaseConfigured()) return null;
  const sessionsCol = storeCol(storeId, "sessions");
  const linesCol = storeCol(storeId, "orderLines");
  const writeOffsCol = storeCol(storeId, "writeOffs");
  const metaRef = getDb()
    ? doc(getDb()!, "stores", storeId, "config", "opsMeta").withConverter(
        metaConverter,
      )
    : null;
  if (!sessionsCol || !linesCol || !writeOffsCol || !metaRef) return null;

  let sessions: ServiceSession[] = [];
  let orderItems: OrderItem[] = [];
  let writeOffs: WriteOff[] = [];
  let dailySeqByDate: Record<string, number> = {};
  const ready = {
    sessions: false,
    lines: false,
    writeOffs: false,
    meta: false,
  };

  const emit = () => {
    const cloudReady =
      ready.sessions && ready.lines && ready.writeOffs && ready.meta;
    onData({
      sessions,
      orderItems,
      writeOffs,
      dailySeqByDate,
      cloudReady,
    });
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(
        sessionsCol.withConverter(sessionConverter),
        where("status", "==", "open"),
      ),
      (snap) => {
        sessions = snap.docs
          .map((d) => {
            try {
              return d.data();
            } catch (e) {
              console.warn("session decode", d.id, e);
              return null;
            }
          })
          .filter((x): x is ServiceSession => x != null);
        ready.sessions = true;
        emit();
      },
      (err) => onError(err),
    ),
  );

  unsubs.push(
    onSnapshot(
      linesCol.withConverter(orderItemConverter),
      (snap) => {
        orderItems = snap.docs
          .map((d) => {
            try {
              return d.data();
            } catch (e) {
              console.warn("orderLine decode", d.id, e);
              return null;
            }
          })
          .filter((x): x is OrderItem => x != null);
        ready.lines = true;
        emit();
      },
      (err) => onError(err),
    ),
  );

  unsubs.push(
    onSnapshot(
      writeOffsCol.withConverter(writeOffConverter),
      (snap) => {
        writeOffs = snap.docs
          .map((d) => {
            try {
              return d.data();
            } catch (e) {
              console.warn("writeOff decode", d.id, e);
              return null;
            }
          })
          .filter((x): x is WriteOff => x != null);
        ready.writeOffs = true;
        emit();
      },
      (err) => onError(err),
    ),
  );

  unsubs.push(
    onSnapshot(
      metaRef,
      (snap) => {
        if (snap.exists()) {
          try {
            dailySeqByDate = snap.data().dailySeqByDate ?? {};
          } catch (e) {
            console.warn("opsMeta decode", e);
          }
        }
        ready.meta = true;
        emit();
      },
      (err) => onError(err),
    ),
  );

  return () => unsubs.forEach((u) => u());
}

/** One-shot ops pull for manual refresh (same shape as subscribe emit). */
export async function fetchOpsSnapshot(
  storeId: string = getActiveStoreId(),
): Promise<OpsSnapshot | null> {
  if (!isFirebaseConfigured()) return null;
  const sessionsCol = storeCol(storeId, "sessions");
  const linesCol = storeCol(storeId, "orderLines");
  const writeOffsCol = storeCol(storeId, "writeOffs");
  const db = getDb();
  if (!sessionsCol || !linesCol || !writeOffsCol || !db) return null;

  const metaRef = doc(db, "stores", storeId, "config", "opsMeta").withConverter(
    metaConverter,
  );

  const [sessionsSnap, linesSnap, writeOffsSnap, metaSnap] = await Promise.all([
    getDocs(
      query(
        sessionsCol.withConverter(sessionConverter),
        where("status", "==", "open"),
      ),
    ),
    getDocs(linesCol.withConverter(orderItemConverter)),
    getDocs(writeOffsCol.withConverter(writeOffConverter)),
    getDoc(metaRef),
  ]);

  const decode = <T,>(
    docs: QueryDocumentSnapshot<T>[],
    label: string,
  ): T[] =>
    docs
      .map((d) => {
        try {
          return d.data();
        } catch (e) {
          console.warn(`${label} decode`, d.id, e);
          return null;
        }
      })
      .filter((x): x is T => x != null);

  let dailySeqByDate: Record<string, number> = {};
  if (metaSnap.exists()) {
    try {
      dailySeqByDate = metaSnap.data().dailySeqByDate ?? {};
    } catch (e) {
      console.warn("opsMeta decode", e);
    }
  }

  return {
    sessions: decode(sessionsSnap.docs, "session"),
    orderItems: decode(linesSnap.docs, "orderLine"),
    writeOffs: decode(writeOffsSnap.docs, "writeOff"),
    dailySeqByDate,
    cloudReady: true,
  };
}

/** Server read of one open session and the lines named on it. */
export async function fetchSessionCheckoutView(
  sessionId: string,
  storeId: string = getActiveStoreId(),
): Promise<{
  session: ServiceSession;
  orderItems: OrderItem[];
  writeOffs: WriteOff[];
} | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const sessionSnap = await getDocFromServer(
    doc(db, "stores", storeId, "sessions", sessionId).withConverter(
      sessionConverter,
    ),
  );
  if (!sessionSnap.exists()) return null;
  const session = sessionSnap.data();
  const lineIds = session.lineIds ?? [];
  const writeOffIds = session.writeOffIds ?? [];
  const [lineSnaps, writeOffSnaps] = await Promise.all([
    Promise.all(
      lineIds.map((id) =>
        getDocFromServer(
          doc(db, "stores", storeId, "orderLines", id).withConverter(
            orderItemConverter,
          ),
        ),
      ),
    ),
    Promise.all(
      writeOffIds.map((id) =>
        getDocFromServer(
          doc(db, "stores", storeId, "writeOffs", id).withConverter(
            writeOffConverter,
          ),
        ),
      ),
    ),
  ]);
  return {
    session,
    orderItems: lineSnaps.flatMap((snap) => (snap.exists() ? [snap.data()] : [])),
    writeOffs: writeOffSnaps.flatMap((snap) =>
      snap.exists() ? [snap.data()] : [],
    ),
  };
}

export type OpsWrite =
  | { kind: "session"; data: ServiceSession }
  | { kind: "deleteSession"; id: string }
  | { kind: "orderLine"; data: OrderItem }
  | { kind: "deleteOrderLine"; id: string }
  | { kind: "writeOff"; data: WriteOff }
  | { kind: "deleteWriteOff"; id: string }
  | { kind: "batch"; data: OrderBatch }
  | { kind: "deleteBatch"; id: string }
  | { kind: "seat"; data: SeatState }
  | { kind: "meta"; data: OpsMeta }
  | { kind: "event"; data: OpsEvent };

/**
 * Atomic multi-doc write for ops + events.
 */
export async function commitOpsWrites(
  writes: OpsWrite[],
  storeId: string = getActiveStoreId(),
): Promise<"ok" | "skipped_no_firebase"> {
  if (!isFirebaseConfigured()) return "skipped_no_firebase";
  const db = getDb();
  if (!db) return "skipped_no_firebase";
  const batch = writeBatch(db);

  for (const w of writes) {
    switch (w.kind) {
      case "session":
        batch.set(
          doc(db, "stores", storeId, "sessions", w.data.id).withConverter(
            sessionConverter,
          ),
          w.data,
        );
        break;
      case "deleteSession":
        batch.delete(doc(db, "stores", storeId, "sessions", w.id));
        break;
      case "orderLine":
        batch.set(
          doc(db, "stores", storeId, "orderLines", w.data.id).withConverter(
            orderItemConverter,
          ),
          w.data,
        );
        break;
      case "deleteOrderLine":
        batch.delete(doc(db, "stores", storeId, "orderLines", w.id));
        break;
      case "writeOff":
        batch.set(
          doc(db, "stores", storeId, "writeOffs", w.data.id).withConverter(
            writeOffConverter,
          ),
          w.data,
        );
        break;
      case "deleteWriteOff":
        batch.delete(doc(db, "stores", storeId, "writeOffs", w.id));
        break;
      case "batch":
        batch.set(
          doc(db, "stores", storeId, "orderBatches", w.data.id).withConverter(
            batchConverter,
          ),
          w.data,
        );
        break;
      case "deleteBatch":
        batch.delete(doc(db, "stores", storeId, "orderBatches", w.id));
        break;
      case "seat":
        batch.set(
          doc(db, "stores", storeId, "seats", w.data.id).withConverter(
            seatConverter,
          ),
          w.data,
        );
        break;
      case "meta":
        batch.set(
          doc(db, "stores", storeId, "config", "opsMeta").withConverter(
            metaConverter,
          ),
          w.data,
        );
        break;
      case "event":
        batch.set(
          doc(db, "stores", storeId, "opsEvents", w.data.id).withConverter(
            eventConverter,
          ),
          w.data,
        );
        break;
    }
  }

  await batch.commit();
  return "ok";
}

export function makeEvent(
  type: OpsEvent["type"],
  partial: Omit<OpsEvent, "id" | "type" | "at" | "deviceId"> & {
    at?: string;
  },
): OpsEvent {
  return OpsEventSchema.parse({
    id: newId("evt"),
    type,
    at: partial.at ?? new Date().toISOString(),
    deviceId: deviceId(),
    businessDate: partial.businessDate ?? businessDateKey(),
    sessionId: partial.sessionId,
    batchId: partial.batchId,
    lineId: partial.lineId,
    saleId: partial.saleId,
    productId: partial.productId,
    payload: partial.payload,
  });
}

export async function fetchOpsMeta(
  storeId: string = getActiveStoreId(),
): Promise<OpsMeta> {
  const empty: OpsMeta = {
    dailySeqByDate: {},
    updatedAt: new Date().toISOString(),
  };
  if (!isFirebaseConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;
  const ref = doc(db, "stores", storeId, "config", "opsMeta").withConverter(
    metaConverter,
  );
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : empty;
}
