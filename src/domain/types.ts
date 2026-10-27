import { z } from "zod";
import {
  GuestsInputSchema,
  migrateLegacyGuests,
} from "@/domain/guests";
import {
  FrozenSessionTagSchema,
  NEW_VISIT_TAG_ID,
  mergeNewVisitTagIds,
} from "@/domain/session-tags";

export type { Guests } from "@/domain/guests";
export {
  emptyGuests,
  guestTotal,
  GuestsSchema,
  migrateLegacyGuests,
} from "@/domain/guests";
export type {
  FrozenSessionTag,
  SessionTagCatalog,
  SessionTagDef,
} from "@/domain/session-tags";
export {
  DEFAULT_SESSION_TAG_CATALOG,
  NEW_VISIT_TAG_ID,
  enabledSessionTags,
  resolveFrozenSessionTags,
} from "@/domain/session-tags";

export const TaxTypeSchema = z.enum(["standard", "reduced", "zero"]);
export type TaxType = z.infer<typeof TaxTypeSchema>;

export const SessionChannelSchema = z.enum(["table", "takeout"]);
export type SessionChannel = z.infer<typeof SessionChannelSchema>;

export const OrderStatusSchema = z.enum(["pending", "served", "canceled"]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentMethodSchema = z.enum(["cash", "card", "electronic"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const OrderItemSchema = z.object({
  id: stringId(),
  sessionId: z.string().min(1),
  /** Set when confirmed as part of an order batch (kitchen ticket unit). */
  batchId: z.string().min(1).optional(),
  productId: z.string().min(1),
  productName: z.string().min(1),
  /**
   * Serving channel for this line (tax/price). Defaults from session when omitted (legacy).
   * EN: Per-line dine-in vs takeout; session only supplies the default.
   */
  channel: SessionChannelSchema.optional(),
  taxType: TaxTypeSchema,
  taxRate: z.number().min(0),
  unitPriceTaxExcluded: z.number().min(0),
  unitPriceTaxIncluded: z.number().min(0),
  /**
   * Complimentary line (dice promo etc.). Charge is ¥0; list price is frozen aside.
   * EN: When true, unit prices are zero and listUnitPriceTaxIncluded holds the catalog price.
   */
  complimentary: z.boolean().optional(),
  /** Catalog or typed tax-included price before the complimentary charge. Not billed. */
  listUnitPriceTaxIncluded: z.number().min(0).optional(),
  /** Catalog cost frozen at order confirm (margin analytics). */
  unitCostTaxIncluded: z.number().min(0).optional(),
  qty: z.number().int().positive(),
  status: OrderStatusSchema,
  orderedAt: z.string().datetime(),
  servedAt: z.string().datetime().optional(),
  /** Line note for kitchen/serve (e.g. no mushrooms, after meal). */
  memo: z.string().optional(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const ServiceSessionSchema = z.object({
  id: z.string().min(1),
  sessionNo: z.string().min(1),
  channel: SessionChannelSchema,
  /** One or more floor regions (tables / bar seats) in this session. */
  seatIds: z.array(z.string().min(1)).optional(),
  /** Legacy single seat — migrated on load. */
  seatId: z.string().optional(),
  seatLabel: z.string().optional(),
  guests: GuestsInputSchema.optional(),
  /** Selected session-tag ids (L1 master). EN: Live tag selection on open session. */
  tagIds: z.array(z.string().min(1)).optional(),
  memo: z.string().optional(),
  status: z.enum(["open", "closed"]),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  /** Order line ids. Checkout uses these instead of a collection query. */
  lineIds: z.array(z.string().min(1)).optional(),
  /** Write-off ids included in checkout freshness checks. */
  writeOffIds: z.array(z.string().min(1)).optional(),
  /** Increments when lines or write-offs change. Stale checkouts are rejected. */
  lineRevision: z.number().int().min(0).optional(),
});
export type ServiceSession = z.infer<typeof ServiceSessionSchema>;

export const SaleLineSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  taxType: TaxTypeSchema,
  taxRate: z.number().min(0),
  qty: z.number().int().positive(),
  unitPriceTaxExcluded: z.number(),
  unitPriceTaxIncluded: z.number(),
  /** Complimentary charge. Amounts stay 0; list price is not billed. */
  complimentary: z.boolean().optional(),
  /** Tax-included list price frozen at order. Not included in sale totals. */
  listUnitPriceTaxIncluded: z.number().min(0).optional(),
  unitCostTaxIncluded: z.number().min(0).optional(),
  lineTaxExcluded: z.number(),
  lineTaxAmount: z.number(),
  lineTaxIncluded: z.number(),
  /** Ops order line id at settlement (traceability). */
  sourceLineId: z.string().optional(),
  /** Line serving channel frozen at checkout (mixed dine-in / takeout). */
  channel: SessionChannelSchema.optional(),
  memo: z.string().optional(),
  /**
   * On reverse sales: index into the original sale's `lines` array.
   * EN: Tracks which original line a reverse qty applies to.
   */
  reverseOfLineIndex: z.number().int().min(0).optional(),
});
export type SaleLine = z.infer<typeof SaleLineSchema>;

/** Frozen tax-rate bucket on a settled sale (never recompute from catalog). */
export const SaleTaxBucketSchema = z.object({
  taxRate: z.number().min(0),
  taxType: TaxTypeSchema,
  taxExcluded: z.number(),
  taxAmount: z.number(),
  taxIncluded: z.number(),
});
export type SaleTaxBucket = z.infer<typeof SaleTaxBucketSchema>;

/**
 * Served then written off (not charged). Inventory/ops = loss (already provided).
 * EN: Post-serve write-off; counts as loss for inventory, deducted at checkout.
 */
export const WriteOffSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  orderItemId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  taxType: TaxTypeSchema,
  taxRate: z.number().min(0),
  unitPriceTaxExcluded: z.number().min(0),
  unitPriceTaxIncluded: z.number().min(0),
  qty: z.number().int().positive(),
  lineTaxExcluded: z.number(),
  lineTaxAmount: z.number(),
  lineTaxIncluded: z.number(),
  /** Always loss for aggregation (served, not sold). */
  kind: z.literal("loss"),
  createdAt: z.string().datetime(),
  memo: z.string().optional(),
});
export type WriteOff = z.infer<typeof WriteOffSchema>;

/**
 * Checkout-time service discount (not product loss).
 * EN: Service discount for reporting; separate from writeOff loss.
 */
export const ServiceDiscountSchema = z.object({
  kind: z.literal("service"),
  mode: z.enum(["percent", "amount"]),
  /** Entered % when mode=percent (0–100). */
  percent: z.number().min(0).max(100).optional(),
  /** Entered yen when mode=amount. */
  inputAmount: z.number().min(0).optional(),
  /** Actual tax-included yen deducted from subtotal. */
  amountTaxIncluded: z.number().min(0),
});
export type ServiceDiscount = z.infer<typeof ServiceDiscountSchema>;

export const SaleSchema = z.object({
  id: z.string().min(1),
  /**
   * `"sale"` = settled check (black). `"reverse"` = append-only credit note (red).
   * Omitted/legacy docs are treated as sale.
   */
  kind: z.enum(["sale", "reverse"]).default("sale"),
  /** Set when kind=reverse — id of the original settled sale. */
  reversesSaleId: z.string().min(1).optional(),
  reverseMode: z.enum(["lines", "amount", "percent"]).optional(),
  /** Entered % when reverseMode=percent (for analytics; not only in reason text). */
  reversePercent: z.number().min(0).max(100).optional(),
  /** Staff reason for the reverse (recommended). */
  reason: z.string().optional(),
  sessionId: z.string().min(1),
  sessionNo: z.string().min(1),
  channel: SessionChannelSchema,
  seatIds: z.array(z.string().min(1)).optional(),
  seatLabel: z.string().optional(),
  /** Frozen guest mix at checkout (analytics: gender × product). */
  guests: GuestsInputSchema.optional(),
  /**
   * Session tags frozen at checkout (id + label snapshot).
   * EN: Freeze tag labels so master renames do not rewrite history.
   */
  tags: z.array(FrozenSessionTagSchema).optional(),
  /** Session open time frozen at checkout (dwell analytics). */
  openedAt: z.string().datetime().optional(),
  businessDate: z.string().min(8),
  /** Cutoff hour used to compute businessDate (traceability). */
  cutoffHour: z.number().int().min(0).max(23).optional(),
  paidAt: z.string().datetime(),
  method: PaymentMethodSchema,
  received: z.number().min(0),
  change: z.number().min(0),
  /** Line total (tax-included) before service discount. */
  subtotalTaxIncluded: z.number(),
  totalTaxExcluded: z.number(),
  totalTaxAmount: z.number(),
  /** Payable after service discount (what guest pays). Reverse docs use negative totals. */
  totalTaxIncluded: z.number(),
  lines: z.array(SaleLineSchema),
  /** Snapshot of write-offs deducted from this sale (loss / not charged). */
  writeOffs: z.array(SaleLineSchema).default([]),
  writeOffTotalTaxIncluded: z.number().default(0),
  /**
   * Optional checkout service discount (aggregation: kind=service).
   * EN: Guest-facing discount; distinct from write-off loss.
   */
  serviceDiscount: ServiceDiscountSchema.optional(),
  /**
   * Tax-policy version frozen at checkout (audit / law-change trace).
   * EN: Freeze tax-policy version on settled sales.
   */
  taxPolicyVersion: z.string().optional(),
  /**
   * Per-rate totals from lines at checkout (immutable).
   * EN: Rate buckets frozen at settlement; do not rebuild from catalog.
   */
  taxBreakdown: z.array(SaleTaxBucketSchema).default([]),
  /** True if checkout proceeded with unserved billable lines. */
  hadUnserved: z.boolean().optional(),
});
export type Sale = z.infer<typeof SaleSchema>;

export const PosStateSchema = z.object({
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  sessions: z.array(ServiceSessionSchema),
  orderItems: z.array(OrderItemSchema),
  writeOffs: z.array(WriteOffSchema).default([]),
  sales: z.array(SaleSchema),
  dailySeqByDate: z.record(z.string(), z.number().int().min(0)),
});
export type PosState = z.infer<typeof PosStateSchema>;

function stringId() {
  return z.string().min(1);
}

export function emptyPosState(): PosState {
  return {
    version: 6,
    sessions: [],
    orderItems: [],
    writeOffs: [],
    sales: [],
    dailySeqByDate: {},
  };
}

/** Build immutable per-rate buckets from settled lines (pre-discount). */
export function buildTaxBreakdownFromLines(lines: SaleLine[]): SaleTaxBucket[] {
  const map = new Map<string, SaleTaxBucket>();
  for (const line of lines) {
    const key = `${line.taxRate}:${line.taxType}`;
    const cur = map.get(key) ?? {
      taxRate: line.taxRate,
      taxType: line.taxType,
      taxExcluded: 0,
      taxAmount: 0,
      taxIncluded: 0,
    };
    cur.taxExcluded += line.lineTaxExcluded;
    cur.taxAmount += line.lineTaxAmount;
    cur.taxIncluded += line.lineTaxIncluded;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.taxRate - a.taxRate);
}

/** Normalize legacy seatId → seatIds; ensure writeOffs / taxBreakdown / line channel. */
export function migratePosState(state: PosState): PosState {
  const sessions = state.sessions.map((s) => {
    const guests =
      s.guests !== undefined ? migrateLegacyGuests(s.guests) : undefined;
    const tagIds = mergeNewVisitTagIds(s.tagIds, guests?.isNewVisit);
    const guestsClean = guests
      ? { parties: guests.parties, isNewVisit: undefined }
      : undefined;
    if (s.seatIds && s.seatIds.length > 0) {
      const { seatId: _legacy, ...rest } = s;
      return {
        ...rest,
        seatIds: s.seatIds,
        guests: guestsClean,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      };
    }
    if (s.seatId) {
      const { seatId, ...rest } = s;
      return {
        ...rest,
        seatIds: [seatId],
        guests: guestsClean,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      };
    }
    return {
      ...s,
      guests: guestsClean,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
    };
  });
  const sessionChannel = new Map(
    sessions.map((s) => [s.id, s.channel] as const),
  );
  const orderItems = state.orderItems.map((o) => {
    if (o.channel) return o;
    return {
      ...o,
      channel: sessionChannel.get(o.sessionId) ?? "table",
    };
  });
  const sales = state.sales.map((sale) => {
    const writeOffs = sale.writeOffs ?? [];
    const lines = (sale.lines ?? []).map((line) =>
      line.channel
        ? line
        : { ...line, channel: sale.channel },
    );
    const taxBreakdown =
      sale.taxBreakdown && sale.taxBreakdown.length > 0
        ? sale.taxBreakdown
        : buildTaxBreakdownFromLines(lines);
    const guests =
      sale.guests !== undefined
        ? migrateLegacyGuests(sale.guests)
        : undefined;
    let tags = sale.tags;
    if ((!tags || tags.length === 0) && guests?.isNewVisit) {
      tags = [{ id: NEW_VISIT_TAG_ID, label: "新規" }];
    }
    const guestsClean = guests
      ? { parties: guests.parties, isNewVisit: undefined }
      : undefined;
    return {
      ...sale,
      guests: guestsClean,
      tags,
      lines,
      writeOffs,
      writeOffTotalTaxIncluded: sale.writeOffTotalTaxIncluded ?? 0,
      subtotalTaxIncluded: sale.subtotalTaxIncluded ?? sale.totalTaxIncluded,
      serviceDiscount: sale.serviceDiscount,
      taxBreakdown,
      taxPolicyVersion: sale.taxPolicyVersion,
    };
  });
  return {
    ...state,
    version: 6,
    sessions,
    orderItems,
    writeOffs: state.writeOffs ?? [],
    sales,
  };
}

/** Effective serving channel for an order line. */
export function orderLineChannel(
  item: Pick<OrderItem, "channel">,
  sessionChannel: SessionChannel,
): SessionChannel {
  return item.channel ?? sessionChannel;
}

export function sessionSeatIds(session: ServiceSession): string[] {
  if (session.seatIds && session.seatIds.length > 0) return session.seatIds;
  if (session.seatId) return [session.seatId];
  return [];
}

export function writeOffQtyForItem(
  writeOffs: WriteOff[],
  orderItemId: string,
): number {
  return writeOffs
    .filter((w) => w.orderItemId === orderItemId)
    .reduce((s, w) => s + w.qty, 0);
}

/** Qty still chargeable after write-offs. */
export function billableQty(order: OrderItem, writeOffs: WriteOff[]): number {
  if (order.status === "canceled") return 0;
  return Math.max(0, order.qty - writeOffQtyForItem(writeOffs, order.id));
}

/** Resolve service discount yen from subtotal (amount wins over percent if both set). */
export function resolveServiceDiscountAmount(
  subtotalTaxIncluded: number,
  input: { percent?: number; amount?: number },
): { mode: "percent" | "amount"; percent?: number; inputAmount?: number; amountTaxIncluded: number } | null {
  const amount = Math.max(0, Math.floor(Number(input.amount) || 0));
  const percent = Math.min(100, Math.max(0, Number(input.percent) || 0));
  if (amount > 0) {
    return {
      mode: "amount",
      inputAmount: amount,
      amountTaxIncluded: Math.min(amount, subtotalTaxIncluded),
    };
  }
  if (percent > 0) {
    const yen = Math.min(
      subtotalTaxIncluded,
      Math.floor((subtotalTaxIncluded * percent) / 100),
    );
    return {
      mode: "percent",
      percent,
      amountTaxIncluded: yen,
    };
  }
  return null;
}
