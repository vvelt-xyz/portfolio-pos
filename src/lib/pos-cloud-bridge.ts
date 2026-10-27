/**
 * Bridge local PosState ops ↔ Firestore L2/L3 when Firebase is configured.
 *
 * MUST: Never let a partial/empty cloud snapshot wipe in-flight local open sessions.
 * EN: Partial empty snapshots must not erase optimistic open floor state.
 */
import type { OpsWrite } from "@/lib/firebase/ops";
import {
  commitOpsWrites,
  makeEvent,
  type OpsSnapshot,
} from "@/lib/firebase/ops";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { OrderItem, PosState, ServiceSession, WriteOff } from "@/domain/types";
import { sessionSeatIds } from "@/domain/types";

export type OpsSyncStatus = "local" | "synced" | "syncing" | "error";

/** Keep optimistic opens this long even if pending was lost (HMR / remount). */
const OPEN_GRACE_MS = 120_000;
const PENDING_STORAGE_KEY = "pos_v1_ops_pending";

type PendingSets = {
  sessions: Set<string>;
  orderLines: Set<string>;
  writeOffs: Set<string>;
};

function loadPendingFromStorage(): PendingSets {
  const empty: PendingSets = {
    sessions: new Set(),
    orderLines: new Set(),
    writeOffs: new Set(),
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      sessions?: string[];
      orderLines?: string[];
      writeOffs?: string[];
    };
    return {
      sessions: new Set(parsed.sessions ?? []),
      orderLines: new Set(parsed.orderLines ?? []),
      writeOffs: new Set(parsed.writeOffs ?? []),
    };
  } catch {
    return empty;
  }
}

