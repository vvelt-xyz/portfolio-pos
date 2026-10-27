"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StaffHeaderActions } from "@/components/layout/StaffHeaderActions";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { LABELS, PAYMENT_METHODS } from "@/constants";
import {
  buildBusinessDayOpen,
  buildBusinessDaySummary,
  phaseOfBusinessDay,
  previewBusinessDayTotals,
  type BusinessDayClose,
  type BusinessDayDoc,
} from "@/domain/business-day";
import {
  loadBusinessDayDoc,
  writeBusinessDayClose,
  writeBusinessDayOpen,
} from "@/lib/firebase/business-day";
import {
  businessDateKey,
  formatBusinessDateLabel,
} from "@/lib/ids";
import { formatYen } from "@/lib/pricing";
import {
  buildSalesLinesCsv,
  buildSalesSummaryCsv,
  downloadTextFile,
} from "@/lib/sales-export";
import { makeEvent, pushOpsWrites } from "@/lib/pos-cloud-bridge";
import { usePos } from "@/store/pos-store";
import { useSettings } from "@/store/settings-store";

export function AdminScreen() {
  const {
    ready,
    todaySales,
    settledSales,
    openSessions,
    refreshBusinessDay,
  } = usePos();
  const { policy } = useSettings();

  const [dayDoc, setDayDoc] = useState<BusinessDayDoc | null>(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [statusByDate, setStatusByDate] = useState<{
    date: string;
    message: string;
  } | null>(null);

  const today = businessDateKey();
  const cutoffHour = policy.businessDayCutoffHour;
  const phase = phaseOfBusinessDay(dayDoc);
  const statusMessage =
    statusByDate?.date === today ? statusByDate.message : null;

  function setStatusMessage(message: string | null) {
    setStatusByDate(message ? { date: today, message } : null);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDayLoading(true);
      const doc = await loadBusinessDayDoc(today);
      if (!cancelled) {
        setDayDoc(doc);
        setDayLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const productAgg = useMemo(() => {
    const map = new Map<
      string,
      { name: string; channel: "table" | "takeout"; qty: number; amount: number; complimentary: boolean }
    >();
    for (const sale of todaySales) {
      for (const line of sale.lines) {
        const channel = line.channel ?? sale.channel;
        const complimentary = line.complimentary === true;
        const key = `${line.productId}:${channel}:${complimentary ? "free" : "paid"}`;
        const cur = map.get(key) ?? {
          name: line.productName,
          channel,
          qty: 0,
          amount: 0,
          complimentary,
        };
        const signedQty =
          sale.kind === "reverse" ? -line.qty : line.qty;
        cur.qty += signedQty;
        cur.amount += line.lineTaxIncluded;
        map.set(key, cur);
      }
    }
    return [...map.values()]
      .filter((p) => p.qty !== 0 || p.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
  }, [todaySales]);

  const taxAgg = useMemo(() => {
    const map = new Map<
      string,
      { taxRate: number; taxExcluded: number; taxAmount: number; taxIncluded: number }
    >();
    for (const sale of todaySales) {
      const buckets =
        sale.taxBreakdown && sale.taxBreakdown.length > 0
          ? sale.taxBreakdown
          : [];
      for (const b of buckets) {
        const key = String(b.taxRate);
        const cur = map.get(key) ?? {
          taxRate: b.taxRate,
          taxExcluded: 0,
          taxAmount: 0,
          taxIncluded: 0,
        };
        cur.taxExcluded += b.taxExcluded;
        cur.taxAmount += b.taxAmount;
        cur.taxIncluded += b.taxIncluded;
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.taxRate - a.taxRate);
  }, [todaySales]);

  const total = todaySales.reduce((s, x) => s + x.totalTaxIncluded, 0);
  const serviceDiscountTotal = todaySales.reduce(
    (s, x) => s + (x.serviceDiscount?.amountTaxIncluded ?? 0),
    0,
  );
  const writeOffLossTotal = todaySales.reduce(
    (s, x) => s + (x.writeOffTotalTaxIncluded ?? 0),
    0,
  );

  const todaySalesNewestFirst = useMemo(
    () =>
      [...todaySales].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [todaySales],
  );

  const preview = useMemo(
    () => previewBusinessDayTotals(today, todaySales, cutoffHour),
    [today, todaySales, cutoffHour],
  );

  const closedDoc: BusinessDayClose | null =
    dayDoc?.status === "closed" ? dayDoc : null;

  async function syncPhase(doc: BusinessDayDoc | null) {
    setDayDoc(doc);
    await refreshBusinessDay();
  }

  async function startBusinessDay() {
    setOpening(true);
    setStatusMessage(null);
    const open = buildBusinessDayOpen(today, cutoffHour);
    try {
      const result = await writeBusinessDayOpen(open);
      if (result === "closed") {
        setStatusMessage(LABELS.admin.businessDayOpenWhenClosed);
        const existing = await loadBusinessDayDoc(today);
        await syncPhase(existing);
      } else if (result === "exists") {
        setStatusMessage(LABELS.admin.businessDayOpenExists);
        const existing = await loadBusinessDayDoc(today);
        await syncPhase(existing);
      } else {
        await syncPhase(open);
        setStatusMessage(LABELS.admin.businessDayOpenDone);
        void pushOpsWrites([
          {
            kind: "event",
            data: makeEvent("day.opened", {
              businessDate: today,
              payload: { cutoffHour },
            }),
          },
        ]);
      }
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : LABELS.common.error,
      );
    }
    setOpening(false);
  }

  function openCloseConfirm() {
    setStatusMessage(null);
    if (openSessions.length > 0) {
      setStatusMessage(LABELS.admin.businessDayOpenSessionsWarn);
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmCloseDay() {
    setClosing(true);
    setStatusMessage(null);
    const openedAt =
      dayDoc?.status === "open"
        ? dayDoc.openedAt
        : new Date().toISOString();
    const summary = buildBusinessDaySummary(
      today,
      todaySales,
      cutoffHour,
      openedAt,
    );
    try {
      const result = await writeBusinessDayClose(summary);
      if (result === "exists") {
        setStatusMessage(LABELS.admin.businessDayCloseExists);
        const existing = await loadBusinessDayDoc(today);
        await syncPhase(existing);
      } else if (result === "not_open") {
        setStatusMessage(LABELS.admin.businessDayCloseNotOpen);
        const existing = await loadBusinessDayDoc(today);
        await syncPhase(existing);
      } else {
        await syncPhase(summary);
        setStatusMessage(LABELS.admin.businessDayCloseDone);
        void pushOpsWrites([
          {
            kind: "event",
            data: makeEvent("day.closed", {
              businessDate: today,
              payload: {
                saleCount: summary.saleCount,
                totalTaxIncluded: summary.totalTaxIncluded,
              },
            }),
          },
        ]);
      }
      setConfirmOpen(false);
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : LABELS.common.error,
      );
    }
    setClosing(false);
  }

  if (!ready) {
    return (
      <AppShell title={LABELS.admin.title} headerRight={<StaffHeaderActions />}>
        <p>{LABELS.common.loading}</p>
      </AppShell>
    );
  }

  const phaseLabel =
    phase === "open"
      ? LABELS.admin.businessDayOpenHint
      : phase === "closed"
        ? LABELS.admin.businessDayClosedHint
        : LABELS.admin.businessDayNotStartedHint;

  return (
    <AppShell title={LABELS.admin.title} headerRight={<StaffHeaderActions />}>
      <p className="text-xs text-zinc-500">{LABELS.admin.exportHint}</p>
      <p className="text-xs text-zinc-600">
        {LABELS.admin.businessDate}:{" "}
        <span className="font-semibold tabular-nums">
          {formatBusinessDateLabel(today)}
        </span>
        {" · "}
        {LABELS.admin.businessDayCutoffNote} {cutoffHour}時
        {phase === "closed" ? (
          <span className="ml-2 font-medium text-emerald-700">
            {LABELS.admin.businessDayAlreadyClosed}
          </span>
        ) : null}
        {phase === "open" ? (
          <span className="ml-2 font-medium text-sky-700">
            {LABELS.admin.businessDayPhaseOpen}
          </span>
        ) : null}
        {phase === "not_started" ? (
          <span className="ml-2 font-medium text-amber-700">
            {LABELS.admin.businessDayPhaseNotStarted}
          </span>
        ) : null}
      </p>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {LABELS.admin.businessDaySection}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{phaseLabel}</p>
          </div>
          {!dayLoading && phase === "not_started" ? (
            <button
              type="button"
              className="min-h-10 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
              disabled={opening}
              onClick={() => void startBusinessDay()}
            >
              {opening
                ? LABELS.admin.businessDayOpening
                : LABELS.admin.businessDayOpenAction}
            </button>
          ) : null}
          {!dayLoading && phase === "open" ? (
            <button
              type="button"
              className="min-h-10 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
              onClick={openCloseConfirm}
            >
              {LABELS.admin.businessDayCloseAction}
            </button>
          ) : null}
        </div>
        {dayLoading ? (
          <p className="text-xs text-zinc-400">{LABELS.common.loading}</p>
        ) : closedDoc ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-zinc-500">
                {LABELS.admin.businessDaySaleCount}
              </dt>
              <dd className="font-medium tabular-nums">{closedDoc.saleCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">
                {LABELS.admin.businessDayTotal}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatYen(closedDoc.totalTaxIncluded)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">
                {LABELS.admin.businessDayOpenedAt}
              </dt>
              <dd className="text-xs tabular-nums text-zinc-700">
                {new Date(closedDoc.openedAt).toLocaleString("ja-JP")}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">
                {LABELS.admin.businessDayClosedAt}
              </dt>
              <dd className="text-xs tabular-nums text-zinc-700">
                {new Date(closedDoc.closedAt).toLocaleString("ja-JP")}
              </dd>
            </div>
          </dl>
        ) : dayDoc?.status === "open" ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-zinc-500">
                {LABELS.admin.businessDayOpenedAt}
              </dt>
              <dd className="text-xs tabular-nums text-zinc-700">
                {new Date(dayDoc.openedAt).toLocaleString("ja-JP")}
              </dd>
            </div>
          </dl>
        ) : null}
        {statusMessage ? (
          <p className="text-sm text-amber-800">{statusMessage}</p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          disabled={todaySales.length === 0}
          onClick={() =>
            downloadTextFile(
              `sales-lines-${today}.csv`,
              buildSalesLinesCsv(todaySales),
            )
          }
        >
          {LABELS.admin.exportTodayLines}
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          disabled={todaySales.length === 0}
          onClick={() =>
            downloadTextFile(
              `sales-summary-${today}.csv`,
              buildSalesSummaryCsv(todaySales),
            )
          }
        >
          {LABELS.admin.exportTodaySummary}
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-950"
          disabled={settledSales.length === 0}
          onClick={() =>
            downloadTextFile(
              `sales-lines-all-${today}.csv`,
              buildSalesLinesCsv(settledSales),
            )
          }
        >
          {LABELS.admin.exportAllLines}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">{LABELS.admin.salesCount}</p>
          <p className="text-3xl font-semibold">
            {todaySales.filter((s) => s.kind !== "reverse").length}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">{LABELS.admin.salesTotal}</p>
          <p className="text-xl font-semibold leading-tight sm:text-2xl">
            {formatYen(total)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">
            {LABELS.admin.serviceDiscountTotal}
          </p>
          <p className="text-lg font-semibold">{formatYen(serviceDiscountTotal)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">{LABELS.admin.writeOffLossTotal}</p>
          <p className="text-lg font-semibold">{formatYen(writeOffLossTotal)}</p>
        </div>
      </div>

      {todaySales.length === 0 ? (
        <p className="text-sm text-zinc-500">{LABELS.admin.empty}</p>
      ) : (
        <>
          {taxAgg.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold">
                {LABELS.admin.byTaxRate}
              </h2>
              <ul className="flex flex-col gap-2 text-sm">
                {taxAgg.map((b) => (
                  <li
                    key={b.taxRate}
                    className="flex flex-col gap-0.5 border-b border-zinc-50 pb-2 sm:flex-row sm:justify-between"
                  >
                    <span>{Math.round(b.taxRate * 100)}%</span>
                    <span className="tabular-nums text-zinc-600">
                      税抜 {formatYen(b.taxExcluded)} · 税額{" "}
                      {formatYen(b.taxAmount)} · 税込 {formatYen(b.taxIncluded)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">{LABELS.admin.byProduct}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {productAgg.map((p) => (
                <li
                  key={`${p.name}:${p.channel}:${p.complimentary ? "free" : "paid"}`}
                  className="flex justify-between gap-2"
                >
                  <span className="min-w-0">
                    {p.complimentary ? (
                      <span className="mr-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                        {LABELS.order.complimentaryBadge}
                      </span>
                    ) : null}
                    {p.channel === "takeout" ? (
                      <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {LABELS.order.takeoutBadge}
                      </span>
                    ) : null}
                    {p.name} × {p.qty}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatYen(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">{LABELS.admin.bySale}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {todaySalesNewestFirst.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-0.5 border-b border-zinc-50 pb-2 sm:flex-row sm:justify-between"
                >
                  <span>
                    {s.kind === "reverse" ? (
                      <span className="mr-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-900">
                        {LABELS.reverse.reverseBadge}
                      </span>
                    ) : null}
                    <span className="font-mono text-xs">{s.sessionNo}</span>
                    {s.seatLabel ? ` · ${s.seatLabel}` : " · TO"} ·{" "}
                    {PAYMENT_METHODS[s.method]}
                  </span>
                  <span
                    className={[
                      "font-medium tabular-nums",
                      s.kind === "reverse" ? "text-rose-700" : "",
                    ].join(" ")}
                  >
                    {formatYen(s.totalTaxIncluded)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {confirmOpen ? (
        <OverlayDialog
          tone="white"
          onClose={() => {
            if (!closing) setConfirmOpen(false);
          }}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="min-h-10 rounded-lg border border-zinc-300 px-4 text-sm"
                disabled={closing}
                onClick={() => setConfirmOpen(false)}
              >
                {LABELS.admin.businessDayCloseCancel}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={closing}
                onClick={() => void confirmCloseDay()}
              >
                {closing
                  ? LABELS.admin.businessDayClosing
                  : LABELS.admin.businessDayCloseConfirm}
              </button>
            </div>
          }
        >
          <div className="space-y-3 pr-2">
            <h2 className="text-base font-semibold text-zinc-900">
              {LABELS.admin.businessDayCloseConfirmTitle}
            </h2>
            <p className="text-sm text-zinc-600">
              {LABELS.admin.businessDayCloseConfirmBody}
            </p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.admin.businessDate}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatBusinessDateLabel(today)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.admin.businessDayCutoffNote}
                </dt>
                <dd className="font-medium">{cutoffHour}時</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.admin.businessDaySaleCount}
                </dt>
                <dd className="font-medium tabular-nums">{preview.saleCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.admin.businessDayTotal}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatYen(preview.totalTaxIncluded)}
                </dd>
              </div>
            </dl>
            <div className="grid grid-cols-3 gap-2 text-xs text-zinc-600">
              {(
                Object.keys(PAYMENT_METHODS) as Array<
                  keyof typeof PAYMENT_METHODS
                >
              ).map((key) => (
                <div key={key}>
                  {PAYMENT_METHODS[key]}:{" "}
                  <span className="tabular-nums">
                    {formatYen(preview.byMethod[key])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </OverlayDialog>
      ) : null}
    </AppShell>
  );
}
