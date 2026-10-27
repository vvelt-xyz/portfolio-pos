/**
 * Reverse-sale (赤伝) builders and remaining-capacity helpers.
 * MUST: Build from original Sale snapshot only — never live catalog.
 * EN: Reverse lines/amounts come only from the settled sale snapshot.
 */
import { newId } from "@/lib/ids";
import { applyRounding, getTaxPolicy } from "@/domain/tax-policy";
import {
  buildTaxBreakdownFromLines,
  type Sale,
  type SaleLine,
  type SaleTaxBucket,
} from "@/domain/types";

function roundYen(value: number): number {
  return applyRounding(value, getTaxPolicy().rounding);
}

export function isReverseSale(sale: Sale): boolean {
  return sale.kind === "reverse";
}

export function isBlackSale(sale: Sale): boolean {
  return !isReverseSale(sale);
}

/** Absolute tax-included yen already reversed against this black sale. */
export function reversedTotalAbs(
  original: Sale,
  allSales: Sale[],
): number {
  let sum = 0;
  for (const s of allSales) {
    if (s.kind === "reverse" && s.reversesSaleId === original.id) {
      sum += Math.abs(s.totalTaxIncluded);
    }
  }
  return sum;
}

export function remainingRefundableTaxIncluded(
  original: Sale,
  allSales: Sale[],
): number {
  return Math.max(0, original.totalTaxIncluded - reversedTotalAbs(original, allSales));
}

/** Qty already reversed for a given original line index. */
export function reversedQtyForLine(
  original: Sale,
  lineIndex: number,
  allSales: Sale[],
): number {
  let qty = 0;
  for (const s of allSales) {
    if (s.kind !== "reverse" || s.reversesSaleId !== original.id) continue;
    for (const line of s.lines) {
      if (line.reverseOfLineIndex === lineIndex) qty += line.qty;
    }
  }
  return qty;
}

export function remainingQtyForLine(
  original: Sale,
  lineIndex: number,
  allSales: Sale[],
): number {
  const line = original.lines[lineIndex];
  if (!line) return 0;
  return Math.max(0, line.qty - reversedQtyForLine(original, lineIndex, allSales));
}

export type LineReverseSelection = {
  lineIndex: number;
  qty: number;
};

function scaleLine(line: SaleLine, qty: number, lineIndex: number): SaleLine {
  const ratio = qty / line.qty;
  return {
    productId: line.productId,
    productName: line.productName,
    taxType: line.taxType,
    taxRate: line.taxRate,
    qty,
    unitPriceTaxExcluded: line.unitPriceTaxExcluded,
    unitPriceTaxIncluded: line.unitPriceTaxIncluded,
    unitCostTaxIncluded: line.unitCostTaxIncluded,
    lineTaxExcluded: -roundYen(line.lineTaxExcluded * ratio),
    lineTaxAmount: -roundYen(line.lineTaxAmount * ratio),
    lineTaxIncluded: -roundYen(line.lineTaxIncluded * ratio),
    sourceLineId: line.sourceLineId,
    channel: line.channel,
    ...(line.complimentary
      ? {
          complimentary: true as const,
          ...(line.listUnitPriceTaxIncluded != null
            ? { listUnitPriceTaxIncluded: line.listUnitPriceTaxIncluded }
            : {}),
        }
      : {}),
    memo: line.memo,
    reverseOfLineIndex: lineIndex,
  };
}

function scaleBuckets(
  buckets: SaleTaxBucket[],
  ratio: number,
): SaleTaxBucket[] {
  return buckets.map((b) => ({
    taxRate: b.taxRate,
    taxType: b.taxType,
    taxExcluded: -roundYen(b.taxExcluded * ratio),
    taxAmount: -roundYen(b.taxAmount * ratio),
    taxIncluded: -roundYen(b.taxIncluded * ratio),
  }));
}

function sumLines(lines: SaleLine[]) {
  return lines.reduce(
    (acc, l) => {
      acc.ex += l.lineTaxExcluded;
      acc.tax += l.lineTaxAmount;
      acc.inc += l.lineTaxIncluded;
      return acc;
    },
    { ex: 0, tax: 0, inc: 0 },
  );
}

export type BuildReverseResult =
  | { ok: true; sale: Sale }
  | {
      ok: false;
      reason:
        | "not_black"
        | "empty"
        | "exceeds_total"
        | "exceeds_line"
        | "invalid_line"
        | "invalid_amount";
    };

