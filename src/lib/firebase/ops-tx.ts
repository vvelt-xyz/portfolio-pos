/**
 * Same-account multi-device ops. One transaction per open / order / checkout.
 * Reads are document gets (client SDK cannot query inside a transaction).
 * EN: Seat claim, line revision, and one sale id per session.
 */
import {
  doc,
  runTransaction,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { OpsEventSchema, OpsMetaSchema, OrderBatchSchema, SeatStateSchema } from "@/domain/ops";
import {
  OrderItemSchema,
  SaleSchema,
  ServiceSessionSchema,
  WriteOffSchema,
  type OrderItem,
  type Sale,
  type ServiceSession,
  type WriteOff,
} from "@/domain/types";
import { makeEvent } from "@/lib/firebase/ops";
import { formatSessionNo } from "@/lib/ids";
import {
  addReverseQty,
  checkoutRevisionMatches,
  nextDailySeq,
  patchBumpsLineRevision,
  reverseQtyFits,
  saleDocIdForSession,
  seatIsOccupied,
} from "@/lib/firebase/ops-tx-logic";

function plain<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return JSON.parse(JSON.stringify(schema.parse(value))) as T;
}

function ref(db: Firestore, storeId: string, col: string, id: string) {
  return doc(db, "stores", storeId, col, id);
}

export class OpsTxAbort extends Error {
  constructor(
    readonly reason:
      | "seat_occupied"
      | "not_open"
      | "not_found"
      | "stale"
      | "already_settled"
      | "duplicate_batch"
      | "has_orders"
      | "already_reversed",
  ) {
    super(reason);
    this.name = "OpsTxAbort";
  }
}

export async function claimOpenSession(
  db: Firestore,
  input: {
    storeId: string;
    businessDate: string;
    session: Omit<ServiceSession, "sessionNo" | "lineIds" | "lineRevision" | "writeOffIds">;
    seatIds: string[];
  },
): Promise<{ ok: true; session: ServiceSession } | { ok: false; reason: "seat_occupied" }> {
  try {
    const session = await runTransaction(db, async (tx) => {
      const metaRef = ref(db, input.storeId, "config", "opsMeta");
      const metaSnap = await tx.get(metaRef);
      const prevMap = metaSnap.exists()
        ? (OpsMetaSchema.parse(metaSnap.data()).dailySeqByDate ?? {})
        : {};
      const { dailySeqByDate, nextSeq } = nextDailySeq(prevMap, input.businessDate);

      for (const seatId of input.seatIds) {
        const seatSnap = await tx.get(ref(db, input.storeId, "seats", seatId));
        const active = seatSnap.exists()
          ? SeatStateSchema.parse(seatSnap.data()).activeSessionId
          : null;
        let status: "open" | "closed" | "missing" = "missing";
        if (active) {
          const holder = await tx.get(ref(db, input.storeId, "sessions", active));
          if (!holder.exists()) status = "missing";
          else
            status = ServiceSessionSchema.parse(holder.data()).status;
        }
        if (seatIsOccupied({ activeSessionId: active, sessionStatus: status })) {
          throw new OpsTxAbort("seat_occupied");
        }
      }

      const created = plain(ServiceSessionSchema, {
        ...input.session,
        sessionNo: formatSessionNo(input.businessDate, nextSeq),
        lineIds: [],
        writeOffIds: [],
        lineRevision: 0,
      });

      tx.set(
        metaRef,
        plain(OpsMetaSchema, {
          dailySeqByDate,
          updatedAt: new Date().toISOString(),
        }),
      );
      tx.set(ref(db, input.storeId, "sessions", created.id), created);
      const at = new Date().toISOString();
      for (const seatId of input.seatIds) {
        tx.set(
          ref(db, input.storeId, "seats", seatId),
          plain(SeatStateSchema, {
            id: seatId,
            activeSessionId: created.id,
            updatedAt: at,
          }),
        );
      }
      const event = plain(
        OpsEventSchema,
        makeEvent("session.opened", {
          sessionId: created.id,
          businessDate: input.businessDate,
          payload: { channel: created.channel, seatIds: input.seatIds },
        }),
      );
      tx.set(ref(db, input.storeId, "opsEvents", event.id), event);
      return created;
    });
    return { ok: true, session };
  } catch (err) {
    if (err instanceof OpsTxAbort && err.reason === "seat_occupied") {
      return { ok: false, reason: "seat_occupied" };
    }
    throw err;
  }
}

export async function appendOrderLines(
  db: Firestore,
  input: {
    storeId: string;
    sessionId: string;
    batchId: string;
    lines: OrderItem[];
    businessDate: string;
  },
): Promise<
  | { ok: true; duplicate: boolean; lineRevision: number; lineIds: string[] }
  | { ok: false; reason: "not_found" | "not_open" }
