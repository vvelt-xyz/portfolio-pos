"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { DEFAULT_TAX } from "@/constants";
import {
  formatSeatLabels,
  resolveSessionSeatLabel,
  getFloorSeat,
} from "@/data/floor.seed";
import type { MenuProduct } from "@/domain/menu-catalog";
import {
  billableQty,
  buildTaxBreakdownFromLines,
  emptyPosState,
  guestTotal,
  resolveServiceDiscountAmount,
  sessionSeatIds,
  type Guests,
  type OrderItem,
  type PaymentMethod,
  type PosState,
  type Sale,
  type ServiceDiscount,
  type ServiceSession,
  type SessionChannel,
  type WriteOff,
} from "@/domain/types";
import {
  mergeNewVisitTagIds,
  resolveFrozenSessionTags,
} from "@/domain/session-tags";
import { getTaxPolicy } from "@/domain/tax-policy";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  loadBusinessDayDoc,
  resolveBusinessDayPhase,
} from "@/lib/firebase/business-day";
import { getActiveStoreId } from "@/lib/firebase/store-id";
import {
  appendOrderLines,
  appendReverseSaleTx,
  cancelEmptySessionTx,
  checkoutSessionTx,
  claimOpenSession,
  moveSessionSeatsTx,
  patchOrderLinesTx,
  patchSessionTx,
  saveWriteOffTx,
} from "@/lib/firebase/ops-tx";
import {
  phaseOfBusinessDay,
  type BusinessDayDoc,
  type BusinessDayPhase,
} from "@/domain/business-day";
import { subscribeOps, fetchOpsSnapshot, fetchSessionCheckoutView, type OpsWrite } from "@/lib/firebase/ops";
import {
  backfillLocalSalesToFirestore,
  fetchRecentSales,
  fetchSalesByBusinessDate,
  subscribeSalesByBusinessDate,
} from "@/lib/firebase/sales";
import {
  applyOpsSnapshot,
  pushOpsWrites,
  seatWritesForSession,
  makeEvent,
  subscribeOpsSyncStatus,
  type OpsSyncStatus,
} from "@/lib/pos-cloud-bridge";
import { businessDateKey, formatSessionNo, newId } from "@/lib/ids";
import { sameCharge } from "@/lib/firebase/ops-tx-logic";
import {
  coveredProductIdsForSession,
  repriceSessionOrderItems,
  resolveUnitPriceForSession,
} from "@/lib/plans";
import {
  lineAmounts,
  resolveTaxIncludedUnitPrice,
  resolveTaxRate,
} from "@/lib/pricing";
import { loadPosState, savePosState } from "@/lib/storage";
import { loadSessionTagsLocal } from "@/lib/session-tags-storage";
import { useAuth } from "@/store/auth-store";
import { useMenu } from "@/store/menu-store";
import type { OrderBatch } from "@/domain/ops";

type OpenTableInput = {
  seatIds: string[];
  guests: Guests;
  tagIds?: string[];
  memo?: string;
};

type OpenTakeoutInput = {
  guests: Guests;
  tagIds?: string[];
  memo?: string;
};

export type OpenSessionResult =
  | { ok: true; session: ServiceSession }
  | {
      ok: false;
      reason:
        | "business_day_not_open"
        | "business_day_closed"
        | "seat_occupied"
        | "no_seats";
    };

type PosContextValue = {
  ready: boolean;
  state: PosState;
  products: MenuProduct[];
  openSessions: ServiceSession[];
  /** Today's business-day phase (not_started | open | closed). */
  businessDayPhase: BusinessDayPhase;
  businessDayDoc: BusinessDayDoc | null;
  refreshBusinessDay: () => Promise<void>;
  openTable: (input: OpenTableInput) => Promise<OpenSessionResult>;
  openTakeout: (input: OpenTakeoutInput) => Promise<OpenSessionResult>;
  /**
   * Replace seat set for an open table session (add / remove / move via reselect).
   * Returns false if invalid (empty, unknown seat, or conflict with another session).
   */
  changeSessionSeats: (sessionId: string, seatIds: string[]) => Promise<boolean>;
  /** Update guest mix on an open session (min 1 person). */
  updateSessionGuests: (sessionId: string, guests: Guests) => boolean;
  /**
   * Cancel an open session with no pending/served orders (and no write-offs).
   * Frees seats. Returns false if not eligible.
   * EN: Delete empty open session only; seats become vacant.
   */
  cancelOpenSession: (sessionId: string) => Promise<boolean>;
  updateMemo: (sessionId: string, memo: string) => void;
  updateSessionTags: (sessionId: string, tagIds: string[]) => void;
  addOrder: (
    sessionId: string,
    productId: string,
    qty?: number,
    memo?: string,
  ) => void;
  /** Confirm basket as one OrderBatch (cloud-canonical when Firebase on). */
  confirmOrderBatch: (
    sessionId: string,
    lines: Array<{
      productId: string;
      qty: number;
      memo?: string;
      channel?: SessionChannel;
      complimentary?: boolean;
    }>,
  ) => Promise<boolean>;
  addManualOrder: (input: {
    sessionId: string;
    name: string;
    qty: number;
    /** Tax-included list price. Complimentary lines bill ¥0 and keep this as list price. */
    unitPriceTaxIncluded: number;
    memo?: string;
    channel?: SessionChannel;
    complimentary?: boolean;
  }) => boolean;
  setOrderQty: (orderItemId: string, qty: number) => void;
  cancelOrder: (orderItemId: string) => void;
  cancelAllPending: (sessionId?: string) => void;
  markServed: (orderItemId: string) => void;
  markAllPendingServed: (sessionId?: string) => void;
  /**
   * Set absolute write-off qty for a served line on an open session (0 = clear).
   * EN: Open session only; replaces prior write-offs for the order item.
   */
  writeOffServed: (orderItemId: string, qty: number) => boolean;
  getSessionItems: (sessionId: string) => OrderItem[];
  getPendingItems: () => OrderItem[];
  getSessionWriteOffs: (sessionId: string) => WriteOff[];
  findSessionBySeat: (seatId: string) => ServiceSession | undefined;
  checkout: (input: {
    sessionId: string;
    method: PaymentMethod;
    received: number;
    allowUnserved: boolean;
    serviceDiscount?: { percent?: number; amount?: number };
  }) => Promise<
    | { ok: true; sale: Sale; cloud?: "created" | "exists" | "skipped_no_firebase" }
    | {
        ok: false;
        reason:
          | "unserved"
          | "empty"
          | "not_found"
          | "not_open"
          | "business_day_not_open"
          | "business_day_closed"
          | "cloud_save_failed"
          | "stale"
          | "already_settled";
      }
  >;
  todaySales: Sale[];
  /** Settled sales for export (Firestore when configured). */
  settledSales: Sale[];
  opsSyncStatus: OpsSyncStatus;
  opsSyncError: string | null;
  /** Manual pull from Firestore (ops + today’s / recent sales). */
  refreshFromCloud: () => Promise<void>;
};

const PosContext = createContext<PosContextValue | null>(null);

function nextSessionNo(state: PosState): { sessionNo: string; businessDate: string; nextSeq: number } {
  const businessDate = businessDateKey();
  const current = state.dailySeqByDate[businessDate] ?? 0;
  const nextSeq = current + 1;
  return {
    businessDate,
    nextSeq,
    sessionNo: formatSessionNo(businessDate, nextSeq),
  };
}