function baseReverseMeta(
  original: Sale,
  paidAt: string,
  businessDate: string,
  cutoffHour: number | undefined,
  reason: string | undefined,
  reverseMode: "lines" | "amount" | "percent",
): Pick<
  Sale,
  | "id"
  | "kind"
  | "reversesSaleId"
  | "reverseMode"
  | "reversePercent"
  | "reason"
  | "sessionId"
  | "sessionNo"
  | "channel"
  | "seatIds"
  | "seatLabel"
  | "guests"
  | "tags"
  | "openedAt"
  | "businessDate"
  | "cutoffHour"
  | "paidAt"
  | "method"
  | "received"
  | "change"
  | "writeOffs"
  | "writeOffTotalTaxIncluded"
  | "taxPolicyVersion"
  | "hadUnserved"
> {
  return {
    id: newId("rev"),
    kind: "reverse",
    reversesSaleId: original.id,
    reverseMode,
    reason: reason?.trim() || undefined,
    sessionId: original.sessionId,
    sessionNo: original.sessionNo,
    channel: original.channel,
    seatIds: original.seatIds,
    seatLabel: original.seatLabel,
    guests: original.guests,
    tags: original.tags,
    openedAt: original.openedAt,
    businessDate,
    cutoffHour,
    paidAt,
    method: original.method,
    received: 0,
    change: 0,
    writeOffs: [],
    writeOffTotalTaxIncluded: 0,
    taxPolicyVersion: original.taxPolicyVersion,
    hadUnserved: undefined,
  };
}

export function buildLineReverseSale(input: {
  original: Sale;
  allSales: Sale[];
  selections: LineReverseSelection[];
  paidAt: string;
  businessDate: string;
  cutoffHour?: number;
  reason?: string;
}): BuildReverseResult {
  const { original, allSales, selections, paidAt, businessDate, cutoffHour, reason } =
    input;
  if (!isBlackSale(original)) return { ok: false, reason: "not_black" };
  if (selections.length === 0) return { ok: false, reason: "empty" };

  const lines: SaleLine[] = [];
  for (const sel of selections) {
    if (sel.qty <= 0) continue;
    const src = original.lines[sel.lineIndex];
    if (!src) return { ok: false, reason: "invalid_line" };
    const rem = remainingQtyForLine(original, sel.lineIndex, allSales);
    if (sel.qty > rem) return { ok: false, reason: "exceeds_line" };
    lines.push(scaleLine(src, sel.qty, sel.lineIndex));
  }
  if (lines.length === 0) return { ok: false, reason: "empty" };

  const sums = sumLines(lines);
  const absTotal = Math.abs(sums.inc);
  if (absTotal > remainingRefundableTaxIncluded(original, allSales)) {
    return { ok: false, reason: "exceeds_total" };
  }

  const taxBreakdown = buildTaxBreakdownFromLines(lines);
  const sale: Sale = {
    ...baseReverseMeta(
      original,
      paidAt,
      businessDate,
      cutoffHour,
      reason,
      "lines",
    ),
    subtotalTaxIncluded: sums.inc,
    totalTaxExcluded: sums.ex,
    totalTaxAmount: sums.tax,
    totalTaxIncluded: sums.inc,
    lines,
    taxBreakdown,
  };
  return { ok: true, sale };
}

