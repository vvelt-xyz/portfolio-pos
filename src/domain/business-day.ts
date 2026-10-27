/**
 * Business-day lifecycle: not_started → open → closed (no reopen).
 * L5: create on open; update once to closed.
 */
import { z } from "zod";
import {
  SaleTaxBucketSchema,
  type Sale,
  type SaleTaxBucket,
  PaymentMethodSchema,
} from "@/domain/types";

export type BusinessDayPhase = "not_started" | "open" | "closed";

export const BusinessDayOpenSchema = z.object({
  businessDate: z.string().min(8).max(8),
  status: z.literal("open"),
  openedAt: z.string().datetime(),
  cutoffHour: z.number().int().min(0).max(23),
});
export type BusinessDayOpen = z.infer<typeof BusinessDayOpenSchema>;

export const BusinessDayCloseSchema = z.object({
  businessDate: z.string().min(8).max(8),
  status: z.literal("closed"),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime(),
  cutoffHour: z.number().int().min(0).max(23),
  saleCount: z.number().int().min(0),
  totalTaxExcluded: z.number(),
  totalTaxAmount: z.number(),
  totalTaxIncluded: z.number(),
  writeOffTotalTaxIncluded: z.number(),
  serviceDiscountTotal: z.number(),
  byMethod: z.object({
    cash: z.number(),
    card: z.number(),
    electronic: z.number(),
  }),
  taxBreakdown: z.array(SaleTaxBucketSchema),
  note: z.string().optional(),
});
export type BusinessDayClose = z.infer<typeof BusinessDayCloseSchema>;

export const BusinessDayDocSchema = z.discriminatedUnion("status", [
  BusinessDayOpenSchema,
  BusinessDayCloseSchema,
]);
export type BusinessDayDoc = z.infer<typeof BusinessDayDocSchema>;

export function phaseOfBusinessDay(
  doc: BusinessDayDoc | null | undefined,
): BusinessDayPhase {
  if (!doc) return "not_started";
  return doc.status;
}

/**
 * Parse cloud/local payloads. Legacy closed docs without `openedAt` use `closedAt`.
 */
export function parseBusinessDayDoc(raw: unknown): BusinessDayDoc {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (
      o.status === "closed" &&
      typeof o.closedAt === "string" &&
      (o.openedAt == null || o.openedAt === "")
    ) {
      return BusinessDayCloseSchema.parse({ ...o, openedAt: o.closedAt });
    }
  }
  return BusinessDayDocSchema.parse(raw);
}

export function buildBusinessDayOpen(
  businessDate: string,
  cutoffHour: number,
  openedAt = new Date().toISOString(),
): BusinessDayOpen {
  return BusinessDayOpenSchema.parse({
    businessDate,
    status: "open",
    openedAt,
    cutoffHour,
  });
}

export function buildBusinessDaySummary(
  businessDate: string,
  sales: Sale[],
  cutoffHour: number,
  openedAt: string,
  closedAt = new Date().toISOString(),
  note?: string,
): BusinessDayClose {
  const daySales = sales.filter((s) => s.businessDate === businessDate);
  const byMethod = { cash: 0, card: 0, electronic: 0 };
  const bucketMap = new Map<string, SaleTaxBucket>();
  let totalTaxExcluded = 0;
  let totalTaxAmount = 0;
  let totalTaxIncluded = 0;
  let writeOffTotalTaxIncluded = 0;
  let serviceDiscountTotal = 0;

  for (const sale of daySales) {
    totalTaxExcluded += sale.totalTaxExcluded;
    totalTaxAmount += sale.totalTaxAmount;
    totalTaxIncluded += sale.totalTaxIncluded;
    writeOffTotalTaxIncluded += sale.writeOffTotalTaxIncluded ?? 0;
    serviceDiscountTotal += sale.serviceDiscount?.amountTaxIncluded ?? 0;
    const method = PaymentMethodSchema.parse(sale.method);
    byMethod[method] += sale.totalTaxIncluded;

    for (const b of sale.taxBreakdown ?? []) {
      const key = `${b.taxType}:${b.taxRate}`;
      const prev = bucketMap.get(key);
      if (prev) {
        prev.taxExcluded += b.taxExcluded;
        prev.taxAmount += b.taxAmount;
        prev.taxIncluded += b.taxIncluded;
      } else {
        bucketMap.set(key, { ...b });
      }
    }
  }

  const blackCount = daySales.filter((s) => s.kind !== "reverse").length;

  return BusinessDayCloseSchema.parse({
    businessDate,
    status: "closed",
    openedAt,
    closedAt,
    cutoffHour,
    saleCount: blackCount,
    totalTaxExcluded,
    totalTaxAmount,
    totalTaxIncluded,
    writeOffTotalTaxIncluded,
    serviceDiscountTotal,
    byMethod,
    taxBreakdown: Array.from(bucketMap.values()).sort(
      (a, b) => b.taxRate - a.taxRate,
    ),
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

/** Confirm-dialog preview without a real openedAt. */
export function previewBusinessDayTotals(
  businessDate: string,
  sales: Sale[],
  cutoffHour: number,
): Pick<
  BusinessDayClose,
  "saleCount" | "totalTaxIncluded" | "byMethod" | "cutoffHour" | "businessDate"
> {
  const draft = buildBusinessDaySummary(
    businessDate,
    sales,
    cutoffHour,
    new Date(0).toISOString(),
  );
  return {
    businessDate: draft.businessDate,
    cutoffHour: draft.cutoffHour,
    saleCount: draft.saleCount,
    totalTaxIncluded: draft.totalTaxIncluded,
    byMethod: draft.byMethod,
  };
}
