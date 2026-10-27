"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckoutScreen } from "@/components/checkout/CheckoutScreen";
import { AppShell } from "@/components/layout/AppShell";
import { StaffHeaderActions } from "@/components/layout/StaffHeaderActions";
import { OrderScreen } from "@/components/order/OrderScreen";
import { SessionTagPicker } from "@/components/session/SessionTagPicker";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { LABELS, ORDER_STATUS, SESSION_CHANNEL } from "@/constants";
import { FloorOpsBoard } from "@/components/floor/FloorOpsBoard";
import {
  SESSION_PALETTE,
  formatSeatLabels,
  resolveSessionSeatLabel,
  totalCapacity,
} from "@/data/floor.seed";
import type { ResolvedFloorSeat } from "@/domain/floor-layout";
import {
  ADULT_AGE_BANDS,
  MINOR_AGE_BANDS,
  emptyGuests,
  guestTotal,
  partyCount,
  setPartyCount,
  type GuestAgeBand,
  type GuestGender,
} from "@/domain/guests";
import type { SessionTagCatalog } from "@/domain/session-tags";
import {
  billableQty,
  sessionSeatIds,
  writeOffQtyForItem,
  type Guests,
  type OrderItem,
  type ServiceSession,
  type WriteOff,
} from "@/domain/types";
import { formatYen } from "@/lib/pricing";
import { useFloor } from "@/store/floor-store";
import { usePos } from "@/store/pos-store";
import { useSessionTags } from "@/store/session-tags-store";

function floorHubPath(view?: "order" | "checkout", sessionId?: string) {
  if (!view || !sessionId) return "/floor";
  const q = new URLSearchParams({ view, session: sessionId });
  return `/floor?${q.toString()}`;
}

function formatStayMinutes(openedAt: string, nowMs: number) {
  return Math.max(
    0,
    Math.floor((nowMs - new Date(openedAt).getTime()) / 60_000),
  );
}

function formatGuestCount(g: Guests | undefined) {
  return `${guestTotal(g)}${LABELS.common.people}`;
}

const TAKEOUT_SUMMARY_MAX = 32;

function formatTakeoutOrderSummary(
  items: {
    productName: string;
    qty: number;
    status: string;
    complimentary?: boolean;
  }[],
): string {
  const active = items.filter((o) => o.status !== "canceled");
  if (active.length === 0) return LABELS.floor.takeoutNoOrders;
  const joined = active
    .map((o) => {
      const name = o.complimentary
        ? `${o.productName}(${LABELS.order.complimentaryBadge})`
        : o.productName;
      return o.qty > 1 ? `${name}×${o.qty}` : name;
    })
    .join("・");
  if (joined.length <= TAKEOUT_SUMMARY_MAX) return joined;
  return `${joined.slice(0, TAKEOUT_SUMMARY_MAX - 1)}…`;
}

function sessionColorIndex(
  sessionId: string,
  openTableSessions: ServiceSession[],
): number {
  const idx = openTableSessions.findIndex((s) => s.id === sessionId);
  return idx < 0 ? 0 : idx % SESSION_PALETTE.length;
}

