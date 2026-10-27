"use client";

import { useMemo, useState } from "react";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { LABELS, PAYMENT_METHODS, SESSION_CHANNEL } from "@/constants";
import {
  buildOrderedReverseSales,
  isBlackSale,
  remainingQtyForLine,
  remainingRefundableTaxIncluded,
  type LineReverseSelection,
} from "@/domain/reverse-sale";
import type { Sale } from "@/domain/types";
import { getDb, isFirebaseConfigured } from "@/lib/firebase/client";
import { appendReverseSaleTx } from "@/lib/firebase/ops-tx";
import { appendSaleToFirestore } from "@/lib/firebase/sales";
import { getActiveStoreId } from "@/lib/firebase/store-id";
import { businessDateKey } from "@/lib/ids";
import { formatYen } from "@/lib/pricing";
import { usePos } from "@/store/pos-store";
import { useSettings } from "@/store/settings-store";

/** Money leg: none | fixed yen | percent of remaining after lines. */
type MoneyMode = "none" | "amount" | "percent";

export function ReverseSalePanel() {
  const { settledSales, refreshFromCloud } = usePos();
  const { policy } = useSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineQty, setLineQty] = useState<Record<number, number>>({});
  const [moneyMode, setMoneyMode] = useState<MoneyMode>("none");
  const [amountYen, setAmountYen] = useState("");
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      settledSales
        .slice()
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [settledSales],
  );

  const selected = sorted.find((s) => s.id === selectedId) ?? null;
  const original =
    selected && isBlackSale(selected)
      ? selected
      : selected?.reversesSaleId
        ? sorted.find((s) => s.id === selected.reversesSaleId) ?? null
        : null;

  const workingOriginal =
    selected && isBlackSale(selected) ? selected : original;

  const remaining = workingOriginal
    ? remainingRefundableTaxIncluded(workingOriginal, settledSales)
    : 0;

  function selectBlack(sale: Sale) {
    if (!isBlackSale(sale)) return;
    setSelectedId(sale.id);
    setLineQty({});
    setMoneyMode("none");
    setAmountYen("");
    setPercent("");
    setReason("");
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setSelectedId(null);
    setLineQty({});
    setMoneyMode("none");
    setAmountYen("");
    setPercent("");
    setReason("");
  }

  function buildDraft():
    | { ok: true; sales: Sale[] }
    | { ok: false; reason: string } {
    if (!workingOriginal) return { ok: false, reason: "empty" };
    const paidAt = new Date().toISOString();
    const businessDate = businessDateKey();
    const cutoffHour = policy.businessDayCutoffHour;
    const reasonTrim = reason.trim() || undefined;

    const selections: LineReverseSelection[] = Object.entries(lineQty)
      .map(([idx, qty]) => ({
        lineIndex: Number(idx),
        qty: Math.floor(qty),
      }))
      .filter((s) => s.qty > 0);

    return buildOrderedReverseSales({
      original: workingOriginal,
      allSales: settledSales,
      selections,
      amountTaxIncluded:
        moneyMode === "amount" ? Number(amountYen) : undefined,
      percent: moneyMode === "percent" ? Number(percent) : undefined,
      paidAt,
      businessDate,
      cutoffHour,
      reason: reasonTrim,
    });
  }

  const draft = workingOriginal ? buildDraft() : null;
  const previewSales = draft && draft.ok ? draft.sales : null;
  const previewYen = previewSales
    ? previewSales.reduce((s, x) => s + x.totalTaxIncluded, 0)
    : null;

  async function appendOne(sale: Sale): Promise<boolean> {
    const db = isFirebaseConfigured() ? getDb() : null;
    if (db && workingOriginal) {
      const next = Object.entries(lineQty)
        .map(([idx, qty]) => ({ index: Number(idx), qty: Math.floor(qty) }))
        .filter((row) => row.qty > 0);
      const cloud = await appendReverseSaleTx(db, {
        storeId: getActiveStoreId(),
        originalSaleId: workingOriginal.id,
        originalQtyByLine: workingOriginal.lines.map((l) => l.qty),
        originalTotal: Math.abs(workingOriginal.totalTaxIncluded),
        amountYen: next.length === 0 ? Math.abs(sale.totalTaxIncluded) : 0,
        next,
        sale,
      });
      if (!cloud.ok) return false;
      return true;
    }
    const result = await appendSaleToFirestore(sale);
    if (result === "created" || result === "skipped_no_firebase") return true;
    return false;
  }

  async function submit() {
    const built = buildDraft();
    if (!built.ok) {
      setError(
        built.reason === "exceeds_total" || built.reason === "exceeds_line"
          ? LABELS.reverse.errorExceeds
          : built.reason === "amount_and_percent"
            ? LABELS.reverse.errorAmountAndPercent
            : built.reason === "empty" || built.reason === "invalid_amount"
              ? LABELS.reverse.errorEmpty
              : LABELS.reverse.error,
      );
      setConfirmOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let posted = 0;
      for (const sale of built.sales) {
        const ok = await appendOne(sale);
        if (!ok) {
          setError(
            posted > 0
              ? LABELS.reverse.errorPartial
              : LABELS.reverse.error,
          );
          setConfirmOpen(false);
          await refreshFromCloud();
          return;
        }
        posted += 1;
      }
      await refreshFromCloud();
      setMessage(
        built.sales.length > 1
          ? LABELS.reverse.doneMulti.replace(
              "{n}",
              String(built.sales.length),
            )
          : LABELS.reverse.done,
      );
      setConfirmOpen(false);
      resetForm();
    } catch {
      setError(LABELS.reverse.error);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          {LABELS.reverse.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">{LABELS.reverse.subtitle}</p>
      </div>

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!workingOriginal ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-800">
            {LABELS.reverse.listTitle}
          </h3>
          {sorted.length === 0 ? (
            <p className="text-sm text-zinc-500">{LABELS.reverse.empty}</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {sorted.map((sale) => {
                const reverse = sale.kind === "reverse";
                return (
                  <li key={sale.id}>
                    <button
                      type="button"
                      disabled={reverse}
                      onClick={() => selectBlack(sale)}
                      className={[
                        "flex w-full items-start justify-between gap-3 px-3 py-3 text-left text-sm",
                        reverse
                          ? "cursor-default bg-rose-50/50 text-zinc-500"
                          : "hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">
                          <span
                            className={[
                              "mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold",
                              reverse
                                ? "bg-rose-200 text-rose-900"
                                : "bg-zinc-200 text-zinc-800",
                            ].join(" ")}
                          >
                            {reverse
                              ? LABELS.reverse.reverseBadge
                              : LABELS.reverse.blackBadge}
                          </span>
                          {sale.sessionNo} · {SESSION_CHANNEL[sale.channel]}
                          {sale.seatLabel ? ` · ${sale.seatLabel}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {sale.paidAt.replace("T", " ").slice(0, 19)} ·{" "}
                          {PAYMENT_METHODS[sale.method]}
                          {reverse && sale.reversesSaleId
                            ? ` → ${sale.reversesSaleId.slice(0, 8)}…`
                            : ""}
                        </p>
                      </div>
                      <p
                        className={[
                          "shrink-0 tabular-nums font-semibold",
                          reverse ? "text-rose-700" : "text-zinc-900",
                        ].join(" ")}
                      >
                        {formatYen(sale.totalTaxIncluded)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            className="self-start text-sm font-medium text-zinc-600 underline"
            onClick={() => setSelectedId(null)}
          >
            {LABELS.reverse.backToList}
          </button>

          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <p className="text-sm font-semibold text-zinc-900">
              {workingOriginal.sessionNo} ·{" "}
              {SESSION_CHANNEL[workingOriginal.channel]}
              {workingOriginal.seatLabel
                ? ` · ${workingOriginal.seatLabel}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {workingOriginal.paidAt.replace("T", " ").slice(0, 19)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">
                  {LABELS.reverse.originalTotal}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {formatYen(workingOriginal.totalTaxIncluded)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">
                  {LABELS.reverse.remaining}
                </dt>
                <dd className="font-semibold tabular-nums text-amber-900">
                  {formatYen(remaining)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-zinc-500">
              {LABELS.reverse.orderHint}
            </p>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-zinc-800">
              {LABELS.reverse.sectionLines}
            </h3>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {workingOriginal.lines.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-zinc-500">
                  {LABELS.reverse.noLines}
                </li>
              ) : (
                workingOriginal.lines.map((line, index) => {
                  const rem = remainingQtyForLine(
                    workingOriginal,
                    index,
                    settledSales,
                  );
                  if (rem <= 0) return null;
                  const qty = lineQty[index] ?? 0;
                  return (
                    <li
                      key={`${line.productId}-${index}`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-900">
                          {line.complimentary ? (
                            <span className="mr-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                              {LABELS.order.complimentaryBadge}
                            </span>
                          ) : null}
                          {line.productName}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatYen(line.unitPriceTaxIncluded)} × {line.qty}
                          {line.complimentary &&
                          line.listUnitPriceTaxIncluded != null &&
                          line.listUnitPriceTaxIncluded > 0 ? (
                            <span className="ml-1 line-through">
                              {LABELS.order.listPrice}{" "}
                              {formatYen(line.listUnitPriceTaxIncluded)}
                            </span>
                          ) : null}
                          （{LABELS.reverse.remainingQty}
                          {rem}）
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${line.productName} ${LABELS.reverse.qty} −`}
                          disabled={qty <= 0}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-xl leading-none text-zinc-800 active:bg-zinc-100 disabled:opacity-40"
                          onClick={() =>
                            setLineQty((prev) => ({
                              ...prev,
                              [index]: Math.max(0, (prev[index] ?? 0) - 1),
                            }))
                          }
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-base font-semibold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`${line.productName} ${LABELS.reverse.qty} +`}
                          disabled={qty >= rem}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xl leading-none font-semibold text-white active:bg-zinc-800 disabled:opacity-40"
                          onClick={() =>
                            setLineQty((prev) => ({
                              ...prev,
                              [index]: Math.min(rem, (prev[index] ?? 0) + 1),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-zinc-800">
              {LABELS.reverse.sectionMoney}
            </h3>
            <p className="text-xs text-zinc-500">
              {LABELS.reverse.moneyExclusiveHint}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["none", LABELS.reverse.moneyNone],
                  ["amount", LABELS.reverse.modeAmount],
                  ["percent", LABELS.reverse.modePercent],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMoneyMode(id);
                    if (id !== "amount") setAmountYen("");
                    if (id !== "percent") setPercent("");
                  }}
                  className={[
                    "min-h-10 rounded-lg px-3 text-sm font-medium",
                    moneyMode === id
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 bg-white text-zinc-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {moneyMode === "amount" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-700">
                  {LABELS.reverse.amountYen}
                </span>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  value={amountYen}
                  onChange={(e) => setAmountYen(e.target.value)}
                  className="min-h-11 rounded-xl border border-zinc-300 px-3 tabular-nums"
                />
              </label>
            ) : null}

            {moneyMode === "percent" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-700">
                  {LABELS.reverse.percent}
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="min-h-11 rounded-xl border border-zinc-300 px-3 tabular-nums"
                />
                <span className="text-xs text-zinc-500">
                  {LABELS.reverse.percentBaseHint}
                </span>
              </label>
            ) : null}
          </section>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">
              {LABELS.reverse.reason}
            </span>
            <input
              type="text"
              value={reason}
              placeholder={LABELS.reverse.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-11 rounded-xl border border-zinc-300 px-3"
            />
          </label>

          {previewSales && previewYen != null ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-3 text-sm text-zinc-800">
              <p className="font-medium text-zinc-900">
                {LABELS.reverse.preview}（{previewSales.length}
                {LABELS.reverse.docCountSuffix}）
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {previewSales.map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between gap-2 tabular-nums"
                  >
                    <span className="text-xs text-zinc-600">
                      {s.reverseMode === "lines"
                        ? LABELS.reverse.modeLines
                        : s.reverseMode === "percent"
                          ? LABELS.reverse.modePercent
                          : LABELS.reverse.modeAmount}
                    </span>
                    <span className="font-semibold text-rose-700">
                      {formatYen(s.totalTaxIncluded)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-rose-200 pt-2 font-semibold tabular-nums text-rose-800">
                <span>{LABELS.reverse.previewTotal}</span>
                <span>{formatYen(previewYen)}</span>
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy || previewYen == null || previewYen === 0}
            className="min-h-12 rounded-xl bg-zinc-900 text-sm font-medium text-white disabled:opacity-40"
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            {LABELS.reverse.confirm}
          </button>
        </div>
      )}

      {confirmOpen ? (
        <OverlayDialog
          size="md"
          tone="white"
          onClose={() => setConfirmOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <p className="pr-8 font-semibold text-zinc-900">
              {LABELS.reverse.confirmTitle}
            </p>
            <p className="text-sm text-zinc-600">
              {previewSales && previewSales.length > 1
                ? LABELS.reverse.confirmBodyMulti.replace(
                    "{n}",
                    String(previewSales.length),
                  )
                : LABELS.reverse.confirmBody}
            </p>
            {previewYen != null ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold tabular-nums text-rose-800">
                {formatYen(previewYen)}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-medium"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                {LABELS.reverse.cancel}
              </button>
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl bg-zinc-900 text-sm font-medium text-white disabled:opacity-40"
                onClick={() => void submit()}
                disabled={busy}
              >
                {busy ? LABELS.reverse.submitting : LABELS.reverse.confirm}
              </button>
            </div>
          </div>
        </OverlayDialog>
      ) : null}
    </div>
  );
}
