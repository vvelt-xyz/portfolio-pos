/**
 * System-wide consumption-tax policy (single source of truth).
 *
 * MUST: Rates and category definitions live here / settings master — not in UI components.
 * EN: Keep tax rates/categories centralized for law changes.
 *
 * Docs index: docs/tax/README.md (applied rules: docs/tax/applied-rules.md).
 * This is an implementation contract, not tax advice. Confirm with a tax advisor.
 */
import { z } from "zod";

export const TaxTypeSchema = z.enum(["standard", "reduced", "zero"]);
export type TaxType = z.infer<typeof TaxTypeSchema>;

export const RoundingModeSchema = z.enum(["floor", "ceil", "round"]);
export type RoundingMode = z.infer<typeof RoundingModeSchema>;

export function applyRounding(value: number, mode: RoundingMode): number {
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "round") return Math.round(value);
  return Math.floor(value);
}

/** How tax is derived from a tax-included amount. */
export const TaxExtractionMethodSchema = z.enum([
  /** 割戻し: tax = round(included * rate / (1+rate)); excluded = included - tax */
  "rebate",
]);
export type TaxExtractionMethod = z.infer<typeof TaxExtractionMethodSchema>;

/** Where rebate rounding is applied for quantity lines. */
export const LineTaxBasisSchema = z.enum([
  /** Apply rebate to (unitTaxIncluded * qty). */
  "line_total",
]);
export type LineTaxBasis = z.infer<typeof LineTaxBasisSchema>;

export const CatalogPriceBasisSchema = z.enum(["tax_included"]);
export type CatalogPriceBasis = z.infer<typeof CatalogPriceBasisSchema>;

/** Editable tax category (product.taxType references id). */
export const TaxCategorySchema = z.object({
  id: TaxTypeSchema,
  /** Display name in backoffice / order UI. */
  name: z.string().min(1),
  /** Rate applied for dine-in (table) sessions. */
  dineInRate: z.number().min(0),
  /** Rate applied for takeout sessions. */
  takeoutRate: z.number().min(0),
});
export type TaxCategory = z.infer<typeof TaxCategorySchema>;

export const TaxPolicySchema = z.object({
  /** Bump when rates or calculation contract change (audit / migrations). */
  version: z.string().min(1),
  catalogPriceBasis: CatalogPriceBasisSchema,
  extractionMethod: TaxExtractionMethodSchema,
  lineTaxBasis: LineTaxBasisSchema,
  /**
   * 1円未満の端数処理。既定は切捨て（国税通則法119条の方向に整合しやすい実務）。
   * EN: Default floor aligns with National Tax common practice.
   */
  rounding: RoundingModeSchema,
  categories: z.array(TaxCategorySchema).min(1),
  /**
   * 客向け価格表示。運用は税込のみ（設定 UI なし。migrate で tax_included に固定）。
   * EN: Tax-included only in product; tax_excluded coerced on migrate.
   */
  guestPriceDisplay: z.enum(["tax_included", "tax_excluded"]),
  /**
   * Order menu chrome: A=tabs (horizontal larges), B=tree (VS-like sidebar).
   * EN: Staff UI preference for order catalog browsing.
   */
  orderMenuLayout: z.enum(["tabs", "tree"]).default("tabs"),
  /**
   * 営業日の切替時刻（0–23、Asia/Tokyo）。この時刻未満は前日の営業日。
   * EN: Hour (0–23) when the business date rolls forward in Asia/Tokyo.
   */
  businessDayCutoffHour: z.number().int().min(0).max(23),
});
export type TaxPolicy = z.infer<typeof TaxPolicySchema>;

export type OrderMenuLayout = TaxPolicy["orderMenuLayout"];

/** Legacy shape (pre-categories) for migrate. */
type LegacyTaxPolicy = Partial<TaxPolicy> & {
  rates?: { standard?: number; reduced?: number; zero?: number };
  dineInForcesStandard?: boolean;
};

export const DEFAULT_TAX_CATEGORIES: TaxCategory[] = [
  {
    id: "standard",
    name: "酒類・標準",
    dineInRate: 0.1,
    takeoutRate: 0.1,
  },
  {
    id: "reduced",
    name: "飲食料品（軽減対象）",
    dineInRate: 0.1,
    takeoutRate: 0.08,
  },
  {
    id: "zero",
    name: "非課税",
    dineInRate: 0,
    takeoutRate: 0,
  },
];

/**
 * Active policy defaults. Settings master / Firestore can override via setTaxPolicy.
 */
