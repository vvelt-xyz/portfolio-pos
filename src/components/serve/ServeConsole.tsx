"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StaffHeaderActions } from "@/components/layout/StaffHeaderActions";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { LABELS, SESSION_CHANNEL } from "@/constants";
import { SESSION_PALETTE, resolveSessionSeatLabel } from "@/data/floor.seed";
import {
  billableQty,
  writeOffQtyForItem,
  type OrderItem,
  type ServiceSession,
} from "@/domain/types";
import { usePos } from "@/store/pos-store";

function elapsedMinutes(iso: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
}

function isSameLocalDay(iso: string, nowMs: number) {
  const a = new Date(iso);
  const b = new Date(nowMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function destinationOf(
  session: ServiceSession | undefined,
): { label: string; isTakeout: boolean } {
  const isTakeout = session?.channel === "takeout";
  return {
    isTakeout,
    label: isTakeout
      ? SESSION_CHANNEL.takeout
      : resolveSessionSeatLabel(session ?? {}) ||
        session?.seatLabel ||
        LABELS.serve.seatUnknown,
  };
}

function bannerTone(
  session: ServiceSession | undefined,
  openTableSessions: ServiceSession[],
): string {
  if (session?.channel === "takeout") return "bg-amber-400 text-zinc-950";
  const colorIdx = session
    ? openTableSessions.findIndex((s) => s.id === session.id)
    : -1;
  if (colorIdx >= 0) {
    return `${SESSION_PALETTE[colorIdx % SESSION_PALETTE.length].card} text-white`;
  }
  return "bg-zinc-700 text-white";
}

function ServeLine({
  item,
  session,
  openTableSessions,
  timeLabel,
  qtyLabel,
  action,
  onSelect,
}: {
  item: OrderItem;
  session: ServiceSession | undefined;
  openTableSessions: ServiceSession[];
  timeLabel: string;
  qtyLabel: string;
  action?: ReactNode;
  onSelect?: () => void;
}) {
  const { label } = destinationOf(session);
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-2 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            "rounded-lg px-2.5 py-1 text-sm font-semibold",
            bannerTone(session, openTableSessions),
          ].join(" ")}
        >
          {label}
        </span>
        <span className="text-sm text-zinc-500">{timeLabel}</span>
      </div>
      <p
        className={[
          "font-semibold leading-snug text-zinc-900",
          action ? "text-lg" : "text-base",
        ].join(" ")}
      >
        {item.complimentary ? (
          <span className="mr-1.5 inline-block rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold align-middle text-emerald-950">
            {LABELS.order.complimentaryBadge}
          </span>
        ) : null}
        {(item.channel ?? session?.channel) === "takeout" ? (
          <span className="mr-1.5 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold align-middle text-amber-950">
            {LABELS.serve.takeoutBadge}
          </span>
        ) : null}
        {item.productName}
        <span className="ml-2 text-base font-medium text-zinc-600">
          {qtyLabel}
        </span>
      </p>
      {item.memo?.trim() ? (
        <p className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-sm font-medium text-amber-950">
          {item.memo.trim()}
        </p>
      ) : null}
    </div>
  );

  return (
    <li
      className={[
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-stretch sm:justify-between",
        action
          ? "border-zinc-200 bg-white"
          : "border-zinc-200/80 bg-transparent",
      ].join(" ")}
    >
      {onSelect ? (
        <button type="button" className="min-w-0 flex-1" onClick={onSelect}>
          {body}
        </button>
      ) : (
        body
      )}
      {action}
    </li>
  );
}