export function buildAmountReverseSale(input: {
  original: Sale;
  allSales: Sale[];
  /** Positive tax-included yen to reverse. */
  amountTaxIncluded: number;
  paidAt: string;
  businessDate: string;
  cutoffHour?: number;
  reason?: string;
  reverseMode?: "amount" | "percent";
  /** When mode=percent, store entered %. */
  percent?: number;
}): BuildReverseResult {
  const {
    original,
    allSales,
    amountTaxIncluded,
    paidAt,
    businessDate,
    cutoffHour,
    reason,
    reverseMode = "amount",
    percent,
  } = input;
  if (!isBlackSale(original)) return { ok: false, reason: "not_black" };
  const amount = roundYen(amountTaxIncluded);
  if (amount <= 0) return { ok: false, reason: "invalid_amount" };
  const remaining = remainingRefundableTaxIncluded(original, allSales);
  if (amount > remaining) return { ok: false, reason: "exceeds_total" };
  if (original.totalTaxIncluded <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const ratio = amount / original.totalTaxIncluded;
  const buckets =
    original.taxBreakdown && original.taxBreakdown.length > 0
      ? original.taxBreakdown
      : buildTaxBreakdownFromLines(original.lines);
  const taxBreakdown = scaleBuckets(buckets, ratio);

  // Fix rounding so |taxIncluded| sums to amount
  const bucketSum = taxBreakdown.reduce((s, b) => s + b.taxIncluded, 0);
  const drift = -amount - bucketSum;
  if (drift !== 0 && taxBreakdown.length > 0) {
    const last = taxBreakdown[taxBreakdown.length - 1]!;
    last.taxIncluded += drift;
    last.taxExcluded += drift;
  }

  const totalTaxExcluded = taxBreakdown.reduce((s, b) => s + b.taxExcluded, 0);
  const totalTaxAmount = taxBreakdown.reduce((s, b) => s + b.taxAmount, 0);
  const totalTaxIncluded = -amount;

  const sale: Sale = {
    ...baseReverseMeta(
      original,
      paidAt,
      businessDate,
      cutoffHour,
      reason,
      reverseMode,
    ),
    subtotalTaxIncluded: totalTaxIncluded,
    totalTaxExcluded,
    totalTaxAmount,
    totalTaxIncluded,
    lines: [],
    taxBreakdown,
    ...(percent != null ? { reversePercent: percent } : {}),
  };
  if (percent != null && !sale.reason) {
    sale.reason = `${percent}%`;
  } else if (percent != null && sale.reason) {
    sale.reason = `${sale.reason}（${percent}%）`;
  }

  return { ok: true, sale };
}

export function buildPercentReverseSale(input: {
  original: Sale;
  allSales: Sale[];
  percent: number;
  paidAt: string;
  businessDate: string;
  cutoffHour?: number;
  reason?: string;
}): BuildReverseResult {
  const { original, allSales, percent } = input;
  if (percent <= 0 || percent > 100) {
    return { ok: false, reason: "invalid_amount" };
  }
  // MUST: % base = refundable remaining (after prior + same-batch line reverses).
  // EN: Percent applies to remaining refundable yen, not the original black total.
  const remaining = remainingRefundableTaxIncluded(original, allSales);
  const amount = roundYen((remaining * percent) / 100);
  return buildAmountReverseSale({
    ...input,
    amountTaxIncluded: amount,
    reverseMode: "percent",
    percent,
  });
}

export type BuildOrderedReverseResult =
  | { ok: true; sales: Sale[] }
  | {
      ok: false;
      reason:
        | "not_black"
        | "empty"
        | "exceeds_total"
        | "exceeds_line"
        | "invalid_line"
        | "invalid_amount"
        | "amount_and_percent";
    };

/**
 * Build 1–2 reverse docs: lines first (optional), then amount XOR percent on remaining.
 * MUST: Never merge line + money into one Sale; always separate append-only docs.
 * EN: Compound UI posts ordered separate reverse sales, not a hybrid document.
 */
export function buildOrderedReverseSales(input: {
  original: Sale;
  allSales: Sale[];
  selections?: LineReverseSelection[];
  /** Positive tax-included yen; mutually exclusive with percent. */
  amountTaxIncluded?: number;
  /** 1–100; mutually exclusive with amountTaxIncluded. */
  percent?: number;
  paidAt: string;
  businessDate: string;
  cutoffHour?: number;
  reason?: string;
}): BuildOrderedReverseResult {
  const {
    original,
    allSales,
    selections = [],
    amountTaxIncluded,
    percent,
    paidAt,
    businessDate,
    cutoffHour,
    reason,
  } = input;

  if (!isBlackSale(original)) return { ok: false, reason: "not_black" };

  const hasAmount =
    amountTaxIncluded != null &&
    Number.isFinite(amountTaxIncluded) &&
    amountTaxIncluded > 0;
  const hasPercent =
    percent != null && Number.isFinite(percent) && percent > 0;

  if (hasAmount && hasPercent) {
    return { ok: false, reason: "amount_and_percent" };
  }

  const activeSelections = selections.filter((s) => s.qty > 0);
  const sales: Sale[] = [];
  let projected = allSales;

  if (activeSelections.length > 0) {
    const lineBuilt = buildLineReverseSale({
      original,
      allSales: projected,
      selections: activeSelections,
      paidAt,
      businessDate,
      cutoffHour,
      reason,
    });
    if (!lineBuilt.ok) return lineBuilt;
    sales.push(lineBuilt.sale);
    projected = [...projected, lineBuilt.sale];
  }

  if (hasPercent) {
    const pctBuilt = buildPercentReverseSale({
      original,
      allSales: projected,
      percent: percent!,
      paidAt,
      businessDate,
      cutoffHour,
      reason,
    });
    if (!pctBuilt.ok) return pctBuilt;
    sales.push(pctBuilt.sale);
  } else if (hasAmount) {
    const amtBuilt = buildAmountReverseSale({
      original,
      allSales: projected,
      amountTaxIncluded: amountTaxIncluded!,
      paidAt,
      businessDate,
      cutoffHour,
      reason,
      reverseMode: "amount",
    });
    if (!amtBuilt.ok) return amtBuilt;
    sales.push(amtBuilt.sale);
  }

  if (sales.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, sales };
}