/** Union sales by id; `primary` wins on conflict. Sorted by paidAt asc. */
function mergeSalesById(
  primary: Sale[] | null | undefined,
  extra: Sale[] | null | undefined,
): Sale[] {
  const map = new Map<string, Sale>();
  for (const s of primary ?? []) map.set(s.id, s);
  for (const s of extra ?? []) {
    if (!map.has(s.id)) map.set(s.id, s);
  }
  return [...map.values()].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

export function PosProvider({ children }: { children: ReactNode }) {
  const { storeId: authStoreId, status: authStatus } = useAuth();
  const {
    allProducts,
    activeProducts,
    planDefinitions,
    catalogRevision,
  } = useMenu();
  const [state, setState] = useState<PosState>(emptyPosState);
  const [ready, setReady] = useState(false);
  const [cloudTodaySales, setCloudTodaySales] = useState<Sale[] | null>(null);
  const [cloudSettledSales, setCloudSettledSales] = useState<Sale[] | null>(
    null,
  );
  const [opsSyncStatus, setOpsSyncStatus] = useState<OpsSyncStatus>(() =>
    isFirebaseConfigured() ? "syncing" : "local",
  );
  const [opsSyncError, setOpsSyncError] = useState<string | null>(null);
  const [opsResubscribeKey, setOpsResubscribeKey] = useState(0);
  const [salesResubscribeKey, setSalesResubscribeKey] = useState(0);
  const [businessDayDoc, setBusinessDayDoc] = useState<BusinessDayDoc | null>(
    null,
  );
  const skipNextSave = useRef(true);
  const lastCatalogRevision = useRef<number | null>(null);
  const backfillDone = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const businessDayDocRef = useRef(businessDayDoc);
  businessDayDocRef.current = businessDayDoc;

  /** Claim store when signed in; DEFAULT when local-only. Never subscribe before claim. */
  const cloudStoreId =
    authStatus === "local"
      ? getActiveStoreId()
      : authStoreId;

  useEffect(() => {
    setState(loadPosState());
    setReady(true);
  }, []);

  useEffect(() => {
    return subscribeOpsSyncStatus((status, err) => {
      setOpsSyncStatus(status);
      setOpsSyncError(err);
    });
  }, []);

  /** Cloud ops as source of truth when Firebase is configured. */
  useEffect(() => {
    if (!ready || !isFirebaseConfigured() || !cloudStoreId) return;
    const unsub = subscribeOps(
      (snap) => {
        setState((prev) =>
          applyOpsSnapshot(prev, snap, { cloudReady: snap.cloudReady }),
        );
        if (snap.cloudReady && !opsSyncError) {
          setOpsSyncStatus((s) => (s === "error" ? s : "synced"));
        }
      },
      (err) => {
        console.warn("Ops subscribe failed", err);
        setOpsSyncStatus("error");
        setOpsSyncError(err.message);
      },
      cloudStoreId,
    );
    return () => {
      unsub?.();
    };
  }, [ready, opsSyncError, opsResubscribeKey, cloudStoreId]);

  useEffect(() => {
    if (!ready || !isFirebaseConfigured() || !cloudStoreId) {
      setCloudTodaySales(null);
      setCloudSettledSales(null);
      return;
    }
    const today = businessDateKey();
    const unsub = subscribeSalesByBusinessDate(
      today,
      (sales) => setCloudTodaySales(sales),
      (err) => {
        // MUST: Keep last good list on listener errors (do not blank admin).
        // EN: Preserve prior cloudTodaySales when the snapshot listener fails.
        console.warn("Firestore sales subscribe failed", err);
      },
      cloudStoreId,
    );
    void fetchRecentSales(500, cloudStoreId)
      .then((sales) => setCloudSettledSales(sales))
      .catch((err) => {
        console.warn("Firestore sales fetch failed", err);
        setCloudSettledSales(null);
      });
    return () => {
      unsub?.();
    };
  }, [ready, salesResubscribeKey, cloudStoreId]);

  const refreshBusinessDay = useCallback(async () => {
    const doc = await loadBusinessDayDoc(businessDateKey());
    setBusinessDayDoc(doc);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (isFirebaseConfigured() && !cloudStoreId) return;
    void refreshBusinessDay();
  }, [ready, refreshBusinessDay, cloudStoreId]);

  const refreshFromCloud = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      await refreshBusinessDay();
      return;
    }
    setOpsSyncStatus("syncing");
    try {
      // Push any local-only sales that previously failed (e.g. undefined fields).
      await backfillLocalSalesToFirestore(stateRef.current.sales).catch((err) =>
        console.warn("Sale backfill on refresh failed", err),
      );
      const [opsSnap, todaySales, recent] = await Promise.all([
        fetchOpsSnapshot(),
        fetchSalesByBusinessDate(businessDateKey()),
        fetchRecentSales(500),
      ]);
      if (opsSnap) {
        setState((prev) =>
          applyOpsSnapshot(prev, opsSnap, { cloudReady: true }),
        );
      }
      setCloudTodaySales(todaySales);
      setCloudSettledSales(recent);
      await refreshBusinessDay();
      setOpsSyncError(null);
      setOpsSyncStatus("synced");
      // Remount listeners in case the socket was stuck.
      setOpsResubscribeKey((k) => k + 1);
      setSalesResubscribeKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("refreshFromCloud failed", e);
      setOpsSyncStatus("error");
      setOpsSyncError(msg);
    }
  }, [refreshBusinessDay]);

  useEffect(() => {
    if (!ready || backfillDone.current || !isFirebaseConfigured()) return;
    if (state.sales.length === 0) {
      backfillDone.current = true;
      return;
    }
    backfillDone.current = true;
    void backfillLocalSalesToFirestore(state.sales)
      .then((r) => {
        if (r.created > 0) {
          console.info(
            `Backfilled ${r.created} local sale(s) to Firestore`,
          );
          return Promise.all([
            fetchRecentSales(500).then(setCloudSettledSales),
            fetchSalesByBusinessDate(businessDateKey()).then(setCloudTodaySales),
          ]);
        }
      })
      .catch((err) => console.warn("Sale backfill failed", err));
  }, [ready, state.sales]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    savePosState(state);
  }, [state, ready]);

  /** Reprice open sessions when menu catalog changes. */
  useEffect(() => {
    if (!ready) return;
    if (lastCatalogRevision.current === null) {
      lastCatalogRevision.current = catalogRevision;
      return;
    }
    if (lastCatalogRevision.current === catalogRevision) return;
    lastCatalogRevision.current = catalogRevision;
    setState((prev) => {
      let orderItems = prev.orderItems;
      let changed = false;
      for (const session of prev.sessions) {
        if (session.status !== "open") continue;
        const next = repriceSessionOrderItems(
          orderItems,
          session.id,
          session.channel,
          allProducts,
          planDefinitions,
        );
        if (next.some((o, i) => o !== orderItems[i])) {
          orderItems = next;
          changed = true;
        }
      }
      return changed ? { ...prev, orderItems } : prev;
    });
  }, [ready, catalogRevision, allProducts, planDefinitions]);

  const mutate = useCallback((fn: (prev: PosState) => PosState) => {
    setState((prev) => fn(prev));
  }, []);

  const openTable = useCallback(
    async (input: OpenTableInput): Promise<OpenSessionResult> => {
      const uniqueIds = [...new Set(input.seatIds)];
      if (uniqueIds.length === 0) return { ok: false, reason: "no_seats" };
      for (const id of uniqueIds) {
        if (!getFloorSeat(id)) return { ok: false, reason: "no_seats" };
      }
      const phase = await resolveBusinessDayPhase(businessDateKey());
      setBusinessDayDoc(await loadBusinessDayDoc(businessDateKey()));
      if (phase === "not_started")
        return { ok: false, reason: "business_day_not_open" };
      if (phase === "closed")
        return { ok: false, reason: "business_day_closed" };

      const db = isFirebaseConfigured() ? getDb() : null;
      if (db) {
        const businessDate = businessDateKey();
        const claimed = await claimOpenSession(db, {
          storeId: getActiveStoreId(),
          businessDate,
          seatIds: uniqueIds,
          session: {
            id: newId("ses"),
            channel: "table",
            seatIds: uniqueIds,
            seatLabel: formatSeatLabels(uniqueIds),
            guests: input.guests,
            tagIds:
              input.tagIds && input.tagIds.length > 0 ? input.tagIds : undefined,
            memo: input.memo?.trim() || undefined,
            status: "open",
            openedAt: new Date().toISOString(),
          },
        });
        if (!claimed.ok) return { ok: false, reason: "seat_occupied" };
        const created = claimed.session;
        mutate((p) => ({
          ...p,
          sessions: p.sessions.some((s) => s.id === created.id)
            ? p.sessions
            : [...p.sessions, created],
        }));
        return { ok: true, session: created };
      }

      // Local-only (no Firebase): occupancy is this browser's state.
      const prev = stateRef.current;
      const occupied = uniqueIds.some((seatId) =>
        prev.sessions.some(
          (s) =>
            s.status === "open" && sessionSeatIds(s).includes(seatId),
        ),
      );
      if (occupied) return { ok: false, reason: "seat_occupied" };

      const { sessionNo, nextSeq, businessDate } = nextSessionNo(prev);
      const created: ServiceSession = {
        id: newId("ses"),
        sessionNo,
        channel: "table",
        seatIds: uniqueIds,
        seatLabel: formatSeatLabels(uniqueIds),
        guests: input.guests,
        tagIds:
          input.tagIds && input.tagIds.length > 0 ? input.tagIds : undefined,
        memo: input.memo?.trim() || undefined,
        status: "open",
        openedAt: new Date().toISOString(),
      };
      const writes: OpsWrite[] = [
        { kind: "session", data: created },
        ...seatWritesForSession(created.id, uniqueIds, true),
        {
          kind: "meta",
          data: {
            dailySeqByDate: {
              ...prev.dailySeqByDate,
              [businessDate]: nextSeq,
            },
            updatedAt: new Date().toISOString(),
          },
        },
        {
          kind: "event",
          data: makeEvent("session.opened", {
            sessionId: created.id,
            businessDate,
            payload: { channel: "table", seatIds: uniqueIds },
          }),
        },
      ];
      mutate((p) => {
        const stillOccupied = uniqueIds.some((seatId) =>
          p.sessions.some(
            (s) =>
              s.status === "open" && sessionSeatIds(s).includes(seatId),
          ),
        );
        if (stillOccupied) return p;
        return {
          ...p,
          sessions: [...p.sessions, created],
          dailySeqByDate: {
            ...p.dailySeqByDate,
            [businessDate]: Math.max(
              p.dailySeqByDate[businessDate] ?? 0,
              nextSeq,
            ),
          },
        };
      });
      void pushOpsWrites(writes);
      return { ok: true, session: created };
    },
    [mutate],
  );

  const openTakeout = useCallback(
    async (input: OpenTakeoutInput): Promise<OpenSessionResult> => {
      const phase = await resolveBusinessDayPhase(businessDateKey());
      setBusinessDayDoc(await loadBusinessDayDoc(businessDateKey()));
      if (phase === "not_started")
        return { ok: false, reason: "business_day_not_open" };
      if (phase === "closed")
        return { ok: false, reason: "business_day_closed" };

      const db = isFirebaseConfigured() ? getDb() : null;
      if (db) {
        const claimed = await claimOpenSession(db, {
          storeId: getActiveStoreId(),
          businessDate: businessDateKey(),
          seatIds: [],
          session: {
            id: newId("ses"),
            channel: "takeout",
            guests: input.guests,
            tagIds:
              input.tagIds && input.tagIds.length > 0 ? input.tagIds : undefined,
            memo: input.memo?.trim() || undefined,
            status: "open",
            openedAt: new Date().toISOString(),
          },
        });
        if (!claimed.ok) return { ok: false, reason: "seat_occupied" };
        const created = claimed.session;
        mutate((p) => ({
          ...p,
          sessions: p.sessions.some((s) => s.id === created.id)
            ? p.sessions
            : [...p.sessions, created],
        }));
        return { ok: true, session: created };
      }

      // Build session from stateRef before mutate — never rely on setState updater
      // side-effects for the return value (async path / concurrent scheduling).
      const { sessionNo, nextSeq, businessDate } = nextSessionNo(
        stateRef.current,
      );
      const created: ServiceSession = {
        id: newId("ses"),
        sessionNo,
        channel: "takeout",
        guests: input.guests,
        tagIds:
          input.tagIds && input.tagIds.length > 0 ? input.tagIds : undefined,
        memo: input.memo?.trim() || undefined,
        status: "open",
        openedAt: new Date().toISOString(),
      };
      const dailySeqByDate = {
        ...stateRef.current.dailySeqByDate,
        [businessDate]: nextSeq,
      };
      const writes: OpsWrite[] = [
        { kind: "session", data: created },
        {
          kind: "meta",
          data: {
            dailySeqByDate,
            updatedAt: new Date().toISOString(),
          },
        },
        {
          kind: "event",
          data: makeEvent("session.opened", {
            sessionId: created.id,
            businessDate,
            payload: { channel: "takeout" },
          }),
        },
      ];
      mutate((prev) => ({
        ...prev,
        sessions: [...prev.sessions, created],
        dailySeqByDate: {
          ...prev.dailySeqByDate,
          [businessDate]: Math.max(
            prev.dailySeqByDate[businessDate] ?? 0,
            nextSeq,
          ),
        },
      }));
      void pushOpsWrites(writes);
      return { ok: true, session: created };
    },
    [mutate],
  );

  const changeSessionSeats = useCallback(
    async (sessionId: string, seatIds: string[]) => {
      const uniqueIds = [...new Set(seatIds)];
      if (uniqueIds.length === 0) return false;
      for (const id of uniqueIds) {
        if (!getFloorSeat(id)) return false;
      }

      const db = isFirebaseConfigured() ? getDb() : null;
      if (db) {
        const label = formatSeatLabels(uniqueIds);
        const moved = await moveSessionSeatsTx(db, {
          storeId: getActiveStoreId(),
          sessionId,
          seatIds: uniqueIds,
          seatLabel: label,
        });
        if (!moved.ok) return false;
        mutate((p) => ({
          ...p,
          sessions: p.sessions.map((s) =>
            s.id === sessionId ? { ...s, seatIds: uniqueIds, seatLabel: label } : s,
          ),
        }));
        return true;
      }

      let ok = false;
      let writes: OpsWrite[] = [];
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session || session.status !== "open" || session.channel !== "table") {
          return prev;
        }
        const prevIds = sessionSeatIds(session);
        const prevSet = new Set(prevIds);
        const nextSet = new Set(uniqueIds);

        for (const id of uniqueIds) {
          const holder = prev.sessions.find(
            (s) =>
              s.status === "open" &&
              s.id !== sessionId &&
              sessionSeatIds(s).includes(id),
          );
          if (holder) return prev;
        }

        const same =
          prevIds.length === uniqueIds.length &&
          uniqueIds.every((id) => prevSet.has(id));
        if (same) {
          ok = true;
          return prev;
        }

        const released = prevIds.filter((id) => !nextSet.has(id));
        const acquired = uniqueIds.filter((id) => !prevSet.has(id));
        const nextSession: ServiceSession = {
          ...session,
          seatIds: uniqueIds,
          seatLabel: formatSeatLabels(uniqueIds),
        };
        writes = [
          { kind: "session", data: nextSession },
          ...seatWritesForSession(sessionId, released, false),
          ...seatWritesForSession(sessionId, acquired, true),
          {
            kind: "event",
            data: makeEvent("session.seats_changed", {
              sessionId,
              businessDate: businessDateKey(),
              payload: {
                from: prevIds,
                to: uniqueIds,
                released,
                acquired,
              },
            }),
          },
        ];
        ok = true;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId ? nextSession : s,
          ),
        };
      });
      if (ok && writes.length > 0) void pushOpsWrites(writes);
      return ok;
    },
    [mutate],
  );

  const updateSessionGuests = useCallback(
    (sessionId: string, guests: Guests) => {
      if (guestTotal(guests) < 1) return false;
      const db = isFirebaseConfigured() ? getDb() : null;
      if (db) {
        void patchSessionTx(db, {
          storeId: getActiveStoreId(),
          sessionId,
          guests,
        }).then((cloud) => {
          if (!cloud.ok) return;
          mutate((prev) => ({
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.id === sessionId ? { ...s, guests } : s,
            ),
          }));
        });
        return true;
      }
      let ok = false;
      let writes: OpsWrite[] = [];
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session || session.status !== "open") return prev;
        const next: ServiceSession = { ...session, guests };
        writes = [
          { kind: "session", data: next },
          {
            kind: "event",
            data: makeEvent("session.guests_changed", {
              sessionId,
              businessDate: businessDateKey(),
              payload: {
                fromTotal: guestTotal(session.guests),
                toTotal: guestTotal(guests),
              },
            }),
          },
        ];
        ok = true;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId ? next : s,
          ),
        };
      });
      if (ok) void pushOpsWrites(writes);
      return ok;
    },
    [mutate],
  );

  const cancelOpenSession = useCallback(
    async (sessionId: string) => {
      const db = isFirebaseConfigured() ? getDb() : null;
      if (db) {
        const result = await cancelEmptySessionTx(db, {
          storeId: getActiveStoreId(),
          sessionId,
        });
        if (!result.ok) return false;
        mutate((prev) => ({
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== sessionId),
          orderItems: prev.orderItems.filter((o) => o.sessionId !== sessionId),
        }));
        return true;
      }
      let ok = false;
      let writes: OpsWrite[] = [];
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session || session.status !== "open") return prev;

        const hasOrders = prev.orderItems.some(
          (o) =>
            o.sessionId === sessionId &&
            (o.status === "pending" || o.status === "served"),
        );
        if (hasOrders) return prev;
        if (prev.writeOffs.some((w) => w.sessionId === sessionId)) return prev;

        const sessionLineIds = prev.orderItems
          .filter((o) => o.sessionId === sessionId)
          .map((o) => o.id);
        const sessionBatchIds = [
          ...new Set(
            prev.orderItems
              .filter((o) => o.sessionId === sessionId && o.batchId)
              .map((o) => o.batchId as string),
          ),
        ];
        const seatIds = sessionSeatIds(session);

        writes = [
          ...sessionLineIds.map(
            (id) => ({ kind: "deleteOrderLine" as const, id }),
          ),
          ...sessionBatchIds.map(
            (id) => ({ kind: "deleteBatch" as const, id }),
          ),
          { kind: "deleteSession", id: session.id },
          ...seatWritesForSession(session.id, seatIds, false),
          {
            kind: "event",
            data: makeEvent("session.closed", {
              sessionId: session.id,
              businessDate: businessDateKey(new Date(session.openedAt)),
              payload: { reason: "cancelled_empty" },
            }),
          },
        ];
        ok = true;
        return {
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== sessionId),
          orderItems: prev.orderItems.filter(
            (o) => o.sessionId !== sessionId,
          ),
        };
      });
      if (ok) void pushOpsWrites(writes);
      return ok;
    },
    [mutate],
  );

  const updateMemo = useCallback(
    (sessionId: string, memo: string) => {
      const nextMemo = memo.trim() || undefined;
      const db = isFirebaseConfigured() ? getDb() : null;
      const apply = () => {
        mutate((prev) => ({
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId ? { ...s, memo: nextMemo } : s,
          ),
        }));
      };
      if (!db) {
        apply();
        return;
      }
      void patchSessionTx(db, {
        storeId: getActiveStoreId(),
        sessionId,
        memo: nextMemo ?? "",
      }).then((cloud) => {
        if (cloud.ok) apply();
      });
    },
    [mutate],
  );

  const updateSessionTags = useCallback(
    (sessionId: string, tagIds: string[]) => {
      const db = isFirebaseConfigured() ? getDb() : null;
      const apply = () => {
        mutate((prev) => ({
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, tagIds: tagIds.length > 0 ? tagIds : undefined }
              : s,
          ),
        }));
      };
      if (!db) {
        apply();
        return;
      }
      void patchSessionTx(db, {
        storeId: getActiveStoreId(),
        sessionId,
        tagIds,
      }).then((cloud) => {
        if (cloud.ok) apply();
      });
    },
    [mutate],
  );

  const addOrder = useCallback(
    (sessionId: string, productId: string, qty = 1, memo?: string) => {
      // MUST: Gate on in-memory business day (same as UI), not localStorage alone.
      // EN: localStorage can lag / disagree with React phase after cloud refresh.
      if (phaseOfBusinessDay(businessDayDocRef.current) !== "open") return;
      let writes: OpsWrite[] = [];
      let planned: OrderItem[] | null = null;
      let line: OrderItem | null = null;
      flushSync(() => {
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session || session.status !== "open") return prev;
        const product = allProducts.find((p) => p.id === productId);
        if (!product || !product.isActive) return prev;

        const covered = coveredProductIdsForSession(
          prev.orderItems,
          sessionId,
          planDefinitions,
        );
        const { taxType, taxRate } = resolveTaxRate(product, session.channel);
        const unitIn = resolveUnitPriceForSession(
          product,
          session.channel,
          covered,
        );
        const lineMemo = memo?.trim() || undefined;
        const batchId = newId("bat");
        const batch: OrderBatch = {
          id: batchId,
          sessionId,
          confirmedAt: new Date().toISOString(),
        };

        const existing = prev.orderItems.find(
          (o) =>
            o.sessionId === sessionId &&
            o.productId === productId &&
            o.status === "pending" &&
            (o.channel ?? session.channel) === session.channel &&
            o.complimentary !== true &&
            o.unitPriceTaxIncluded === unitIn &&
            o.taxRate === taxRate &&
            (o.memo?.trim() || undefined) === lineMemo,
        );

        let orderItems = prev.orderItems;
        let touched: OrderItem;
        if (existing) {
          touched = { ...existing, qty: existing.qty + qty };
          orderItems = orderItems.map((o) =>
            o.id === existing.id ? touched : o,
          );
        } else {
          const amounts = lineAmounts(unitIn, taxRate, 1);
          touched = {
            id: newId("ord"),
            sessionId,
            batchId,
            productId,
            productName: product.name,
            channel: session.channel,
            taxType,
            taxRate,
            unitPriceTaxExcluded: amounts.unitTaxExcluded,
            unitPriceTaxIncluded: unitIn,
            unitCostTaxIncluded: product.costTaxIncluded,
            qty,
            status: "pending",
            orderedAt: new Date().toISOString(),
            ...(lineMemo ? { memo: lineMemo } : {}),
          };
          orderItems = [...orderItems, touched];
        }

        orderItems = repriceSessionOrderItems(
          orderItems,
          sessionId,
          session.channel,
          allProducts,
          planDefinitions,
        );
        const finalLine = orderItems.find((o) => o.id === touched.id) ?? touched;
        line = { ...finalLine, batchId: finalLine.batchId ?? batchId };
        planned = orderItems;
        writes = [
          { kind: "batch", data: batch },
          { kind: "orderLine", data: line },
          {
            kind: "event",
            data: makeEvent("order.confirmed", {
              sessionId,
              batchId,
              productId,
              payload: { qty },
            }),
          },
        ];
        return prev;
      });
      });
      const db = isFirebaseConfigured() ? getDb() : null;
      if (db && line) {
        const savedLine = line;
        const savedBatch = writes.find((w) => w.kind === "batch");
        const savedItems = planned;
        void appendOrderLines(db, {
          storeId: getActiveStoreId(),
          sessionId,
          batchId: savedBatch && savedBatch.kind === "batch" ? savedBatch.data.id : newId("bat"),
          lines: [savedLine],
          businessDate: businessDateKey(),
        }).then((cloud) => {
          if (!cloud.ok || !savedItems) return;
          mutate((p) => ({
            ...p,
            orderItems: savedItems,
            sessions: p.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, lineIds: cloud.lineIds, lineRevision: cloud.lineRevision }
                : s,
            ),
          }));
        });
        return;
      }
      if (planned) {
        const savedItems = planned;
        mutate((p) => ({ ...p, orderItems: savedItems }));
      }
      void pushOpsWrites(writes);
    },
    [mutate, allProducts, planDefinitions],
  );

  const confirmOrderBatch = useCallback(
    async (
      sessionId: string,
      lines: Array<{
        productId: string;
        qty: number;
        memo?: string;
        channel?: SessionChannel;
        complimentary?: boolean;
      }>,
    ): Promise<boolean> => {
      if (lines.length === 0) return false;
      if (phaseOfBusinessDay(businessDayDocRef.current) !== "open") return false;
      let writes: OpsWrite[] = [];
      let wrote = false;
      let plannedItems: OrderItem[] | null = null;
      flushSync(() => {
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === sessionId);
        if (!session || session.status !== "open") return prev;
        const batchId = newId("bat");
        const confirmedAt = new Date().toISOString();
        const batch: OrderBatch = { id: batchId, sessionId, confirmedAt };
        let orderItems = prev.orderItems;
        const newLines: OrderItem[] = [];

        for (const line of lines) {
          const product = allProducts.find((p) => p.id === line.productId);
          if (!product || !product.isActive) continue;
          const channel = line.channel ?? session.channel;
          const complimentary = line.complimentary === true;
          const covered = coveredProductIdsForSession(
            orderItems,
            sessionId,
            planDefinitions,
          );
          const { taxType, taxRate } = resolveTaxRate(product, channel);
          const listIn = resolveTaxIncludedUnitPrice(product, channel);
          const unitIn = complimentary
            ? 0
            : resolveUnitPriceForSession(product, channel, covered);
          const lineMemo = line.memo?.trim() || undefined;
          const existing = orderItems.find(
            (o) =>
              o.sessionId === sessionId &&
              o.productId === line.productId &&
              o.status === "pending" &&
              (o.channel ?? session.channel) === channel &&
              (o.complimentary === true) === complimentary &&
              o.unitPriceTaxIncluded === unitIn &&
              o.taxRate === taxRate &&
              (o.memo?.trim() || undefined) === lineMemo,
          );
          if (existing) {
            const updated = { ...existing, qty: existing.qty + line.qty, channel };
            orderItems = orderItems.map((o) =>
              o.id === existing.id ? updated : o,
            );
            newLines.push(updated);
          } else {
            const amounts = lineAmounts(unitIn, taxRate, 1);
            const item: OrderItem = {
              id: newId("ord"),
              sessionId,
              batchId,
              productId: line.productId,
              productName: product.name,
              channel,
              taxType,
              taxRate,
              unitPriceTaxExcluded: amounts.unitTaxExcluded,
              unitPriceTaxIncluded: unitIn,
              ...(complimentary
                ? {
                    complimentary: true as const,
                    listUnitPriceTaxIncluded: listIn,
                  }
                : {}),
              unitCostTaxIncluded: product.costTaxIncluded,
              qty: line.qty,
              status: "pending",
              orderedAt: confirmedAt,
              ...(lineMemo ? { memo: lineMemo } : {}),
            };
            orderItems = [...orderItems, item];
            newLines.push(item);
          }
        }

        orderItems = repriceSessionOrderItems(
          orderItems,
          sessionId,
          session.channel,
          allProducts,
          planDefinitions,
        );

        if (newLines.length === 0) return prev;
        wrote = true;
        plannedItems = orderItems;
        writes = [
          { kind: "batch", data: batch },
          ...newLines.map((l) => {
            const fresh = orderItems.find((o) => o.id === l.id) ?? l;
            return {
              kind: "orderLine" as const,
              data: { ...fresh, batchId: fresh.batchId ?? batchId },
            };
          }),
          {
            kind: "event",
            data: makeEvent("order.confirmed", {
              sessionId,
              batchId,
              payload: { lineCount: newLines.length },
            }),
          },
        ];

        return prev;
      });
      });
      const db = isFirebaseConfigured() ? getDb() : null;
      const linePayloads = writes
        .filter((w): w is { kind: "orderLine"; data: OrderItem } => w.kind === "orderLine")
        .map((w) => w.data);
      const batchId = writes.find((w) => w.kind === "batch")?.data.id;
      if (db && wrote && batchId && linePayloads.length > 0) {
        const cloud = await appendOrderLines(db, {
          storeId: getActiveStoreId(),
          sessionId,
          batchId,
          lines: linePayloads,
          businessDate: businessDateKey(),
        });
        if (!cloud.ok) return false;
        mutate((p) => ({
          ...p,
          orderItems: plannedItems ?? p.orderItems,
          sessions: p.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, lineIds: cloud.lineIds, lineRevision: cloud.lineRevision }
              : s,
          ),
        }));
        return true;
      }
      if (wrote && plannedItems) {
        const nextItems = plannedItems;
        mutate((p) => ({ ...p, orderItems: nextItems }));
      }
      void pushOpsWrites(writes);
      return wrote;
    },
    [mutate, allProducts, planDefinitions],
  );

  const addManualOrder = useCallback(
    (input: {
      sessionId: string;
      name: string;
      qty: number;
      unitPriceTaxIncluded: number;
      memo?: string;
      channel?: SessionChannel;
      complimentary?: boolean;
    }): boolean => {
      if (phaseOfBusinessDay(businessDayDocRef.current) !== "open") return false;
      let writes: OpsWrite[] = [];
      let wrote = false;
      flushSync(() => {
      mutate((prev) => {
        const session = prev.sessions.find((s) => s.id === input.sessionId);
        if (!session || session.status !== "open") return prev;
        const name = input.name.trim();
        const qty = Math.floor(input.qty);
        const complimentary = input.complimentary === true;
        const listIn = Math.max(0, Math.floor(input.unitPriceTaxIncluded));
        const unitIn = complimentary ? 0 : listIn;
        if (!name || qty < 1) return prev;

        const channel = input.channel ?? session.channel;
        const taxType = "standard" as const;
        const taxRate = DEFAULT_TAX.standardRate;
        const unitEx = Math.floor(unitIn / (1 + taxRate));
        const lineMemo = input.memo?.trim() || undefined;
        const existing = prev.orderItems.find(
          (o) =>
            o.sessionId === input.sessionId &&
            o.status === "pending" &&
            o.productName === name &&
            (o.channel ?? session.channel) === channel &&
            (o.complimentary === true) === complimentary &&
            o.unitPriceTaxIncluded === unitIn &&
            o.taxRate === taxRate &&
            (o.memo?.trim() || undefined) === lineMemo &&
            o.productId.startsWith("manual"),
        );
        if (existing) {
          const updated = { ...existing, qty: existing.qty + qty };
          wrote = true;
          writes = [{ kind: "orderLine", data: updated }];
          return prev;
        }
        const item: OrderItem = {
          id: newId("ord"),
          sessionId: input.sessionId,
          productId: newId("manual"),
          productName: name,
          channel,
          taxType,
          taxRate,
          unitPriceTaxExcluded: unitEx,
          unitPriceTaxIncluded: unitIn,
          ...(complimentary
            ? {
                complimentary: true as const,
                listUnitPriceTaxIncluded: listIn,
              }
            : {}),
          qty,
          status: "pending",
          orderedAt: new Date().toISOString(),
          ...(lineMemo ? { memo: lineMemo } : {}),
        };
        wrote = true;
        writes = [{ kind: "orderLine", data: item }];
        return prev;
      });
      });
      const db = isFirebaseConfigured() ? getDb() : null;
      const manual = writes.find((w) => w.kind === "orderLine");
      if (db && wrote && manual && manual.kind === "orderLine") {
        const line = manual.data;
        void appendOrderLines(db, {
          storeId: getActiveStoreId(),
          sessionId: input.sessionId,
          batchId: newId("bat"),
          lines: [line],
          businessDate: businessDateKey(),
        }).then((cloud) => {
          if (!cloud.ok) return;
          mutate((p) => ({
            ...p,
            orderItems: p.orderItems.some((o) => o.id === line.id)
              ? p.orderItems.map((o) => (o.id === line.id ? line : o))
              : [...p.orderItems, line],
            sessions: p.sessions.map((s) =>
              s.id === input.sessionId
                ? { ...s, lineIds: cloud.lineIds, lineRevision: cloud.lineRevision }
                : s,
            ),
          }));
        });
        return true;
      }
      if (wrote && manual && manual.kind === "orderLine") {
        const line = manual.data;
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.some((o) => o.id === line.id)
            ? p.orderItems.map((o) => (o.id === line.id ? line : o))
            : [...p.orderItems, line],
        }));
      }
      void pushOpsWrites(writes);
      return wrote;
    },
    [mutate],
  );

  const setOrderQty = useCallback(
    (orderItemId: string, qty: number) => {
      const prev = stateRef.current;
      const current = prev.orderItems.find((o) => o.id === orderItemId);
      if (!current || current.status === "canceled") return;
      const next =
        qty <= 0
          ? { ...current, status: "canceled" as const }
          : { ...current, qty };
      const db = isFirebaseConfigured() ? getDb() : null;
      if (!db) {
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.map((o) => (o.id === orderItemId ? next : o)),
        }));
        return;
      }
      void patchOrderLinesTx(db, {
        storeId: getActiveStoreId(),
        sessionId: current.sessionId,
        patches: [
          qty <= 0
            ? { id: orderItemId, status: "canceled" }
            : { id: orderItemId, qty },
        ],
      }).then((cloud) => {
        if (!cloud.ok) return;
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.map((o) => (o.id === orderItemId ? next : o)),
          sessions: p.sessions.map((s) =>
            s.id === current.sessionId ? { ...s, lineRevision: cloud.lineRevision } : s,
          ),
        }));
      });
    },
    [mutate],
  );

  const cancelOrder = useCallback(
    (orderItemId: string) => {
      const prev = stateRef.current;
      const target = prev.orderItems.find((o) => o.id === orderItemId);
      if (!target || target.status !== "pending") return;
      const session = prev.sessions.find((s) => s.id === target.sessionId);
      let orderItems = prev.orderItems.map((o) =>
        o.id === orderItemId ? { ...o, status: "canceled" as const } : o,
      );
      if (session) {
        orderItems = repriceSessionOrderItems(
          orderItems,
          session.id,
          session.channel,
          allProducts,
          planDefinitions,
        );
      }
      const changed = orderItems.filter((o, i) => o !== prev.orderItems[i]);
      const db = isFirebaseConfigured() ? getDb() : null;
      const apply = (lineRevision?: number) => {
        mutate((p) => ({
          ...p,
          orderItems,
          sessions:
            lineRevision === undefined
              ? p.sessions
              : p.sessions.map((s) =>
                  s.id === target.sessionId ? { ...s, lineRevision } : s,
                ),
        }));
      };
      if (!db) {
        apply();
        return;
      }
      void patchOrderLinesTx(db, {
        storeId: getActiveStoreId(),
        sessionId: target.sessionId,
        patches: changed.map((o) =>
          o.id === orderItemId
            ? { id: o.id, status: "canceled" as const, qty: o.qty }
            : { id: o.id, qty: o.qty },
        ),
      }).then((cloud) => {
        if (cloud.ok) apply(cloud.lineRevision);
      });
    },
    [mutate, allProducts, planDefinitions],
  );

  const cancelAllPending = useCallback(
    (sessionId?: string) => {
      const prev = stateRef.current;
      let orderItems = prev.orderItems.map((o) => {
        if (o.status !== "pending") return o;
        if (sessionId && o.sessionId !== sessionId) return o;
        return { ...o, status: "canceled" as const };
      });
      const sessionIds = [
        ...new Set(
          sessionId
            ? [sessionId]
            : prev.sessions.filter((s) => s.status === "open").map((s) => s.id),
        ),
      ];
      for (const sid of sessionIds) {
        const session = prev.sessions.find((s) => s.id === sid);
        if (!session) continue;
        orderItems = repriceSessionOrderItems(
          orderItems,
          sid,
          session.channel,
          allProducts,
          planDefinitions,
        );
      }
      const db = isFirebaseConfigured() ? getDb() : null;
      if (!db) {
        mutate((p) => ({ ...p, orderItems }));
        return;
      }
      void (async () => {
        const revisions = new Map<string, number>();
        for (const sid of sessionIds) {
          const patches = orderItems
            .filter((o) => o.sessionId === sid)
            .filter((o, i) => o !== prev.orderItems[i] || o.status === "canceled")
            .map((o) =>
              o.status === "canceled"
                ? { id: o.id, status: "canceled" as const }
                : { id: o.id, qty: o.qty },
            );
          if (patches.length === 0) continue;
          const cloud = await patchOrderLinesTx(db, {
            storeId: getActiveStoreId(),
            sessionId: sid,
            patches,
          });
          if (cloud.ok) revisions.set(sid, cloud.lineRevision);
        }
        mutate((p) => ({
          ...p,
          orderItems,
          sessions: p.sessions.map((s) =>
            revisions.has(s.id) ? { ...s, lineRevision: revisions.get(s.id)! } : s,
          ),
        }));
      })();
    },
    [mutate, allProducts, planDefinitions],
  );

  const markServed = useCallback(
    (orderItemId: string) => {
      const current = stateRef.current.orderItems.find((o) => o.id === orderItemId);
      if (!current || current.status !== "pending") return;
      const servedAt = new Date().toISOString();
      const db = isFirebaseConfigured() ? getDb() : null;
      const apply = (lineRevision?: number) => {
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.map((o) =>
            o.id === orderItemId ? { ...o, status: "served" as const, servedAt } : o,
          ),
          sessions:
            lineRevision === undefined
              ? p.sessions
              : p.sessions.map((s) =>
                  s.id === current.sessionId ? { ...s, lineRevision } : s,
                ),
        }));
      };
      if (!db) {
        apply();
        return;
      }
      void patchOrderLinesTx(db, {
        storeId: getActiveStoreId(),
        sessionId: current.sessionId,
        patches: [{ id: orderItemId, status: "served", servedAt }],
      }).then((cloud) => {
        if (cloud.ok) apply(cloud.lineRevision);
      });
    },
    [mutate],
  );

  const markAllPendingServed = useCallback(
    (sessionId?: string) => {
      const now = new Date().toISOString();
      const prev = stateRef.current;
      const targets = prev.orderItems.filter(
        (o) => o.status === "pending" && (!sessionId || o.sessionId === sessionId),
      );
      const db = isFirebaseConfigured() ? getDb() : null;
      if (!db) {
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.map((o) =>
            targets.some((t) => t.id === o.id)
              ? { ...o, status: "served" as const, servedAt: now }
              : o,
          ),
        }));
        return;
      }
      const bySession = new Map<string, string[]>();
      for (const o of targets) {
        const list = bySession.get(o.sessionId) ?? [];
        list.push(o.id);
        bySession.set(o.sessionId, list);
      }
      void (async () => {
        const revisions = new Map<string, number>();
        for (const [sid, ids] of bySession) {
          const cloud = await patchOrderLinesTx(db, {
            storeId: getActiveStoreId(),
            sessionId: sid,
            patches: ids.map((id) => ({ id, status: "served" as const, servedAt: now })),
          });
          if (cloud.ok) revisions.set(sid, cloud.lineRevision);
        }
        mutate((p) => ({
          ...p,
          orderItems: p.orderItems.map((o) =>
            targets.some((t) => t.id === o.id)
              ? { ...o, status: "served" as const, servedAt: now }
              : o,
          ),
          sessions: p.sessions.map((s) =>
            revisions.has(s.id) ? { ...s, lineRevision: revisions.get(s.id)! } : s,
          ),
        }));
      })();
    },
    [mutate],
  );

  const writeOffServed = useCallback(
    (orderItemId: string, qty: number) => {
      if (!Number.isInteger(qty) || qty < 0) return false;
      let ok = false;
      let writes: OpsWrite[] = [];
      mutate((prev) => {
        const item = prev.orderItems.find((o) => o.id === orderItemId);
        if (!item || item.status !== "served") return prev;
        const session = prev.sessions.find((s) => s.id === item.sessionId);
        if (!session || session.status !== "open") return prev;
        if (qty > item.qty) return prev;
        const prior = prev.writeOffs.find((w) => w.orderItemId === orderItemId);
        const without = prev.writeOffs.filter(
          (w) => w.orderItemId !== orderItemId,
        );
        if (qty === 0) {
          ok = true;
          if (prior) {
            writes = [
              { kind: "deleteWriteOff", id: prior.id },
              {
                kind: "event",
                data: makeEvent("writeoff.upserted", {
                  sessionId: item.sessionId,
                  lineId: item.id,
                  productId: item.productId,
                  payload: { qty: 0 },
                }),
              },
            ];
          }
          return { ...prev, writeOffs: without };
        }
        const amounts = lineAmounts(
          item.unitPriceTaxIncluded,
          item.taxRate,
          qty,
        );
        const lineMemo = item.memo?.trim() || undefined;
        const entry: WriteOff = {
          id: prior?.id ?? newId("wo"),
          sessionId: item.sessionId,
          orderItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          taxType: item.taxType,
          taxRate: item.taxRate,
          unitPriceTaxExcluded: item.unitPriceTaxExcluded,
          unitPriceTaxIncluded: item.unitPriceTaxIncluded,
          qty,
          lineTaxExcluded: amounts.lineTaxExcluded,
          lineTaxAmount: amounts.lineTaxAmount,
          lineTaxIncluded: amounts.lineTaxIncluded,
          kind: "loss",
          createdAt: new Date().toISOString(),
          ...(lineMemo ? { memo: lineMemo } : {}),
        };
        ok = true;
        writes = [
          { kind: "writeOff", data: entry },
          {
            kind: "event",
            data: makeEvent("writeoff.upserted", {
              sessionId: item.sessionId,
              lineId: item.id,
              productId: item.productId,
              payload: { qty },
            }),
          },
        ];
        return {
          ...prev,
          writeOffs: [...without, entry],
        };
      });
      const db = isFirebaseConfigured() ? getDb() : null;
      const entry = writes.find((w) => w.kind === "writeOff");
      const deleted = writes.find((w) => w.kind === "deleteWriteOff");
      if (db && ok && (entry || deleted)) {
        const sessionId = stateRef.current.orderItems.find((o) => o.id === orderItemId)
          ?.sessionId;
        if (!sessionId) return false;
        void saveWriteOffTx(db, {
          storeId: getActiveStoreId(),
          sessionId,
          writeOff: entry && entry.kind === "writeOff" ? entry.data : null,
          writeOffId:
            entry && entry.kind === "writeOff"
              ? entry.data.id
              : deleted && deleted.kind === "deleteWriteOff"
                ? deleted.id
                : "",
        }).then((cloud) => {
          if (!cloud.ok) return;
          mutate((p) => ({
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    lineRevision: cloud.lineRevision,
                    writeOffIds: cloud.writeOffIds,
                  }
                : s,
            ),
          }));
        });
        return ok;
      }
      if (ok) void pushOpsWrites(writes);
      return ok;
    },
    [mutate],
  );

  const getSessionItems = useCallback(
    (sessionId: string) =>
      state.orderItems.filter(
        (o) => o.sessionId === sessionId && o.status !== "canceled",
      ),
    [state.orderItems],
  );

  const getPendingItems = useCallback(
    () => state.orderItems.filter((o) => o.status === "pending"),
    [state.orderItems],
  );

  const getSessionWriteOffs = useCallback(
    (sessionId: string) =>
      state.writeOffs.filter((w) => w.sessionId === sessionId),
    [state.writeOffs],
  );

  const findSessionBySeat = useCallback(
    (seatId: string) =>
      state.sessions.find(
        (s) => s.status === "open" && sessionSeatIds(s).includes(seatId),
      ),
    [state.sessions],
  );

  const checkout = useCallback(
    async (input: {
      sessionId: string;
      method: PaymentMethod;
      received: number;
      allowUnserved: boolean;
      serviceDiscount?: { percent?: number; amount?: number };
    }) => {
      const session = state.sessions.find((s) => s.id === input.sessionId);
      if (!session) return { ok: false as const, reason: "not_found" as const };
      if (session.status !== "open")
        return { ok: false as const, reason: "not_open" as const };

      const businessDate = businessDateKey();
      const phase = await resolveBusinessDayPhase(businessDate);
      setBusinessDayDoc(await loadBusinessDayDoc(businessDate));
      if (phase === "not_started") {
        return { ok: false as const, reason: "business_day_not_open" as const };
      }
      if (phase === "closed") {
        return { ok: false as const, reason: "business_day_closed" as const };
      }

      const active = state.orderItems.filter(
        (o) => o.sessionId === input.sessionId && o.status !== "canceled",
      );
      const sessionWriteOffs = state.writeOffs.filter(
        (w) => w.sessionId === input.sessionId,
      );

      const chargeable = active
        .map((o) => ({
          item: o,
          qty: billableQty(o, state.writeOffs),
        }))
        .filter((x) => x.qty > 0);

      if (chargeable.length === 0 && sessionWriteOffs.length === 0)
        return { ok: false as const, reason: "empty" as const };

      const unserved = active.some(
        (o) => o.status === "pending" && billableQty(o, state.writeOffs) > 0,
      );
      if (unserved && !input.allowUnserved)
        return { ok: false as const, reason: "unserved" as const };

      const lines = chargeable.map(({ item: o, qty }) => {
        const amounts = lineAmounts(o.unitPriceTaxIncluded, o.taxRate, qty);
        const lineMemo = o.memo?.trim() || undefined;
        const channel = o.channel ?? session.channel;
        return {
          productId: o.productId,
          productName: o.productName,
          taxType: o.taxType,
          taxRate: o.taxRate,
          qty,
          unitPriceTaxExcluded: amounts.unitTaxExcluded,
          unitPriceTaxIncluded: o.unitPriceTaxIncluded,
          unitCostTaxIncluded: o.unitCostTaxIncluded,
          lineTaxExcluded: amounts.lineTaxExcluded,
          lineTaxAmount: amounts.lineTaxAmount,
          lineTaxIncluded: amounts.lineTaxIncluded,
          sourceLineId: o.id,
          channel,
          ...(o.complimentary
            ? {
                complimentary: true as const,
                ...(o.listUnitPriceTaxIncluded != null
                  ? { listUnitPriceTaxIncluded: o.listUnitPriceTaxIncluded }
                  : {}),
              }
            : {}),
          ...(lineMemo ? { memo: lineMemo } : {}),
        };
      });

      const writeOffLines = sessionWriteOffs.map((w) => {
        const orderMemo =
          active.find((o) => o.id === w.orderItemId)?.memo?.trim() ||
          w.memo?.trim() ||
          undefined;
        return {
          productId: w.productId,
          productName: w.productName,
          taxType: w.taxType,
          taxRate: w.taxRate,
          qty: w.qty,
          unitPriceTaxExcluded: w.unitPriceTaxExcluded,
          unitPriceTaxIncluded: w.unitPriceTaxIncluded,
          lineTaxExcluded: w.lineTaxExcluded,
          lineTaxAmount: w.lineTaxAmount,
          lineTaxIncluded: w.lineTaxIncluded,
          ...(orderMemo ? { memo: orderMemo } : {}),
        };
      });

      const subtotalTaxIncluded = lines.reduce(
        (s, l) => s + l.lineTaxIncluded,
        0,
      );
      const subtotalTaxExcluded = lines.reduce(
        (s, l) => s + l.lineTaxExcluded,
        0,
      );
      const resolved = input.serviceDiscount
        ? resolveServiceDiscountAmount(subtotalTaxIncluded, input.serviceDiscount)
        : null;
      const serviceDiscount: ServiceDiscount | undefined = resolved
        ? {
            kind: "service",
            mode: resolved.mode,
            percent: resolved.percent,
            inputAmount: resolved.inputAmount,
            amountTaxIncluded: resolved.amountTaxIncluded,
          }
        : undefined;
      const discountYen = serviceDiscount?.amountTaxIncluded ?? 0;
      const totalTaxIncluded = Math.max(0, subtotalTaxIncluded - discountYen);
      // Keep excluded proportional when discount applies (reporting approx).
      const totalTaxExcluded =
        subtotalTaxIncluded > 0
          ? Math.floor(
              (subtotalTaxExcluded * totalTaxIncluded) / subtotalTaxIncluded,
            )
          : 0;
      const totalTaxAmount = totalTaxIncluded - totalTaxExcluded;
      const writeOffTotalTaxIncluded = writeOffLines.reduce(
        (s, l) => s + l.lineTaxIncluded,
        0,
      );
      const change = Math.max(0, input.received - totalTaxIncluded);
      const paidAt = new Date().toISOString();
      const taxBreakdown = buildTaxBreakdownFromLines(lines);
      const policy = getTaxPolicy();
      const sale: Sale = {
        id: newId("sale"),
        kind: "sale",
        sessionId: session.id,
        sessionNo: session.sessionNo,
        channel: session.channel,
        seatIds: sessionSeatIds(session),
        seatLabel:
          resolveSessionSeatLabel(session) || session.seatLabel,
        guests: session.guests,
        tags: resolveFrozenSessionTags(
          mergeNewVisitTagIds(
            session.tagIds,
            session.guests?.isNewVisit,
          ),
          loadSessionTagsLocal(),
        ),
        openedAt: session.openedAt,
        businessDate,
        cutoffHour: policy.businessDayCutoffHour,
        paidAt,
        method: input.method,
        received: input.received,
        change,
        subtotalTaxIncluded,
        totalTaxExcluded,
        totalTaxAmount,
        totalTaxIncluded,
        lines,
        writeOffs: writeOffLines,
        writeOffTotalTaxIncluded,
        serviceDiscount,
        taxPolicyVersion: policy.version,
        taxBreakdown,
        hadUnserved: unserved,
      };

      const closedAt = paidAt;
      const sessionLineIds = state.orderItems
        .filter((o) => o.sessionId === session.id)
        .map((o) => o.id);
      const sessionBatchIds = [
        ...new Set(
          state.orderItems
            .filter((o) => o.sessionId === session.id && o.batchId)
            .map((o) => o.batchId as string),
        ),
      ];
      const seatIds = sessionSeatIds(session);

      // MUST: Persist sale before purging the open session so CheckoutScreen
      // never renders !session while doneNo is still unset (await gap).
      // EN: Append sale first; purge local session only after cloud attempt.
      // MUST: When Firebase is configured, persist sale before purging L2.
      // On failure, leave the open session intact so staff can retry.
      // EN: Never purge the session if the cloud sale write failed.
      let cloud: "created" | "exists" | "skipped_no_firebase" =
        "skipped_no_firebase";
      const db = isFirebaseConfigured() ? getDb() : null;
      let pushedByTx = false;
      if (db) {
        sale.id = session.id;
        try {
          let settled = await checkoutSessionTx(db, {
            storeId: getActiveStoreId(),
            sessionId: session.id,
            seenRevision: session.lineRevision ?? 0,
            seenLineIds: session.lineIds ?? sessionLineIds,
            seenWriteOffIds:
              session.writeOffIds ?? sessionWriteOffs.map((w) => w.id),
            sale,
            seatIds,
            deleteLineIds: sessionLineIds,
            deleteWriteOffIds: sessionWriteOffs.map((w) => w.id),
            deleteBatchIds: sessionBatchIds,
          });
          if (!settled.ok && settled.reason === "stale") {
            const fresh = await fetchSessionCheckoutView(session.id);
            const seenCharge = chargeable.map(({ item, qty }) => ({
              lineId: item.id,
              qty,
              unitPriceTaxIncluded: item.unitPriceTaxIncluded,
            }));
            const freshCharge =
              fresh?.session.status === "open"
                ? fresh.orderItems
                    .map((item) => ({
                      lineId: item.id,
                      qty: billableQty(item, fresh.writeOffs),
                      unitPriceTaxIncluded: item.unitPriceTaxIncluded,
                    }))
                    .filter((row) => row.qty > 0)
                : null;
            if (
              fresh &&
              fresh.session.status === "open" &&
              freshCharge &&
              sameCharge(seenCharge, freshCharge)
            ) {
              const freshLineIds =
                fresh.session.lineIds ?? fresh.orderItems.map((o) => o.id);
              settled = await checkoutSessionTx(db, {
                storeId: getActiveStoreId(),
                sessionId: session.id,
                seenRevision: fresh.session.lineRevision ?? 0,
                seenLineIds: freshLineIds,
                seenWriteOffIds:
                  fresh.session.writeOffIds ??
                  fresh.writeOffs.map((w) => w.id),
                sale,
                seatIds,
                deleteLineIds: [
                  ...new Set([...sessionLineIds, ...freshLineIds]),
                ],
                deleteWriteOffIds: [
                  ...new Set([
                    ...sessionWriteOffs.map((w) => w.id),
                    ...fresh.writeOffs.map((w) => w.id),
                  ]),
                ],
                deleteBatchIds: sessionBatchIds,
              });
            }
          }
          if (!settled.ok) {
            if (settled.reason === "already_settled") {
              setState((prev) => ({
                ...prev,
                sessions: prev.sessions.filter((s) => s.id !== session.id),
                orderItems: prev.orderItems.filter(
                  (o) => o.sessionId !== session.id,
                ),
                writeOffs: prev.writeOffs.filter(
                  (w) => w.sessionId !== session.id,
                ),
              }));
            }
            return {
              ok: false as const,
              reason:
                settled.reason === "stale"
                  ? ("stale" as const)
                  : settled.reason === "already_settled"
                    ? ("already_settled" as const)
                    : ("cloud_save_failed" as const),
            };
          }
          cloud = "created";
          pushedByTx = true;
          setCloudTodaySales((prev) => mergeSalesById(prev, [sale]));
          setCloudSettledSales((prev) => mergeSalesById(prev, [sale]));
        } catch (err) {
          console.warn("Firestore sale append failed", err);
          return { ok: false as const, reason: "cloud_save_failed" as const };
        }
      }

      if (!pushedByTx) {
        void pushOpsWrites([
          ...sessionLineIds.map(
            (id) => ({ kind: "deleteOrderLine" as const, id }),
          ),
          ...sessionWriteOffs.map(
            (w) => ({ kind: "deleteWriteOff" as const, id: w.id }),
          ),
          ...sessionBatchIds.map(
            (id) => ({ kind: "deleteBatch" as const, id }),
          ),
          { kind: "deleteSession", id: session.id },
          ...seatWritesForSession(session.id, seatIds, false),
          {
            kind: "event",
            data: makeEvent("session.closed", {
              sessionId: session.id,
              saleId: sale.id,
              businessDate,
              payload: { closedAt },
            }),
          },
          {
            kind: "event",
            data: makeEvent("sale.created", {
              sessionId: session.id,
              saleId: sale.id,
              businessDate,
              payload: { totalTaxIncluded },
            }),
          },
        ]);
      }

      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.filter((s) => s.id !== session.id),
        orderItems: prev.orderItems.filter((o) => o.sessionId !== session.id),
        writeOffs: prev.writeOffs.filter((w) => w.sessionId !== session.id),
        sales: [...prev.sales, sale],
      }));

      return { ok: true as const, sale, cloud };
    },
    [state.orderItems, state.sessions, state.writeOffs],
  );

  const openSessions = useMemo(
    () => state.sessions.filter((s) => s.status === "open"),
    [state.sessions],
  );

  const useCloudSales = isFirebaseConfigured();

  const todaySales = useMemo(() => {
    const today = businessDateKey();
    const localToday = state.sales.filter((s) => s.businessDate === today);
    if (useCloudSales) {
      // Include local-only sales (cloud write failed / lag) so 商品別 and 伝票 list stay in sync.
      return mergeSalesById(cloudTodaySales, localToday);
    }
    return localToday;
  }, [useCloudSales, cloudTodaySales, state.sales]);

  const settledSales = useMemo(() => {
    if (useCloudSales) {
      return mergeSalesById(cloudSettledSales, state.sales);
    }
    return state.sales;
  }, [useCloudSales, cloudSettledSales, state.sales]);

  const businessDayPhase = phaseOfBusinessDay(businessDayDoc);

  const value: PosContextValue = {
    ready,
    state,
    products: activeProducts,
    openSessions,
    businessDayPhase,
    businessDayDoc,
    refreshBusinessDay,
    openTable,
    openTakeout,
    changeSessionSeats,
    updateSessionGuests,
    cancelOpenSession,
    updateMemo,
    updateSessionTags,
    addOrder,
    confirmOrderBatch,
    addManualOrder,
    setOrderQty,
    cancelOrder,
    cancelAllPending,
    markServed,
    markAllPendingServed,
    writeOffServed,
    getSessionItems,
    getPendingItems,
    getSessionWriteOffs,
    findSessionBySeat,
    checkout,
    todaySales,
    settledSales,
    opsSyncStatus,
    opsSyncError,
    refreshFromCloud,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}

export function useSession(sessionId: string): ServiceSession | undefined {
  const { state } = usePos();
  return state.sessions.find((s) => s.id === sessionId);
}

export function channelOf(session: ServiceSession): SessionChannel {
  return session.channel;
}