> {
  try {
    const result = await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const batchRef = ref(db, input.storeId, "orderBatches", input.batchId);
      const sessionSnap = await tx.get(sessionRef);
      const batchSnap = await tx.get(batchRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      if (batchSnap.exists()) {
        return {
          duplicate: true,
          lineRevision: session.lineRevision ?? 0,
          lineIds: session.lineIds ?? [],
        };
      }
      const lineIds = [...(session.lineIds ?? [])];
      for (const line of input.lines) {
        const data = plain(OrderItemSchema, { ...line, sessionId: input.sessionId, batchId: input.batchId });
        if (!lineIds.includes(data.id)) lineIds.push(data.id);
        tx.set(ref(db, input.storeId, "orderLines", data.id), data);
      }
      const lineRevision = (session.lineRevision ?? 0) + 1;
      const next = plain(ServiceSessionSchema, {
        ...session,
        lineIds,
        lineRevision,
      });
      tx.set(sessionRef, next);
      tx.set(
        batchRef,
        plain(OrderBatchSchema, {
          id: input.batchId,
          sessionId: input.sessionId,
          confirmedAt: new Date().toISOString(),
        }),
      );
      const event = plain(
        OpsEventSchema,
        makeEvent("order.confirmed", {
          sessionId: input.sessionId,
          batchId: input.batchId,
          businessDate: input.businessDate,
          payload: { lineCount: input.lines.length },
        }),
      );
      tx.set(ref(db, input.storeId, "opsEvents", event.id), event);
      return { duplicate: false, lineRevision, lineIds };
    });
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function saveOrderLineTx(
  db: Firestore,
  input: { storeId: string; line: OrderItem },
): Promise<{ ok: true; lineRevision: number } | { ok: false; reason: "not_found" | "not_open" }> {
  try {
    const lineRevision = await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.line.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      const data = plain(OrderItemSchema, input.line);
      tx.set(ref(db, input.storeId, "orderLines", data.id), data);
      const nextRev = (session.lineRevision ?? 0) + 1;
      const lineIds = session.lineIds ?? [];
      tx.set(
        sessionRef,
        plain(ServiceSessionSchema, {
          ...session,
          lineIds: lineIds.includes(data.id) ? lineIds : [...lineIds, data.id],
          lineRevision: nextRev,
        }),
      );
      return nextRev;
    });
    return { ok: true, lineRevision };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function saveWriteOffTx(
  db: Firestore,
  input: { storeId: string; sessionId: string; writeOff: WriteOff | null; writeOffId: string },
): Promise<{ ok: true; lineRevision: number; writeOffIds: string[] } | { ok: false; reason: "not_found" | "not_open" }> {
  try {
    const result = await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      let writeOffIds = [...(session.writeOffIds ?? [])];
      if (input.writeOff) {
        const data = plain(WriteOffSchema, input.writeOff);
        tx.set(ref(db, input.storeId, "writeOffs", data.id), data);
        if (!writeOffIds.includes(data.id)) writeOffIds.push(data.id);
      } else {
        tx.delete(ref(db, input.storeId, "writeOffs", input.writeOffId));
        writeOffIds = writeOffIds.filter((id) => id !== input.writeOffId);
      }
      const lineRevision = (session.lineRevision ?? 0) + 1;
      tx.set(
        sessionRef,
        plain(ServiceSessionSchema, { ...session, writeOffIds, lineRevision }),
      );
      return { lineRevision, writeOffIds };
    });
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function patchOrderLinesTx(
  db: Firestore,
  input: {
    storeId: string;
    sessionId: string;
    patches: Array<{ id: string; qty?: number; status?: OrderItem["status"]; servedAt?: string }>;
  },
): Promise<{ ok: true; lineRevision: number } | { ok: false; reason: "not_found" | "not_open" }> {
  try {
    const lineRevision = await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      const lineSnaps: DocumentSnapshot[] = [];
      for (const patch of input.patches) {
        lineSnaps.push(await tx.get(ref(db, input.storeId, "orderLines", patch.id)));
      }
      input.patches.forEach((patch, i) => {
        const snap = lineSnaps[i]!;
        if (!snap.exists()) throw new OpsTxAbort("not_found");
        const current = OrderItemSchema.parse(snap.data());
        const next = plain(OrderItemSchema, {
          ...current,
          ...(patch.qty !== undefined ? { qty: patch.qty } : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.servedAt ? { servedAt: patch.servedAt } : {}),
        });
        tx.set(ref(db, input.storeId, "orderLines", patch.id), next);
      });
      const nextRev = patchBumpsLineRevision(input.patches)
        ? (session.lineRevision ?? 0) + 1
        : (session.lineRevision ?? 0);
      if (nextRev !== (session.lineRevision ?? 0)) {
        tx.set(
          sessionRef,
          plain(ServiceSessionSchema, { ...session, lineRevision: nextRev }),
        );
      }
      return nextRev;
    });
    return { ok: true, lineRevision };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function patchSessionTx(
  db: Firestore,
  input: {
    storeId: string;
    sessionId: string;
    guests?: ServiceSession["guests"];
    memo?: string;
    tagIds?: string[];
  },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_open" }> {
  try {
    await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const snap = await tx.get(sessionRef);
      if (!snap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(snap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      tx.set(
        sessionRef,
        plain(ServiceSessionSchema, {
          ...session,
          ...(input.guests ? { guests: input.guests } : {}),
          ...(input.memo !== undefined ? { memo: input.memo || undefined } : {}),
          ...(input.tagIds ? { tagIds: input.tagIds.length > 0 ? input.tagIds : undefined } : {}),
        }),
      );
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function moveSessionSeatsTx(
  db: Firestore,
  input: { storeId: string; sessionId: string; seatIds: string[]; seatLabel: string },
): Promise<{ ok: true } | { ok: false; reason: "seat_occupied" | "not_found" | "not_open" }> {
  try {
    await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      const nextIds = input.seatIds;
      const prevIds = session.seatIds ?? [];
      const acquired = nextIds.filter((id) => !prevIds.includes(id));
      const seatSnaps: DocumentSnapshot[] = [];
      for (const seatId of acquired) {
        seatSnaps.push(await tx.get(ref(db, input.storeId, "seats", seatId)));
      }
      for (let i = 0; i < acquired.length; i++) {
        const seatSnap = seatSnaps[i]!;
        const active = seatSnap.exists()
          ? SeatStateSchema.parse(seatSnap.data()).activeSessionId
          : null;
        let status: "open" | "closed" | "missing" = "missing";
        if (active && active !== input.sessionId) {
          const holder = await tx.get(ref(db, input.storeId, "sessions", active));
          status = holder.exists()
            ? ServiceSessionSchema.parse(holder.data()).status
            : "missing";
        }
        if (
          active &&
          active !== input.sessionId &&
          seatIsOccupied({ activeSessionId: active, sessionStatus: status })
        ) {
          throw new OpsTxAbort("seat_occupied");
        }
      }
      const at = new Date().toISOString();
      const released = prevIds.filter((id) => !nextIds.includes(id));
      for (const seatId of released) {
        tx.set(
          ref(db, input.storeId, "seats", seatId),
          plain(SeatStateSchema, { id: seatId, activeSessionId: null, updatedAt: at }),
        );
      }
      for (const seatId of acquired) {
        tx.set(
          ref(db, input.storeId, "seats", seatId),
          plain(SeatStateSchema, {
            id: seatId,
            activeSessionId: input.sessionId,
            updatedAt: at,
          }),
        );
      }
      tx.set(
        sessionRef,
        plain(ServiceSessionSchema, {
          ...session,
          seatIds: nextIds,
          seatLabel: input.seatLabel,
        }),
      );
    });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof OpsTxAbort &&
      (err.reason === "seat_occupied" || err.reason === "not_found" || err.reason === "not_open")
    ) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function cancelEmptySessionTx(
  db: Firestore,
  input: { storeId: string; sessionId: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_open" | "has_orders" }> {
  try {
    await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      if ((session.writeOffIds ?? []).length > 0) throw new OpsTxAbort("has_orders");
      const lineIds = session.lineIds ?? [];
      const lineSnaps: DocumentSnapshot[] = [];
      for (const id of lineIds) {
        lineSnaps.push(await tx.get(ref(db, input.storeId, "orderLines", id)));
      }
      for (const snap of lineSnaps) {
        if (!snap.exists()) continue;
        const line = OrderItemSchema.parse(snap.data());
        if (line.status !== "canceled") throw new OpsTxAbort("has_orders");
      }
      tx.delete(sessionRef);
      for (const id of lineIds) tx.delete(ref(db, input.storeId, "orderLines", id));
      const at = new Date().toISOString();
      for (const seatId of session.seatIds ?? []) {
        tx.set(
          ref(db, input.storeId, "seats", seatId),
          plain(SeatStateSchema, { id: seatId, activeSessionId: null, updatedAt: at }),
        );
      }
    });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof OpsTxAbort &&
      (err.reason === "not_found" || err.reason === "not_open" || err.reason === "has_orders")
    ) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function appendReverseSaleTx(
  db: Firestore,
  input: {
    storeId: string;
    originalSaleId: string;
    originalQtyByLine: number[];
    originalTotal: number;
    amountYen?: number;
    next: Array<{ index: number; qty: number }>;
    sale: Sale;
  },
): Promise<{ ok: true; saleId: string } | { ok: false; reason: "already_reversed" | "not_found" }> {
  try {
    const saleId = await runTransaction(db, async (tx) => {
      const saleRef = ref(db, input.storeId, "sales", input.originalSaleId);
      const guardRef = ref(db, input.storeId, "reverseGuards", input.originalSaleId);
      const saleSnap = await tx.get(saleRef);
      const guardSnap = await tx.get(guardRef);
      if (!saleSnap.exists()) throw new OpsTxAbort("not_found");
      const guard = (guardSnap.exists() ? guardSnap.data() : {}) as {
        applied?: Record<string, number>;
        appliedAmount?: number;
      };
      const applied = guard.applied ?? {};
      const appliedAmount = guard.appliedAmount ?? 0;
      if (input.next.length > 0 && !reverseQtyFits(input.originalQtyByLine, applied, input.next)) {
        throw new OpsTxAbort("already_reversed");
      }
      const addAmount = input.amountYen ?? 0;
      if (addAmount > 0 && appliedAmount + addAmount > input.originalTotal + 0.001) {
        throw new OpsTxAbort("already_reversed");
      }
      const id = input.sale.id;
      const reverseRef = ref(db, input.storeId, "sales", id);
      const existing = await tx.get(reverseRef);
      if (existing.exists()) throw new OpsTxAbort("already_reversed");
      tx.set(reverseRef, plain(SaleSchema, input.sale));
      tx.set(guardRef, {
        applied: input.next.length > 0 ? addReverseQty(applied, input.next) : applied,
        appliedAmount: appliedAmount + addAmount,
      });
      return id;
    });
    return { ok: true, saleId };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "already_reversed" || err.reason === "not_found")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

export async function checkoutSessionTx(
  db: Firestore,
  input: {
    storeId: string;
    sessionId: string;
    seenRevision: number;
    seenLineIds: string[];
    seenWriteOffIds: string[];
    sale: Sale;
    seatIds: string[];
    deleteLineIds: string[];
    deleteWriteOffIds: string[];
    deleteBatchIds: string[];
  },
): Promise<{ ok: true; saleId: string } | { ok: false; reason: "not_found" | "not_open" | "stale" | "already_settled" }> {
  const saleId = saleDocIdForSession(input.sessionId);
  try {
    await runTransaction(db, async (tx) => {
      const sessionRef = ref(db, input.storeId, "sessions", input.sessionId);
      const saleRef = ref(db, input.storeId, "sales", saleId);
      const sessionSnap = await tx.get(sessionRef);
      const saleSnap = await tx.get(saleRef);
      if (saleSnap.exists()) throw new OpsTxAbort("already_settled");
      if (!sessionSnap.exists()) throw new OpsTxAbort("not_found");
      const session = ServiceSessionSchema.parse(sessionSnap.data());
      if (session.status !== "open") throw new OpsTxAbort("not_open");
      if (
        !checkoutRevisionMatches({
          serverRevision: session.lineRevision,
          serverLineIds: session.lineIds,
          serverWriteOffIds: session.writeOffIds,
          seenRevision: input.seenRevision,
          seenLineIds: input.seenLineIds,
          seenWriteOffIds: input.seenWriteOffIds,
        })
      ) {
        throw new OpsTxAbort("stale");
      }
      for (const lineId of session.lineIds ?? []) {
        const lineSnap = await tx.get(ref(db, input.storeId, "orderLines", lineId));
        if (!lineSnap.exists()) throw new OpsTxAbort("stale");
      }
      const sale = plain(SaleSchema, {
        ...input.sale,
        id: saleId,
        sessionId: input.sessionId,
      });
      tx.set(saleRef, sale);
      tx.delete(sessionRef);
      for (const id of input.deleteLineIds) tx.delete(ref(db, input.storeId, "orderLines", id));
      for (const id of input.deleteWriteOffIds) tx.delete(ref(db, input.storeId, "writeOffs", id));
      for (const id of input.deleteBatchIds) tx.delete(ref(db, input.storeId, "orderBatches", id));
      const at = new Date().toISOString();
      for (const seatId of input.seatIds) {
        tx.set(
          ref(db, input.storeId, "seats", seatId),
          plain(SeatStateSchema, { id: seatId, activeSessionId: null, updatedAt: at }),
        );
      }
    });
    return { ok: true, saleId };
  } catch (err) {
    if (err instanceof OpsTxAbort && (err.reason === "not_found" || err.reason === "not_open" || err.reason === "stale" || err.reason === "already_settled")) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}