export const DEFAULT_TAX_POLICY: TaxPolicy = TaxPolicySchema.parse({
  version: "2026.2-jp-consumption-tax",
  catalogPriceBasis: "tax_included",
  extractionMethod: "rebate",
  lineTaxBasis: "line_total",
  rounding: "floor",
  categories: DEFAULT_TAX_CATEGORIES,
  guestPriceDisplay: "tax_included",
  orderMenuLayout: "tabs",
  businessDayCutoffHour: 5,
});

let activeTaxPolicy: TaxPolicy = DEFAULT_TAX_POLICY;

export function migrateTaxPolicy(raw: unknown): TaxPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_TAX_POLICY;
  const legacy = raw as LegacyTaxPolicy;
  if (Array.isArray(legacy.categories) && legacy.categories.length > 0) {
    return TaxPolicySchema.parse({
      ...DEFAULT_TAX_POLICY,
      ...legacy,
      // MUST: Tax-excluded guest display is not offered — coerce legacy values.
      // EN: Always tax_included regardless of stored guestPriceDisplay.
      guestPriceDisplay: "tax_included",
      categories: legacy.categories,
      orderMenuLayout:
        legacy.orderMenuLayout === "tree" || legacy.orderMenuLayout === "tabs"
          ? legacy.orderMenuLayout
          : DEFAULT_TAX_POLICY.orderMenuLayout,
      businessDayCutoffHour:
        legacy.businessDayCutoffHour ??
        DEFAULT_TAX_POLICY.businessDayCutoffHour,
    });
  }
  const rates = legacy.rates ?? {};
  const dineInForces = legacy.dineInForcesStandard !== false;
  const standard = rates.standard ?? 0.1;
  const reduced = rates.reduced ?? 0.08;
  const zero = rates.zero ?? 0;
  return TaxPolicySchema.parse({
    version: legacy.version ?? DEFAULT_TAX_POLICY.version,
    catalogPriceBasis: legacy.catalogPriceBasis ?? "tax_included",
    extractionMethod: legacy.extractionMethod ?? "rebate",
    lineTaxBasis: legacy.lineTaxBasis ?? "line_total",
    rounding: legacy.rounding ?? "floor",
    guestPriceDisplay: "tax_included",
    orderMenuLayout:
      legacy.orderMenuLayout === "tree" || legacy.orderMenuLayout === "tabs"
        ? legacy.orderMenuLayout
        : DEFAULT_TAX_POLICY.orderMenuLayout,
    businessDayCutoffHour:
      legacy.businessDayCutoffHour ?? DEFAULT_TAX_POLICY.businessDayCutoffHour,
    categories: [
      {
        id: "standard",
        name: "酒類・標準",
        dineInRate: standard,
        takeoutRate: standard,
      },
      {
        id: "reduced",
        name: "飲食料品（軽減対象）",
        dineInRate: dineInForces ? standard : reduced,
        takeoutRate: reduced,
      },
      {
        id: "zero",
        name: "非課税",
        dineInRate: zero,
        takeoutRate: zero,
      },
    ],
  });
}

/** Read the active tax policy (runtime override from settings). */
export function getTaxPolicy(): TaxPolicy {
  return activeTaxPolicy;
}

/** Replace active policy (settings master / boot load). Validates with Zod. */
export function setTaxPolicy(policy: TaxPolicy): void {
  activeTaxPolicy = TaxPolicySchema.parse(migrateTaxPolicy(policy));
}

export function resetTaxPolicy(): void {
  activeTaxPolicy = DEFAULT_TAX_POLICY;
}

export function getTaxCategory(
  taxType: TaxType,
  policy: TaxPolicy = getTaxPolicy(),
): TaxCategory {
  return (
    policy.categories.find((c) => c.id === taxType) ??
    policy.categories[0] ??
    DEFAULT_TAX_CATEGORIES[0]
  );
}

/** Nominal rate for catalog previews (use takeout rate of the category). */
export function rateForTaxType(
  taxType: TaxType,
  policy: TaxPolicy = getTaxPolicy(),
): number {
  return getTaxCategory(taxType, policy).takeoutRate;
}

/** Compatibility rates object for older helpers. */
export function ratesSnapshot(policy: TaxPolicy = getTaxPolicy()): {
  standard: number;
  reduced: number;
  zero: number;
} {
  return {
    standard: getTaxCategory("standard", policy).takeoutRate,
    reduced: getTaxCategory("reduced", policy).takeoutRate,
    zero: getTaxCategory("zero", policy).takeoutRate,
  };
}

export function taxTypeLabel(
  taxType: TaxType,
  policy: TaxPolicy = getTaxPolicy(),
): string {
  return getTaxCategory(taxType, policy).name;
}