export function ServeConsole() {
  const {
    ready,
    getPendingItems,
    markServed,
    markAllPendingServed,
    cancelOrder,
    cancelAllPending,
    writeOffServed,
    state,
  } = usePos();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cancelMode, setCancelMode] = useState(false);
  const [writeOffTarget, setWriteOffTarget] = useState<OrderItem | null>(null);
  const [writeOffQty, setWriteOffQty] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const openTableSessions = useMemo(
    () =>
      state.sessions.filter((s) => s.status === "open" && s.channel === "table"),
    [state.sessions],
  );

  const sessionById = useMemo(() => {
    const map = new Map<string, ServiceSession>();
    for (const s of state.sessions) map.set(s.id, s);
    return map;
  }, [state.sessions]);

  if (!ready) {
    return (
      <AppShell
        title={LABELS.serve.title}
        headerRight={<StaffHeaderActions />}
      >
        <p>{LABELS.common.loading}</p>
      </AppShell>
    );
  }

  const pending = getPendingItems().sort(
    (a, b) => new Date(a.orderedAt).getTime() - new Date(b.orderedAt).getTime(),
  );

  const servedToday = state.orderItems
    .filter(
      (o) =>
        o.status === "served" &&
        o.servedAt != null &&
        isSameLocalDay(o.servedAt, nowMs),
    )
    .sort(
      (a, b) =>
        new Date(b.servedAt!).getTime() - new Date(a.servedAt!).getTime(),
    );

  const writeOffMax = writeOffTarget?.qty ?? 0;

  function openWriteOff(item: OrderItem) {
    setWriteOffTarget(item);
    setWriteOffQty(writeOffQtyForItem(state.writeOffs, item.id));
  }

  function confirmWriteOff() {
    if (!writeOffTarget) return;
    const ok = writeOffServed(writeOffTarget.id, writeOffQty);
    if (ok) {
      setWriteOffTarget(null);
      setWriteOffQty(0);
    }
  }

  return (
    <AppShell
      title={LABELS.serve.title}
      headerRight={<StaffHeaderActions />}
    >
      <div className="flex items-center justify-between gap-3">
        {pending.length > 0 ? (
          <button
            type="button"
            className={[
              "min-h-11 rounded-lg px-3 text-sm font-medium",
              cancelMode
                ? "bg-red-600 text-white"
                : "border border-zinc-300 bg-white text-zinc-800",
            ].join(" ")}
            onClick={() =>
              cancelMode ? cancelAllPending() : markAllPendingServed()
            }
          >
            {cancelMode ? LABELS.serve.cancelAll : LABELS.serve.markAll}
          </button>
        ) : (
          <span />
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={cancelMode}
            onChange={(e) => setCancelMode(e.target.checked)}
          />
          {LABELS.serve.cancelMode}
        </label>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-zinc-500">{LABELS.serve.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((o) => {
            const session = sessionById.get(o.sessionId);
            const mins = elapsedMinutes(o.orderedAt, nowMs);
            return (
              <ServeLine
                key={o.id}
                item={o}
                session={session}
                openTableSessions={openTableSessions}
                timeLabel={`${LABELS.serve.elapsed} ${mins}${LABELS.common.minutes}`}
                qtyLabel={`× ${o.qty}${LABELS.serve.qty}`}
                action={
                  <button
                    type="button"
                    className={[
                      "min-h-12 shrink-0 rounded-xl px-4 text-sm text-white sm:min-w-28",
                      cancelMode ? "bg-red-600" : "bg-zinc-900",
                    ].join(" ")}
                    onClick={() =>
                      cancelMode ? cancelOrder(o.id) : markServed(o.id)
                    }
                  >
                    {cancelMode
                      ? LABELS.serve.cancelItem
                      : LABELS.serve.markServed}
                  </button>
                }
              />
            );
          })}
        </ul>
      )}

      <section className="-mx-3 flex flex-col gap-3 rounded-none bg-zinc-200/70 px-3 py-4 sm:-mx-4 sm:px-4">
        <h2 className="text-sm font-semibold text-zinc-700">
          {LABELS.serve.history}
        </h2>
        {servedToday.length === 0 ? (
          <p className="text-sm text-zinc-500">{LABELS.serve.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {servedToday.map((o) => {
              const session = sessionById.get(o.sessionId);
              const mins = elapsedMinutes(o.servedAt!, nowMs);
              const remaining = billableQty(o, state.writeOffs);
              const written = o.qty - remaining;
              const canEditWriteOff = session?.status === "open";
              return (
                <ServeLine
                  key={o.id}
                  item={o}
                  session={session}
                  openTableSessions={openTableSessions}
                  timeLabel={`${mins}${LABELS.common.minutes}${LABELS.serve.servedAgo}`}
                  qtyLabel={
                    written > 0
                      ? `× ${o.qty}${LABELS.serve.qty}（${LABELS.serve.writtenOff}${written} / ${LABELS.serve.writeOffRemaining}${remaining}）`
                      : `× ${o.qty}${LABELS.serve.qty}`
                  }
                  onSelect={
                    canEditWriteOff ? () => openWriteOff(o) : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      {writeOffTarget ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setWriteOffTarget(null)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-semibold text-zinc-900">
                {LABELS.serve.writeOffTitle}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {writeOffTarget.productName}
              </p>
              {writeOffTarget.memo?.trim() ? (
                <p className="mt-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-sm font-medium text-amber-950">
                  {writeOffTarget.memo.trim()}
                </p>
              ) : null}
              <p className="text-xs text-zinc-500">
                {LABELS.serve.writeOffHint}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 text-2xl"
                onClick={() => setWriteOffQty((q) => Math.max(0, q - 1))}
              >
                −
              </button>
              <span className="w-12 text-center text-2xl font-semibold tabular-nums">
                {writeOffQty}
              </span>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-2xl text-white"
                onClick={() =>
                  setWriteOffQty((q) => Math.min(writeOffMax, q + 1))
                }
              >
                +
              </button>
            </div>
            <p className="text-center text-xs text-zinc-500">
              {LABELS.serve.writeOffQty} {LABELS.serve.writeOffRange}
              {writeOffMax}
              {LABELS.serve.qty}（{LABELS.serve.writeOffOrderQty}
              {writeOffMax}
              {LABELS.serve.qty} / {LABELS.serve.writeOffRemaining}
              {writeOffMax - writeOffQty}
              {LABELS.serve.qty}）
            </p>
            <button
              type="button"
              className="min-h-12 rounded-xl bg-zinc-900 text-sm font-medium text-white"
              onClick={confirmWriteOff}
            >
              {LABELS.serve.writeOffConfirm}（{writeOffQty}
              {LABELS.serve.qty}）
            </button>
          </div>
        </OverlayDialog>
      ) : null}
    </AppShell>
  );
}