export function FloorBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubView = searchParams.get("view");
  const hubSessionId = searchParams.get("session");
  const sessionOverlay =
    (hubView === "order" || hubView === "checkout") && hubSessionId
      ? { view: hubView, sessionId: hubSessionId }
      : null;

  const {
    ready,
    state,
    openSessions,
    openTable,
    openTakeout,
    changeSessionSeats,
    getSessionItems,
    updateMemo,
    updateSessionTags,
    updateSessionGuests,
    cancelOpenSession,
    findSessionBySeat,
    opsSyncStatus,
    opsSyncError,
    businessDayPhase,
  } = usePos();
  const { ready: floorReady, catalog: floorCatalog } = useFloor();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [openingTakeout, setOpeningTakeout] = useState(false);
  const [dayGateMessage, setDayGateMessage] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guests>(() => emptyGuests());
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [memoDraft, setMemoDraft] = useState("");
  const { catalog: tagCatalog } = useSessionTags();
  const [nowMs] = useState(() => Date.now());
  const [takeoutHistoryId, setTakeoutHistoryId] = useState<string | null>(null);
  /** Open table session whose seats are being reselected. */
  const [seatEditSessionId, setSeatEditSessionId] = useState<string | null>(
    null,
  );
  const [seatEditConfirmOpen, setSeatEditConfirmOpen] = useState(false);

  const openTableSessions = useMemo(
    () => openSessions.filter((s) => s.channel === "table"),
    [openSessions],
  );

  const sessionBySeat = useMemo(() => {
    const map = new Map<string, ServiceSession>();
    for (const s of openSessions) {
      for (const id of sessionSeatIds(s)) map.set(id, s);
    }
    return map;
  }, [openSessions]);

  const openTakeouts = openSessions.filter((s) => s.channel === "takeout");

  const selectionMode = useMemo(() => {
    if (selectedIds.length === 0) return "empty" as const;
    const sessions = selectedIds.map((id) => sessionBySeat.get(id));
    const occupiedCount = sessions.filter(Boolean).length;
    if (occupiedCount === 0) return "vacant" as const;
    if (occupiedCount === selectedIds.length) {
      const first = sessions[0];
      const same = sessions.every((s) => s && first && s.id === first.id);
      return same ? ("session" as const) : ("mixed" as const);
    }
    return "mixed" as const;
  }, [selectedIds, sessionBySeat]);

  const activeSession =
    selectionMode === "session" ? sessionBySeat.get(selectedIds[0]!) : undefined;

  const seatEditSession = seatEditSessionId
    ? openSessions.find((s) => s.id === seatEditSessionId)
    : undefined;

  function closeHub() {
    router.push(floorHubPath());
  }

  function openHub(view: "order" | "checkout", sessionId: string) {
    clearDraft();
    router.push(floorHubPath(view, sessionId));
  }

  function toggleSeat(seatId: string) {
    if (seatEditSessionId) {
      const holder = findSessionBySeat(seatId);
      if (holder && holder.id !== seatEditSessionId) return;
      setSelectedIds((prev) =>
        prev.includes(seatId)
          ? prev.filter((id) => id !== seatId)
          : [...prev, seatId],
      );
      return;
    }

    setOpeningTakeout(false);
    const session = findSessionBySeat(seatId);
    if (session) {
      setSelectedIds(sessionSeatIds(session));
      setOpening(false);
      setMemoDraft(session.memo ?? "");
      return;
    }
    setSelectedIds((prev) => {
      const prevHadOccupied = prev.some((id) => sessionBySeat.has(id));
      const base = prevHadOccupied ? [] : prev;
      return base.includes(seatId)
        ? base.filter((id) => id !== seatId)
        : [...base, seatId];
    });
    setOpening(false);
    setMemoDraft("");
  }

  function resetGuests() {
    setGuests(emptyGuests());
    setTagIds([]);
  }

  function clearDraft() {
    setSelectedIds([]);
    setOpening(false);
    setOpeningTakeout(false);
    setSeatEditSessionId(null);
    setSeatEditConfirmOpen(false);
    resetGuests();
    setMemoDraft("");
  }

  function beginSeatEdit(session: ServiceSession) {
    setOpening(false);
    setOpeningTakeout(false);
    setSeatEditConfirmOpen(false);
    setSeatEditSessionId(session.id);
    setSelectedIds(sessionSeatIds(session));
    setMemoDraft(session.memo ?? "");
  }

  function cancelSeatEdit() {
    if (seatEditSession) {
      setSelectedIds(sessionSeatIds(seatEditSession));
      setMemoDraft(seatEditSession.memo ?? "");
    }
    setSeatEditSessionId(null);
    setSeatEditConfirmOpen(false);
  }

  function applySeatEdit() {
    if (!seatEditSessionId || selectedIds.length === 0) return;
    void (async () => {
      const ok = await changeSessionSeats(seatEditSessionId, selectedIds);
      if (!ok) return;
      setSeatEditSessionId(null);
      setSeatEditConfirmOpen(false);
      setSelectedIds([...new Set(selectedIds)]);
    })();
  }

  function beginTakeoutDraft() {
    setSelectedIds([]);
    setOpening(false);
    setOpeningTakeout(true);
    setSeatEditSessionId(null);
    setSeatEditConfirmOpen(false);
    resetGuests();
    setMemoDraft("");
  }

  if (!ready) {
    return (
      <AppShell title={LABELS.floor.title} headerRight={<StaffHeaderActions />}>
        <p className="text-sm text-zinc-500">{LABELS.common.loading}</p>
      </AppShell>
    );
  }

  const vacantSelectBar =
    !sessionOverlay &&
    !seatEditSessionId &&
    selectionMode === "vacant" &&
    !opening ? (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">
            {LABELS.floor.selected}: {formatSeatLabels(selectedIds)}
          </p>
          <p className="text-xs text-zinc-500">
            {LABELS.floor.capacityHint} {totalCapacity(selectedIds)}
          </p>
        </div>
        <button
          type="button"
          aria-label={LABELS.floor.clearSelection}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100"
          onClick={clearDraft}
        >
          ×
        </button>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white"
          onClick={() => {
            resetGuests();
            setOpening(true);
          }}
        >
          {LABELS.floor.openTable}
        </button>
      </div>
    ) : null;

  const seatEditBar =
    !sessionOverlay && seatEditSessionId ? (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">
            {LABELS.floor.editSeats}: {formatSeatLabels(selectedIds)}
          </p>
          <p className="text-xs text-zinc-500">
            {selectedIds.length === 0
              ? LABELS.floor.editSeatsNeedOne
              : `${LABELS.floor.capacityHint} ${totalCapacity(selectedIds)}`}
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700"
          onClick={cancelSeatEdit}
        >
          {LABELS.floor.editSeatsCancel}
        </button>
        <button
          type="button"
          disabled={selectedIds.length === 0}
          className="min-h-11 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
          onClick={() => setSeatEditConfirmOpen(true)}
        >
          {LABELS.floor.editSeatsConfirm}
        </button>
      </div>
    ) : null;

  const footerBar = seatEditBar ?? vacantSelectBar;

  const modalPanel = !sessionOverlay
    ? seatEditSessionId
      ? null
      : openingTakeout
      ? (
          <GuestOpenForm
            title={LABELS.floor.takeoutBanner}
            guests={guests}
            tagIds={tagIds}
            tagCatalog={tagCatalog}
            memoDraft={memoDraft}
            confirmLabel={LABELS.floor.confirmTakeout}
            onGuests={setGuests}
            onTagIds={setTagIds}
            onMemo={setMemoDraft}
            onConfirm={() => {
              if (guestTotal(guests) < 1) return;
              if (businessDayPhase !== "open") {
                setDayGateMessage(
                  businessDayPhase === "closed"
                    ? LABELS.floor.businessDayClosedBanner
                    : LABELS.floor.businessDayNotOpenBanner,
                );
                return;
              }
              void (async () => {
                const result = await openTakeout({
                  guests,
                  tagIds,
                  memo: memoDraft,
                });
                if (!result.ok) {
                  setDayGateMessage(
                    result.reason === "business_day_closed"
                      ? LABELS.floor.businessDayClosedBanner
                      : LABELS.floor.businessDayNotOpenBanner,
                  );
                  return;
                }
                setDayGateMessage(null);
                openHub("order", result.session.id);
              })();
            }}
          />
        )
      : selectionMode === "vacant" && opening
        ? (
            <GuestOpenForm
              title={`${formatSeatLabels(selectedIds)} — ${LABELS.floor.openTable}`}
              guests={guests}
              tagIds={tagIds}
              tagCatalog={tagCatalog}
              memoDraft={memoDraft}
              confirmLabel={LABELS.floor.confirmOpen}
              onGuests={setGuests}
              onTagIds={setTagIds}
              onMemo={setMemoDraft}
              onConfirm={() => {
                if (guestTotal(guests) < 1) return;
                if (businessDayPhase !== "open") {
                  setDayGateMessage(
                    businessDayPhase === "closed"
                      ? LABELS.floor.businessDayClosedBanner
                      : LABELS.floor.businessDayNotOpenBanner,
                  );
                  return;
                }
                void (async () => {
                  const result = await openTable({
                    seatIds: selectedIds,
                    guests,
                    tagIds,
                    memo: memoDraft,
                  });
                  if (!result.ok) {
                    setDayGateMessage(
                      result.reason === "business_day_closed"
                        ? LABELS.floor.businessDayClosedBanner
                        : result.reason === "seat_occupied"
                          ? LABELS.floor.seatOccupied
                          : LABELS.floor.businessDayNotOpenBanner,
                    );
                    return;
                  }
                  setDayGateMessage(null);
                  clearDraft();
                })();
              }}
            />
          )
        : selectionMode === "session" || selectionMode === "mixed"
          ? (
              <SelectionPanel
                selectedIds={selectedIds}
                mode={selectionMode}
                session={activeSession}
                colorIdx={
                  activeSession
                    ? sessionColorIndex(activeSession.id, openTableSessions)
                    : 0
                }
                pendingCount={
                  activeSession
                    ? getSessionItems(activeSession.id).filter(
                        (o) => o.status === "pending",
                      ).length
                    : 0
                }
                nowMs={nowMs}
                memoDraft={memoDraft}
                tagCatalog={tagCatalog}
                onSaveMemo={(value) => {
                  if (activeSession) {
                    setMemoDraft(value);
                    updateMemo(activeSession.id, value);
                  }
                }}
                onTagsChange={(ids) => {
                  if (activeSession) {
                    updateSessionTags(activeSession.id, ids);
                  }
                }}
                onEditSeats={() => {
                  if (activeSession && activeSession.channel === "table") {
                    beginSeatEdit(activeSession);
                  }
                }}
                onEditGuests={(guests) => {
                  if (activeSession) {
                    updateSessionGuests(activeSession.id, guests);
                  }
                }}
                onDeleteSession={() => {
                  if (!activeSession) return;
                  if (!window.confirm(LABELS.floor.deleteSessionConfirm)) {
                    return;
                  }
                  void (async () => {
                    if (await cancelOpenSession(activeSession.id)) {
                      clearDraft();
                    }
                  })();
                }}
                onOrder={() => {
                  if (activeSession) openHub("order", activeSession.id);
                }}
                onCheckout={() => {
                  if (activeSession) openHub("checkout", activeSession.id);
                }}
                orderItems={
                  activeSession ? getSessionItems(activeSession.id) : []
                }
                writeOffs={
                  activeSession
                    ? state.writeOffs.filter(
                        (w) => w.sessionId === activeSession.id,
                      )
                    : []
                }
              />
            )
          : null
    : null;

  return (
    <AppShell
      title={LABELS.floor.title}
      headerRight={<StaffHeaderActions />}
      footer={footerBar ?? undefined}
      footerTone={footerBar ? "emphasis" : "default"}
    >
      {opsSyncStatus === "error" ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
          {LABELS.common.syncError}
          {opsSyncError ? `（${opsSyncError}）` : null}
        </div>
      ) : null}
      {opsSyncStatus === "syncing" ? (
        <div className="shrink-0 border-b border-amber-100 bg-amber-50/80 px-4 py-1.5 text-[11px] text-amber-900">
          {LABELS.common.syncing}
        </div>
      ) : null}
      {businessDayPhase !== "open" ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
          {businessDayPhase === "closed"
            ? LABELS.floor.businessDayClosedBanner
            : LABELS.floor.businessDayNotOpenBanner}
        </div>
      ) : null}
      {dayGateMessage ? (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          {dayGateMessage}
        </div>
      ) : null}

      {sessionOverlay?.view === "order" ? (
        <OverlayDialog size="full" tone="white" fillHeight onClose={closeHub}>
          <OrderScreen
            sessionId={sessionOverlay.sessionId}
            onBack={closeHub}
          />
        </OverlayDialog>
      ) : null}

      {sessionOverlay?.view === "checkout" ? (
        <OverlayDialog size="lg" tone="white" onClose={closeHub}>
          <CheckoutScreen
            sessionId={sessionOverlay.sessionId}
            onBack={() =>
              router.push(floorHubPath("order", sessionOverlay.sessionId))
            }
            onDone={closeHub}
          />
        </OverlayDialog>
      ) : null}

      {modalPanel ? (
        <OverlayDialog
          size="md"
          onClose={
            seatEditSessionId
              ? cancelSeatEdit
              : selectionMode === "vacant" && opening
                ? () => {
                    setOpening(false);
                    resetGuests();
                    setMemoDraft("");
                  }
                : clearDraft
          }
        >
          {modalPanel}
        </OverlayDialog>
      ) : null}

      {seatEditConfirmOpen ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setSeatEditConfirmOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <p className="pr-8 font-semibold text-zinc-900">
              {LABELS.floor.editSeatsConfirmTitle}
            </p>
            <p className="text-sm text-zinc-600">
              {LABELS.floor.editSeatsConfirmBody}
            </p>
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900">
              {formatSeatLabels(selectedIds)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-medium"
                onClick={() => setSeatEditConfirmOpen(false)}
              >
                {LABELS.floor.cancel}
              </button>
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl bg-zinc-900 text-sm font-medium text-white"
                onClick={applySeatEdit}
              >
                {LABELS.floor.editSeatsApply}
              </button>
            </div>
          </div>
        </OverlayDialog>
      ) : null}

      <div className="flex justify-end">
        <div className="max-w-[13rem] text-right text-[10px] leading-snug text-zinc-400 sm:max-w-[16rem]">
          <p>{LABELS.floor.multiHint}</p>
        </div>
      </div>

      {seatEditSessionId ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-zinc-900">
            {LABELS.floor.editSeats}
            {seatEditSession
              ? ` · ${resolveSessionSeatLabel(seatEditSession)}`
              : null}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            {LABELS.floor.editSeatsHint}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {floorReady ? (
          <FloorOpsBoard
            catalog={floorCatalog}
            renderSeat={(seat) => {
              const session = sessionBySeat.get(seat.id);
              const selected = selectedIds.includes(seat.id);
              const pending = session
                ? getSessionItems(session.id).filter(
                    (o) => o.status === "pending",
                  ).length
                : 0;
              const colorIdx = session
                ? sessionColorIndex(session.id, openTableSessions)
                : 0;
              const blocked =
                Boolean(seatEditSessionId) &&
                Boolean(session) &&
                session!.id !== seatEditSessionId;
              return (
                <SeatCard
                  seat={seat}
                  session={session}
                  pendingCount={pending}
                  selected={selected}
                  colorIdx={colorIdx}
                  nowMs={nowMs}
                  blocked={blocked}
                  onToggle={() => toggleSeat(seat.id)}
                />
              );
            }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">
            {LABELS.common.loading}
          </p>
        )}

        <div
          className="grid w-full gap-2 px-3 sm:px-4"
          style={{
            gridTemplateColumns: `repeat(${floorCatalog.gridCols}, minmax(0, 1fr))`,
          }}
        >
          <button
            type="button"
            style={{
              gridColumn: `${Math.max(1, floorCatalog.gridCols - Math.max(1, Math.round(floorCatalog.gridCols / 6)) + 1)} / -1`,
            }}
            disabled={Boolean(seatEditSessionId)}
            className={[
              "relative flex h-[3.5rem] min-h-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50 px-1.5 text-center text-xs font-semibold text-amber-950 shadow-sm active:scale-[0.98] sm:text-sm",
              openingTakeout
                ? "z-10 outline outline-[3px] outline-offset-2 outline-amber-300 ring-4 ring-amber-200/60"
                : "",
              seatEditSessionId ? "cursor-not-allowed opacity-40" : "",
            ].join(" ")}
            onClick={beginTakeoutDraft}
          >
            <span className="leading-tight">{LABELS.floor.takeoutBanner}</span>
            {openTakeouts.length > 0 ? (
              <span className="mt-0.5 text-[10px] font-bold text-amber-800/80">
                {openTakeouts.length}
              </span>
            ) : (
              <span className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight text-amber-800/70">
                {LABELS.floor.takeoutStart}
              </span>
            )}
          </button>
        </div>
      </div>

      {openTakeouts.length > 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-800/90">
            {SESSION_CHANNEL.takeout}
          </p>
          <ul className="flex flex-col gap-2">
            {openTakeouts.map((s) => {
              const items = getSessionItems(s.id);
              const pending = items.filter((o) => o.status === "pending").length;
              const summary = formatTakeoutOrderSummary(items);
              return (
                <li
                  key={s.id}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-amber-100/80 bg-white/90 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-900/80">
                      {formatGuestCount(s.guests)}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-zinc-800"
                      title={summary}
                    >
                      {summary}
                    </span>
                    {pending > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        {LABELS.floor.pendingBadge}
                        {pending}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className="flex h-10 items-center rounded-lg bg-zinc-900 px-2.5 text-white"
                      onClick={() => openHub("order", s.id)}
                    >
                      {LABELS.floor.order}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 items-center rounded-lg border border-zinc-300 px-2.5"
                      onClick={() => setTakeoutHistoryId(s.id)}
                    >
                      {LABELS.floor.history}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 items-center rounded-lg border border-zinc-300 px-2.5"
                      onClick={() => openHub("checkout", s.id)}
                    >
                      {LABELS.floor.checkout}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {takeoutHistoryId ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setTakeoutHistoryId(null)}
        >
          <SessionHistoryPanel
            title={`${SESSION_CHANNEL.takeout} · ${LABELS.floor.historyTitle}`}
            items={getSessionItems(takeoutHistoryId)
              .filter((o) => o.status === "pending" || o.status === "served")
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.orderedAt).getTime() -
                  new Date(a.orderedAt).getTime(),
              )}
            writeOffs={state.writeOffs.filter(
              (w) => w.sessionId === takeoutHistoryId,
            )}
          />
        </OverlayDialog>
      ) : null}

      {openTableSessions.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {openTableSessions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${SESSION_PALETTE[i % SESSION_PALETTE.length].chip}`}
                onClick={() => {
                  setSelectedIds(sessionSeatIds(s));
                  setMemoDraft(s.memo ?? "");
                  setOpening(false);
                }}
              >
                {resolveSessionSeatLabel(s)} · {formatGuestCount(s.guests)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}

function SeatCard({
  seat,
  session,
  pendingCount,
  selected,
  colorIdx,
  nowMs,
  blocked = false,
  onToggle,
}: {
  seat: ResolvedFloorSeat;
  session?: ServiceSession;
  pendingCount: number;
  selected: boolean;
  colorIdx: number;
  nowMs: number;
  blocked?: boolean;
  onToggle: () => void;
}) {
  const occupied = Boolean(session);
  const palette = SESSION_PALETTE[colorIdx % SESSION_PALETTE.length];
  const tone = occupied ? palette.card : "bg-zinc-300 text-zinc-700";
  /**
   * Table vs bar scale (deploy): larger footprint → text-sm, else text-xs.
   * Default tables are 12 wide on 48-col grid.
   */
  const isLarge = seat.bounds.width >= 10;
  const labelClass = isLarge
    ? "text-sm font-semibold sm:text-base md:text-lg"
    : "text-xs font-semibold sm:text-sm md:text-base";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={blocked}
      className={[
        "relative flex h-full w-full min-h-0 flex-col items-center justify-center overflow-hidden rounded-lg px-1.5 sm:px-2 text-center shadow-sm active:scale-[0.98]",
        tone,
        occupied ? "text-white" : "",
        labelClass,
        selected
          ? "z-10 outline outline-[3px] outline-offset-2 outline-amber-400 ring-4 ring-amber-300/60"
          : "",
        blocked ? "cursor-not-allowed opacity-40 active:scale-100" : "",
      ].join(" ")}
    >
      {pendingCount > 0 ? (
        <span className="absolute top-1 right-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-zinc-950 sm:text-[11px]">
          {LABELS.floor.pendingBadge}
          {pendingCount}
        </span>
      ) : null}
      <span className="max-w-full truncate leading-tight">
        {seat.categoryName}
        {seat.number}
      </span>
      {session ? (
        <span className="mt-0.5 max-w-full truncate text-[10px] font-normal leading-tight opacity-95 sm:text-xs">
          {formatGuestCount(session.guests)} ·{" "}
          {formatStayMinutes(session.openedAt, nowMs)}
          {LABELS.common.minutes}
        </span>
      ) : (
        <span className="mt-0.5 text-[10px] font-normal opacity-80 sm:text-xs">
          {LABELS.floor.vacant}
        </span>
      )}
    </button>
  );
}

function SelectionPanel({
  selectedIds,
  mode,
  session,
  colorIdx,
  pendingCount,
  nowMs,
  memoDraft,
  tagCatalog,
  onSaveMemo,
  onTagsChange,
  onEditSeats,
  onEditGuests,
  onDeleteSession,
  onOrder,
  onCheckout,
  orderItems,
  writeOffs,
}: {
  selectedIds: string[];
  mode: "session" | "mixed";
  session?: ServiceSession;
  colorIdx: number;
  pendingCount: number;
  nowMs: number;
  memoDraft: string;
  tagCatalog: SessionTagCatalog;
  onSaveMemo: (value: string) => void;
  onTagsChange: (ids: string[]) => void;
  onEditSeats: () => void;
  onEditGuests: (guests: Guests) => void;
  onDeleteSession: () => void;
  onOrder: () => void;
  onCheckout: () => void;
  orderItems: OrderItem[];
  writeOffs: WriteOff[];
}) {
  const [memoOpen, setMemoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [memoLocal, setMemoLocal] = useState(memoDraft);
  const [guestsLocal, setGuestsLocal] = useState<Guests>(() => emptyGuests());
  const label = formatSeatLabels(selectedIds);
  const chip = SESSION_PALETTE[colorIdx % SESSION_PALETTE.length].chip;

  if (mode === "mixed") {
    return (
      <p className="pr-2 text-sm text-amber-800">{LABELS.floor.mixedSelection}</p>
    );
  }

  if (!session) return null;

  const historyItems = orderItems
    .filter((o) => o.status === "pending" || o.status === "served")
    .slice()
    .sort(
      (a, b) =>
        new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
    );

  const canDeleteSession =
    historyItems.length === 0 && writeOffs.length === 0;

  function openMemoEditor() {
    setMemoLocal(memoDraft);
    setMemoOpen(true);
  }

  function openGuestsEditor() {
    if (!session) return;
    setGuestsLocal(session.guests ?? emptyGuests());
    setGuestsOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-2.5">
          <p className="text-base font-semibold text-zinc-900">
            <span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${chip}`}>
              {formatGuestCount(session.guests)}
            </span>
            {label}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-zinc-600">
            {pendingCount > 0 ? (
              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
                {LABELS.floor.pendingBadge}
                {pendingCount}
              </span>
            ) : null}
            <span>
              {formatStayMinutes(session.openedAt, nowMs)}
              {LABELS.common.minutes}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="flex min-h-14 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white sm:text-base"
            onClick={onOrder}
          >
            {LABELS.floor.order}
          </button>
          <button
            type="button"
            className="flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-900 sm:text-base"
            onClick={() => setHistoryOpen(true)}
          >
            {LABELS.floor.history}
          </button>
          <button
            type="button"
            className="flex min-h-14 items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-900 sm:text-base"
            onClick={onCheckout}
          >
            {LABELS.floor.checkout}
          </button>
        </div>

        <SessionTagPicker
          catalog={tagCatalog}
          selectedIds={session.tagIds ?? []}
          onChange={onTagsChange}
        />

        <button
          type="button"
          onClick={openMemoEditor}
          className="min-h-[4.5rem] w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-left"
        >
          <span className="text-xs font-medium text-zinc-500">
            {LABELS.floor.memo}
          </span>
          <p
            className={[
              "mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-snug",
              memoDraft.trim() ? "text-zinc-900" : "text-zinc-400",
            ].join(" ")}
          >
            {memoDraft.trim() || LABELS.floor.memoEmpty}
          </p>
        </button>

        {session.channel === "table" ? (
          <button
            type="button"
            onClick={onEditSeats}
            className="min-h-10 w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-700"
          >
            {LABELS.floor.editSeats}
          </button>
        ) : null}

        <button
          type="button"
          onClick={openGuestsEditor}
          className="min-h-10 w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-700"
        >
          {LABELS.floor.editGuests}
        </button>

        {canDeleteSession ? (
          <button
            type="button"
            onClick={onDeleteSession}
            className="min-h-10 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-800"
          >
            {LABELS.floor.deleteSession}
          </button>
        ) : null}
      </div>

      {historyOpen ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setHistoryOpen(false)}
        >
          <SessionHistoryPanel
            title={`${label} · ${LABELS.floor.historyTitle}`}
            items={historyItems}
            writeOffs={writeOffs}
          />
        </OverlayDialog>
      ) : null}

      {memoOpen ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setMemoOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <p className="pr-8 font-semibold text-zinc-900">
              {LABELS.floor.memoEdit}
            </p>
            <textarea
              className="min-h-40 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400"
              value={memoLocal}
              placeholder={LABELS.floor.memoPlaceholder}
              autoFocus
              onChange={(e) => setMemoLocal(e.target.value)}
            />
            <button
              type="button"
              className="min-h-12 rounded-xl bg-zinc-900 text-sm font-medium text-white"
              onClick={() => {
                onSaveMemo(memoLocal);
                setMemoOpen(false);
              }}
            >
              {LABELS.floor.memoDone}
            </button>
          </div>
        </OverlayDialog>
      ) : null}

      {guestsOpen ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setGuestsOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <p className="pr-8 font-semibold text-zinc-900">
              {LABELS.floor.editGuestsTitle}
            </p>
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <GuestAgeBandRows
                bands={ADULT_AGE_BANDS}
                guests={guestsLocal}
                onGuests={setGuestsLocal}
              />
              <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/80 open:bg-white">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-800 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    <span>{LABELS.guests.minors}</span>
                    <span className="text-xs font-normal text-zinc-500 tabular-nums">
                      {MINOR_AGE_BANDS.reduce(
                        (sum, band) =>
                          sum +
                          partyCount(guestsLocal, "male", band) +
                          partyCount(guestsLocal, "female", band),
                        0,
                      )}
                      {LABELS.common.people}
                    </span>
                  </span>
                </summary>
                <div className="border-t border-zinc-200 px-3 py-3">
                  <GuestAgeBandRows
                    bands={MINOR_AGE_BANDS}
                    guests={guestsLocal}
                    onGuests={setGuestsLocal}
                  />
                </div>
              </details>
            </div>
            {guestTotal(guestsLocal) < 1 ? (
              <p className="text-sm text-amber-800">
                {LABELS.floor.editGuestsNeedOne}
              </p>
            ) : null}
            <button
              type="button"
              disabled={guestTotal(guestsLocal) < 1}
              className="min-h-12 rounded-xl bg-zinc-900 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => {
                if (guestTotal(guestsLocal) < 1) return;
                onEditGuests(guestsLocal);
                setGuestsOpen(false);
              }}
            >
              {LABELS.floor.editGuestsSave}
            </button>
          </div>
        </OverlayDialog>
      ) : null}
    </>
  );
}