function persistPending(sets: PendingSets) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify({
        sessions: [...sets.sessions],
        orderLines: [...sets.orderLines],
        writeOffs: [...sets.writeOffs],
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Session / line / writeOff ids waiting for cloud listener confirmation. */
const pendingIds: PendingSets = loadPendingFromStorage();

const outbox: OpsWrite[][] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let lastError: string | null = null;
const listeners = new Set<(s: OpsSyncStatus, err: string | null) => void>();

function notify(status: OpsSyncStatus) {
  for (const l of listeners) l(status, lastError);
}

export function subscribeOpsSyncStatus(
  listener: (status: OpsSyncStatus, err: string | null) => void,
): () => void {
  listeners.add(listener);
  listener(
    !isFirebaseConfigured()
      ? "local"
      : flushing || outbox.length > 0
        ? "syncing"
        : lastError
          ? "error"
          : "synced",
    lastError,
  );
  return () => {
    listeners.delete(listener);
  };
}

export function getOpsSyncError(): string | null {
  return lastError;
}

function trackPending(writes: OpsWrite[]) {
  for (const w of writes) {
    if (w.kind === "session") pendingIds.sessions.add(w.data.id);
    if (w.kind === "orderLine") pendingIds.orderLines.add(w.data.id);
    if (w.kind === "writeOff") pendingIds.writeOffs.add(w.data.id);
    if (w.kind === "deleteWriteOff") pendingIds.writeOffs.delete(w.id);
    if (w.kind === "deleteOrderLine") pendingIds.orderLines.delete(w.id);
    if (w.kind === "deleteSession") pendingIds.sessions.delete(w.id);
  }
  persistPending(pendingIds);
}

/**
 * Drop create-pending only when there is no cloud to wait for.
 * EN: Clear pending on local-only skip; never on commit success (listener lag).
 */
function clearPendingAfterLocalSkip(writes: OpsWrite[]) {
  for (const w of writes) {
    if (w.kind === "session") pendingIds.sessions.delete(w.data.id);
    if (w.kind === "orderLine") pendingIds.orderLines.delete(w.data.id);
    if (w.kind === "writeOff") pendingIds.writeOffs.delete(w.data.id);
    if (w.kind === "deleteSession") pendingIds.sessions.delete(w.id);
    if (w.kind === "deleteOrderLine") pendingIds.orderLines.delete(w.id);
    if (w.kind === "deleteWriteOff") pendingIds.writeOffs.delete(w.id);
  }
  persistPending(pendingIds);
}

/**
 * MUST: Clear create-pending only after cloud snapshot contains the id.
 * EN: Commit success is not enough — listener may still emit a stale empty snap.
 */
function reconcilePendingFromSnapshot(snap: OpsSnapshot) {
  let changed = false;
  for (const s of snap.sessions) {
    if (pendingIds.sessions.delete(s.id)) changed = true;
  }
  for (const o of snap.orderItems) {
    if (pendingIds.orderLines.delete(o.id)) changed = true;
  }
  for (const w of snap.writeOffs) {
    if (pendingIds.writeOffs.delete(w.id)) changed = true;
  }
  if (changed) persistPending(pendingIds);
}

function shouldKeepLocalOpenSession(s: ServiceSession): boolean {
  if (pendingIds.sessions.has(s.id)) return true;
  const opened = Date.parse(s.openedAt);
  if (Number.isNaN(opened)) return false;
  return Date.now() - opened < OPEN_GRACE_MS;
}

/**
 * Merge cloud ops into state without erasing optimistic open sessions still pending.
 */
export function applyOpsSnapshot(
  prev: PosState,
  snap: OpsSnapshot,
  opts?: { cloudReady: boolean },
): PosState {
  if (!opts?.cloudReady) {
    // Ignore incomplete first paint from racey multi-listener emit.
    return prev;
  }

  reconcilePendingFromSnapshot(snap);

  const cloudOpen = new Map(snap.sessions.map((s) => [s.id, s]));
  const mergedSessions: ServiceSession[] = [...snap.sessions];

  for (const s of prev.sessions) {
    if (s.status !== "open") {
      if (!cloudOpen.has(s.id)) mergedSessions.push(s);
      continue;
    }
    if (cloudOpen.has(s.id)) continue;
    // Keep local open while cloud write is in flight, or briefly after open
    // so a stale empty snapshot / HMR cannot wipe the floor mid-order.
    if (shouldKeepLocalOpenSession(s)) {
      mergedSessions.push(s);
    }
  }

  const openIds = new Set(
    mergedSessions.filter((s) => s.status === "open").map((s) => s.id),
  );

  const lineById = new Map<string, OrderItem>();
  for (const o of snap.orderItems) {
    if (openIds.has(o.sessionId) || pendingIds.orderLines.has(o.id)) {
      lineById.set(o.id, o);
    }
  }
  for (const o of prev.orderItems) {
    if (lineById.has(o.id)) continue;
    if (pendingIds.orderLines.has(o.id)) {
      lineById.set(o.id, o);
      continue;
    }
    if (openIds.has(o.sessionId) && o.status !== "canceled") {
      lineById.set(o.id, o);
    }
  }

  const woById = new Map<string, WriteOff>();
  for (const w of snap.writeOffs) {
    if (openIds.has(w.sessionId) || pendingIds.writeOffs.has(w.id)) {
      woById.set(w.id, w);
    }
  }
  for (const w of prev.writeOffs) {
    if (pendingIds.writeOffs.has(w.id) && !woById.has(w.id)) {
      woById.set(w.id, w);
    } else if (openIds.has(w.sessionId) && !woById.has(w.id)) {
      woById.set(w.id, w);
    }
  }

  return {
    ...prev,
    sessions: mergedSessions,
    orderItems: [...lineById.values()],
    writeOffs: [...woById.values()],
    dailySeqByDate: {
      ...prev.dailySeqByDate,
      ...snap.dailySeqByDate,
    },
  };
}

async function flushOutbox(): Promise<void> {
  if (flushing || !isFirebaseConfigured()) return;
  flushing = true;
  notify("syncing");
  try {
    while (outbox.length > 0) {
      const batch = outbox[0]!;
      let attempt = 0;
      let ok = false;
      let errMsg = "";
      while (attempt < 4 && !ok) {
        attempt += 1;
        try {
          const result = await commitOpsWrites(batch);
          if (result === "skipped_no_firebase") {
            // No listener will confirm — drop pending so local merge is not stuck.
            clearPendingAfterLocalSkip(batch);
            ok = true;
            break;
          }
          // Keep create-pending until applyOpsSnapshot sees the docs in cloud.
          ok = true;
          lastError = null;
        } catch (err) {
          errMsg = err instanceof Error ? err.message : String(err);
          await new Promise((r) => setTimeout(r, 300 * attempt * attempt));
        }
      }
      if (!ok) {
        lastError = errMsg || "クラウド同期に失敗しました";
        notify("error");
        break;
      }
      outbox.shift();
    }
    if (outbox.length === 0 && !lastError) notify("synced");
  } finally {
    flushing = false;
    if (outbox.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushOutbox();
      }, 1500);
    }
  }
}

/** Enqueue ops writes with retry. Never drop silently. */
export async function pushOpsWrites(writes: OpsWrite[]): Promise<void> {
  if (!isFirebaseConfigured() || writes.length === 0) return;
  trackPending(writes);
  outbox.push(writes);
  notify("syncing");
  await flushOutbox();
}

export function seatWritesForSession(
  sessionId: string,
  seatIds: string[],
  active: boolean,
): OpsWrite[] {
  const at = new Date().toISOString();
  return seatIds.map((id) => ({
    kind: "seat" as const,
    data: {
      id,
      activeSessionId: active ? sessionId : null,
      updatedAt: at,
    },
  }));
}

export { makeEvent, sessionSeatIds };
