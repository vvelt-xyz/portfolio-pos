import {
  applyRounding,
  DEFAULT_TAX_POLICY,
  getTaxPolicy,
  rateForTaxType,
  ratesSnapshot,
  type RoundingMode,
} from "@/domain/tax-policy";
import type { TaxType } from "@/domain/menu-catalog";
import type { MenuProduct } from "@/data/menu.seed";
import type { SessionChannel } from "@/domain/types";

export type { RoundingMode } from "@/domain/tax-policy";
export { applyRounding } from "@/domain/tax-policy";

export function resolveTaxRate(
  product: Pick<MenuProduct, "taxType">,
  channel: SessionChannel,
  policy = getTaxPolicy(),
): { taxType: TaxType; taxRate: number } {
  const category =
    policy.categories.find((c) => c.id === product.taxType) ??
    policy.categories.find((c) => c.id === "standard")!;
  const taxRate =
    channel === "table" ? category.dineInRate : category.takeoutRate;

  if (product.taxType === "zero" || taxRate <= 0) {
    return { taxType: "zero", taxRate: 0 };
  }

  const standard = policy.categories.find((c) => c.id === "standard");
  const standardRate =
    channel === "table"
      ? (standard?.dineInRate ?? 0.1)
      : (standard?.takeoutRate ?? 0.1);

  // If dine-in rate equals standard, report as standard for tax breakdown buckets.
  if (channel === "table" && Math.abs(taxRate - standardRate) < 1e-9) {
    return { taxType: "standard", taxRate };
  }

  return { taxType: product.taxType, taxRate };
}

/** Catalog list price (tax-included) for the channel. */
export function resolveTaxIncludedUnitPrice(
  product: Pick<MenuProduct, "priceTaxIncluded" | "priceTaxIncludedTakeout">,
  channel: SessionChannel,
): number {
  if (channel === "takeout" && product.priceTaxIncludedTakeout != null) {
    return product.priceTaxIncludedTakeout;
  }
  return product.priceTaxIncluded;
}

/**
 * 割戻し: extract tax from a tax-included amount using active policy.
 * EN: Rebate extraction — tax = round(P * r/(1+r)); excluded = P - tax.
 */
export function extractTaxFromIncluded(
  taxIncluded: number,
  taxRate: number,
  policy = getTaxPolicy(),
): { taxExcluded: number; taxAmount: number; taxIncluded: number } {
  const included = Math.max(0, Math.floor(taxIncluded));
  if (taxRate <= 0) {
    return { taxExcluded: included, taxAmount: 0, taxIncluded: included };
  }
  if (policy.extractionMethod !== "rebate") {
    throw new Error(`Unsupported extractionMethod: ${policy.extractionMethod}`);
  }
  const taxAmount = applyRounding(
    (included * taxRate) / (1 + taxRate),
    policy.rounding,
  );
  const taxExcluded = included - taxAmount;
  return { taxExcluded, taxAmount, taxIncluded: included };
}

/** Build tax-included from tax-excluded (legacy / display helpers). */
export function toTaxIncluded(
  taxExcluded: number,
  taxRate: number,
  rounding: RoundingMode = getTaxPolicy().rounding,
): number {
  return applyRounding(taxExcluded * (1 + taxRate), rounding);
}

/**
 * Reverse helper for rare cases. Prefer extractTaxFromIncluded for accounting.
 * Kept for migrate of legacy tax-excluded catalogs.
 */
export function toTaxExcluded(
  taxIncluded: number,
  taxRate: number,
  policy = getTaxPolicy(),
): number {
  return extractTaxFromIncluded(taxIncluded, taxRate, policy).taxExcluded;
}

/** Catalog tax rate from taxType only (not channel). For backoffice previews. */
export function catalogTaxRate(
  taxType: TaxType,
  policy = getTaxPolicy(),
): number {
  return rateForTaxType(taxType, policy);
}

/**
 * Line amounts from tax-included unit price.
 * Uses policy.lineTaxBasis (default: rebate on line total).
 */
export function lineAmounts(
  unitTaxIncluded: number,
  taxRate: number,
  qty: number,
  policy = getTaxPolicy(),
) {
  const unitIn = Math.max(0, Math.floor(unitTaxIncluded));
  const unitSplit = extractTaxFromIncluded(unitIn, taxRate, policy);

  if (policy.lineTaxBasis === "line_total") {
    const lineTaxIncluded = unitIn * qty;
    const lineSplit = extractTaxFromIncluded(lineTaxIncluded, taxRate, policy);
    return {
      unitTaxIncluded: unitIn,
      unitTaxExcluded: unitSplit.taxExcluded,
      lineTaxExcluded: lineSplit.taxExcluded,
      lineTaxAmount: lineSplit.taxAmount,
      lineTaxIncluded: lineSplit.taxIncluded,
    };
  }

  throw new Error(`Unsupported lineTaxBasis: ${policy.lineTaxBasis}`);
}

export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

/** Re-export default rates for constants compatibility. */
export const POLICY_RATES = ratesSnapshot(DEFAULT_TAX_POLICY);
