"use client";

import { useMemo, useState } from "react";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { SessionTagPicker } from "@/components/session/SessionTagPicker";
import { LABELS, PAYMENT_METHODS, SESSION_CHANNEL } from "@/constants";
import { resolveSessionSeatLabel } from "@/data/floor.seed";
import {
  billableQty,
  resolveServiceDiscountAmount,
  type PaymentMethod,
  type SaleTaxBucket,
  type TaxType,
} from "@/domain/types";
import { formatYen, lineAmounts } from "@/lib/pricing";
import { usePos, useSession } from "@/store/pos-store";
import { useSessionTags } from "@/store/session-tags-store";

export function CheckoutScreen({
  sessionId,
  onBack,
  onDone,
}: {
  sessionId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const session = useSession(sessionId);
  const { ready, getSessionItems, getSessionWriteOffs, checkout, updateSessionTags, state } =
    usePos();
  const { catalog: tagCatalog } = useSessionTags();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [allowUnserved, setAllowUnserved] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doneNo, setDoneNo] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const items = getSessionItems(sessionId);
  const writeOffs = getSessionWriteOffs(sessionId);

  const chargeRows = useMemo(
    () =>
      items
        .map((o) => ({
          item: o,
          qty: billableQty(o, state.writeOffs),
        }))
        .filter((r) => r.qty > 0),
    [items, state.writeOffs],
  );

  const pendingCount = chargeRows.filter(
    (r) => r.item.status === "pending",
  ).length;

  const subtotal = useMemo(
    () =>
      chargeRows.reduce(
        (s, r) => s + r.item.unitPriceTaxIncluded * r.qty,
        0,
      ),
    [chargeRows],
  );

  const writeOffTotal = useMemo(
    () => writeOffs.reduce((s, w) => s + w.lineTaxIncluded, 0),
    [writeOffs],
  );

  const resolvedDiscount = useMemo(() => {
    if (!discountEnabled) return null;
    return resolveServiceDiscountAmount(subtotal, {
      percent: Number(discountPercent) || 0,
      amount: Number(discountAmount) || 0,
    });
  }, [discountEnabled, discountPercent, discountAmount, subtotal]);

  const discountYen = resolvedDiscount?.amountTaxIncluded ?? 0;
  const total = Math.max(0, subtotal - discountYen);

  /** Receipt-style buckets (same as Sale.taxBreakdown / 簡易インボイス). */
  const taxBuckets = useMemo(() => {
    const map = new Map<string, SaleTaxBucket>();
    for (const { item: o, qty } of chargeRows) {
      const amounts = lineAmounts(o.unitPriceTaxIncluded, o.taxRate, qty);
      const taxType = (o.taxType ?? "standard") as TaxType;
      const key = `${o.taxRate}:${taxType}`;
      const cur = map.get(key) ?? {
        taxRate: o.taxRate,
        taxType,
        taxExcluded: 0,
        taxAmount: 0,
        taxIncluded: 0,
      };
      cur.taxExcluded += amounts.lineTaxExcluded;
      cur.taxAmount += amounts.lineTaxAmount;
      cur.taxIncluded += amounts.lineTaxIncluded;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.taxRate - a.taxRate);
  }, [chargeRows]);

  if (!ready) {
    return <p className="text-sm text-zinc-500">{LABELS.common.loading}</p>;
  }

  // MUST: Show success before !session — checkout removes the session before setDoneNo.
  // EN: Session is purged mid-checkout; doneNo must win over the missing-session branch.
  if (doneNo) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <p className="text-lg font-semibold text-zinc-900">
          {LABELS.checkout.done}
        </p>
        <p className="font-mono text-zinc-600">{doneNo}</p>
        {error ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="flex min-h-12 items-center justify-center rounded-xl bg-zinc-900 text-white"
          onClick={onDone}
        >
          {LABELS.checkout.doneToFloor}
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">{LABELS.common.error}</p>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-zinc-300 bg-white text-sm"
          onClick={onDone}
        >
          {LABELS.common.back}
        </button>
      </div>
    );
  }

  const hasBill = chargeRows.length > 0 || writeOffs.length > 0;
  const receivedNum = Number(received) || 0;
  const change = Math.max(0, receivedNum - total);
  const canSubmit =
    hasBill &&
    !(pendingCount > 0 && !allowUnserved) &&
    !(method === "cash" && receivedNum < total);

  async function runCheckout() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await checkout({
        sessionId,
        method,
        received: method === "cash" ? receivedNum : total,
        allowUnserved,
        serviceDiscount: discountEnabled
          ? {
              percent: Number(discountPercent) || 0,
              amount: Number(discountAmount) || 0,
            }
          : undefined,
      });
      if (!result.ok) {
        if (result.reason === "unserved")
          setError(LABELS.checkout.unservedWarn);
        else if (result.reason === "empty") setError(LABELS.checkout.empty);
        else if (result.reason === "business_day_closed")
          setError(LABELS.checkout.businessDayClosed);
        else if (result.reason === "business_day_not_open")
          setError(LABELS.checkout.businessDayNotOpen);
        else if (result.reason === "cloud_save_failed")
          setError(LABELS.checkout.cloudSaveFailed);
        else if (result.reason === "stale")
          setError(LABELS.checkout.staleLines);
        else if (result.reason === "already_settled")
          setError(LABELS.checkout.alreadySettled);
        else setError(LABELS.common.error);
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setDoneNo(result.sale.sessionNo);
    } catch (err) {
      console.warn("checkout failed", err);
      setError(LABELS.common.error);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-semibold text-zinc-900">{LABELS.checkout.title}</p>
        <p className="text-zinc-600">
          {session.channel === "takeout"
            ? SESSION_CHANNEL.takeout
            : resolveSessionSeatLabel(session) || session.seatLabel}
        </p>
      </div>

      {!hasBill ? (
        <p className="text-sm text-zinc-500">{LABELS.checkout.empty}</p>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">
              {LABELS.checkout.summary}
            </h2>
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {chargeRows.map(({ item: o, qty }) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    <span>
                      {o.complimentary ? (
                        <span className="mr-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          {LABELS.order.complimentaryBadge}
                        </span>
                      ) : null}
                      {(o.channel ?? session?.channel) === "takeout" ? (
                        <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          {LABELS.order.takeoutBadge}
                        </span>
                      ) : null}
                      {o.productName} × {qty}
                    </span>
                    {o.memo?.trim() ? (
                      <span className="mt-0.5 block text-xs font-medium text-amber-800">
                        {o.memo.trim()}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    {formatYen(o.unitPriceTaxIncluded * qty)}
                    {o.complimentary &&
                    o.listUnitPriceTaxIncluded != null &&
                    o.listUnitPriceTaxIncluded > 0 ? (
                      <span className="block text-[10px] text-zinc-400 line-through">
                        {LABELS.order.listPrice}{" "}
                        {formatYen(o.listUnitPriceTaxIncluded * qty)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {writeOffs.length > 0 ? (
              <div className="mb-3 border-t border-zinc-100 pt-2">
                <p className="mb-1 text-xs font-medium text-zinc-500">
                  {LABELS.checkout.writeOffs}
                  <span className="ml-1 text-zinc-400">
                    （{LABELS.checkout.writeOffLoss}）
                  </span>
                </p>
                <ul className="flex flex-col gap-1 text-sm text-zinc-600">
                  {writeOffs.map((w) => {
                    const orderMemo =
                      items.find((o) => o.id === w.orderItemId)?.memo?.trim() ||
                      w.memo?.trim();
                    return (
                      <li key={w.id} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          <span>
                            {w.productName} × {w.qty}
                          </span>
                          {orderMemo ? (
                            <span className="mt-0.5 block text-xs font-medium text-amber-800">
                              {orderMemo}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0">
                          −{formatYen(w.lineTaxIncluded)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-right text-xs text-zinc-500">
                  {LABELS.checkout.writeOffsTotal} −
                  {formatYen(writeOffTotal)}
                </p>
              </div>
            ) : null}
            <p className="mt-3 flex justify-between text-sm text-zinc-700">
              <span>{LABELS.checkout.subtotal}</span>
              <span className="tabular-nums">{formatYen(subtotal)}</span>
            </p>
            {discountYen > 0 ? (
              <p className="mt-1 flex justify-between text-sm text-emerald-800">
                <span>
                  {LABELS.checkout.serviceDiscountPreview}
                  {resolvedDiscount?.mode === "percent" &&
                  resolvedDiscount.percent != null
                    ? `（${resolvedDiscount.percent}%）`
                    : ""}
                </span>
                <span className="tabular-nums">−{formatYen(discountYen)}</span>
              </p>
            ) : null}
            <p className="mt-2 flex justify-between text-lg font-semibold">
              <span>{LABELS.checkout.total}</span>
              <span className="tabular-nums">{formatYen(total)}</span>
            </p>
            {taxBuckets.length > 0 ? (
              <div className="mt-3 border-t border-dashed border-zinc-200 pt-3">
                <p className="mb-0.5 text-xs font-medium text-zinc-600">
                  {LABELS.checkout.taxBreakdownTitle}
                </p>
                <p className="mb-2 text-[10px] leading-snug text-zinc-400">
                  {LABELS.checkout.taxBreakdownHint}
                </p>
                <ul className="flex flex-col gap-2 text-xs text-zinc-700">
                  {taxBuckets.map((b) => {
                    const pct = Math.round(b.taxRate * 100);
                    const isExempt = b.taxRate <= 0;
                    const rateLabel = isExempt
                      ? LABELS.checkout.taxExempt
                      : `${pct}${LABELS.checkout.taxRateTargetIncluded}`;
                    return (
                      <li
                        key={`${b.taxRate}:${b.taxType}`}
                        className="flex flex-col gap-0.5"
                      >
                        <div className="flex justify-between gap-2">
                          <span>
                            {rateLabel}
                            {!isExempt && b.taxType === "reduced" ? (
                              <span className="ml-1 text-zinc-500">
                                {LABELS.checkout.taxReducedMark}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatYen(b.taxIncluded)}
                          </span>
                        </div>
                        {!isExempt ? (
                          <div className="flex justify-between gap-2 pl-2 text-zinc-500">
                            <span>{LABELS.checkout.taxInner}</span>
                            <span className="shrink-0 tabular-nums">
                              {formatYen(b.taxAmount)}
                            </span>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          <SessionTagPicker
            catalog={tagCatalog}
            selectedIds={session.tagIds ?? []}
            onChange={(ids) => updateSessionTags(sessionId, ids)}
          />

          <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <label className="inline-flex w-fit max-w-full cursor-pointer items-center gap-2 py-1 text-sm font-medium text-zinc-800">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0"
                checked={discountEnabled}
                onChange={(e) => {
                  setDiscountEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setDiscountPercent("");
                    setDiscountAmount("");
                  }
                }}
              />
              {LABELS.checkout.serviceDiscount}
            </label>
            {discountEnabled ? (
              <div className="mt-3 flex flex-col gap-3 border-t border-zinc-100 pt-3">
                <p className="text-xs text-zinc-500">
                  {LABELS.checkout.serviceDiscountHint}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-zinc-600">
                      {LABELS.checkout.serviceDiscountPercent}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="decimal"
                      className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                      value={discountPercent}
                      placeholder="0"
                      onChange={(e) => setDiscountPercent(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-zinc-600">
                      {LABELS.checkout.serviceDiscountAmount}
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                      value={discountAmount}
                      placeholder="0"
                      onChange={(e) => setDiscountAmount(e.target.value)}
                    />
                  </label>
                </div>
                <p className="text-xs text-zinc-500">
                  {LABELS.checkout.serviceDiscountPriority}
                </p>
              </div>
            ) : null}
          </section>

          {pendingCount > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>{LABELS.checkout.unservedWarn}</p>
              <label className="mt-2 flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={allowUnserved}
                  onChange={(e) => setAllowUnserved(e.target.checked)}
                />
                {LABELS.checkout.confirmUnserved}（{pendingCount}）
              </label>
            </div>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              {LABELS.checkout.method}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMethod(key);
                    if (key !== "cash") setReceived(String(total));
                  }}
                  className={[
                    "min-h-12 rounded-xl text-sm",
                    method === key
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 bg-white",
                  ].join(" ")}
                >
                  {PAYMENT_METHODS[key]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span>{LABELS.checkout.received}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className="mt-1 min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-lg"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder={String(total)}
            />
          </label>
          <p className="text-sm">
            {LABELS.checkout.change}:{" "}
            <span className="text-xl font-semibold">{formatYen(change)}</span>
          </p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            className="min-h-12 rounded-xl bg-zinc-900 text-white disabled:opacity-40"
            disabled={!canSubmit}
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            {LABELS.checkout.confirm}
          </button>
        </>
      )}

      <button
        type="button"
        className="min-h-11 rounded-xl border border-zinc-300 bg-white text-sm"
        onClick={onBack}
      >
        {LABELS.common.back}
      </button>

      {confirmOpen ? (
        <OverlayDialog
          tone="white"
          onClose={() => {
            if (!submitting) setConfirmOpen(false);
          }}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="min-h-10 rounded-lg border border-zinc-300 px-4 text-sm"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
              >
                {LABELS.checkout.confirmDialogCancel}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={submitting}
                onClick={() => void runCheckout()}
              >
                {submitting
                  ? LABELS.checkout.confirming
                  : LABELS.checkout.confirmDialogSubmit}
              </button>
            </div>
          }
        >
          <div className="space-y-3 pr-2">
            <h2 className="text-base font-semibold text-zinc-900">
              {LABELS.checkout.confirmDialogTitle}
            </h2>
            <p className="text-sm text-zinc-600">
              {LABELS.checkout.confirmDialogBody}
            </p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.checkout.method}
                </dt>
                <dd className="font-medium">{PAYMENT_METHODS[method]}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">
                  {LABELS.checkout.total}
                </dt>
                <dd className="font-medium tabular-nums">{formatYen(total)}</dd>
              </div>
              {method === "cash" ? (
                <>
                  <div>
                    <dt className="text-[11px] text-zinc-500">
                      {LABELS.checkout.received}
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {formatYen(receivedNum)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-zinc-500">
                      {LABELS.checkout.change}
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {formatYen(change)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        </OverlayDialog>
      ) : null}
    </div>
  );
}