function SessionHistoryPanel({
  title,
  items,
  writeOffs,
}: {
  title: string;
  items: OrderItem[];
  writeOffs: WriteOff[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="pr-8 font-semibold text-zinc-900">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{LABELS.floor.historyEmpty}</p>
      ) : (
        <ul className="flex max-h-[min(60dvh,24rem)] flex-col gap-2 overflow-y-auto">
          {items.map((o) => {
            const written = writeOffQtyForItem(writeOffs, o.id);
            const remain = billableQty(o, writeOffs);
            return (
              <li
                key={o.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">
                    {o.complimentary ? (
                      <span className="mr-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                        {LABELS.order.complimentaryBadge}
                      </span>
                    ) : null}
                    {o.channel === "takeout" ? (
                      <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {LABELS.order.takeoutBadge}
                      </span>
                    ) : null}
                    {o.productName}
                  </p>
                  {o.memo?.trim() ? (
                    <p className="mt-0.5 text-xs font-medium text-amber-800">
                      {o.memo.trim()}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    × {o.qty}
                    {written > 0 ? (
                      <span className="ml-2">
                        {LABELS.floor.historyWrittenOff}
                        {written}
                        {remain > 0
                          ? ` / ${LABELS.floor.historyRemaining}${remain}`
                          : ""}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      o.status === "pending"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-zinc-100 text-zinc-600",
                    ].join(" ")}
                  >
                    {ORDER_STATUS[o.status]}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {formatYen(o.unitPriceTaxIncluded * remain)}
                    {o.complimentary &&
                    o.listUnitPriceTaxIncluded != null &&
                    o.listUnitPriceTaxIncluded > 0 ? (
                      <span className="mt-0.5 block text-right line-through text-zinc-400">
                        {formatYen(o.listUnitPriceTaxIncluded * remain)}
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GuestStepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label} −`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-xl leading-none text-zinc-800 active:bg-zinc-100"
        onClick={onDec}
      >
        −
      </button>
      <span className="w-7 text-center text-base font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} +`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xl leading-none font-semibold text-white active:bg-zinc-800"
        onClick={onInc}
      >
        +
      </button>
    </div>
  );
}

function GuestAgeBandRows({
  bands,
  guests,
  onGuests,
}: {
  bands: GuestAgeBand[];
  guests: Guests;
  onGuests: (g: Guests) => void;
}) {
  const genders: GuestGender[] = ["male", "female"];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-0.5 text-[11px] text-zinc-500">
        <span />
        <span className="w-[7.25rem] text-center">{LABELS.guests.male}</span>
        <span className="w-[7.25rem] text-center">{LABELS.guests.female}</span>
      </div>
      {bands.map((band) => (
        <div
          key={band}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 text-sm text-zinc-900"
        >
          <span className="truncate font-medium">
            {LABELS.guests.ageBand[band]}
          </span>
          {genders.map((gender) => {
            const count = partyCount(guests, gender, band);
            const cellLabel = `${LABELS.guests[gender]} ${LABELS.guests.ageBand[band]}`;
            return (
              <GuestStepper
                key={gender}
                label={cellLabel}
                value={count}
                onDec={() =>
                  onGuests(setPartyCount(guests, gender, band, count - 1))
                }
                onInc={() =>
                  onGuests(setPartyCount(guests, gender, band, count + 1))
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GuestOpenForm({
  title,
  guests,
  tagIds,
  tagCatalog,
  memoDraft,
  confirmLabel,
  onGuests,
  onTagIds,
  onMemo,
  onConfirm,
}: {
  title: string;
  guests: Guests;
  tagIds: string[];
  tagCatalog: SessionTagCatalog;
  memoDraft: string;
  confirmLabel: string;
  onGuests: (g: Guests) => void;
  onTagIds: (ids: string[]) => void;
  onMemo: (v: string) => void;
  onConfirm: () => void;
}) {
  const minorTotal = MINOR_AGE_BANDS.reduce(
    (sum, band) =>
      sum +
      partyCount(guests, "male", band) +
      partyCount(guests, "female", band),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-3">
        <p className="mb-3 text-xs text-zinc-500">{LABELS.floor.guestsTitle}</p>

        <GuestAgeBandRows
          bands={ADULT_AGE_BANDS}
          guests={guests}
          onGuests={onGuests}
        />

        <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/80 open:bg-white">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-800 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              <span>{LABELS.guests.minors}</span>
              <span className="text-xs font-normal text-zinc-500 tabular-nums">
                {minorTotal}
                {LABELS.common.people}
              </span>
            </span>
          </summary>
          <div className="border-t border-zinc-200 px-3 py-3">
            <GuestAgeBandRows
              bands={MINOR_AGE_BANDS}
              guests={guests}
              onGuests={onGuests}
            />
          </div>
        </details>

        <div className="mt-3">
          <SessionTagPicker
            catalog={tagCatalog}
            selectedIds={tagIds}
            onChange={onTagIds}
          />
        </div>

        <p className="mt-3 text-center text-xs text-zinc-500">
          {LABELS.floor.capacityHint}: {guestTotal(guests)}
          {LABELS.common.people}
        </p>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-600">{LABELS.floor.memo}</span>
        <input
          className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-zinc-900 placeholder:text-zinc-400"
          value={memoDraft}
          placeholder={LABELS.floor.memoPlaceholder}
          onChange={(e) => onMemo(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="min-h-12 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white disabled:opacity-40"
        disabled={guestTotal(guests) < 1}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
