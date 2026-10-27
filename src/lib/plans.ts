import { getPlanDefinition, type MenuProduct } from "@/data/menu.seed";
import type { PlanDefinition } from "@/domain/menu-catalog";
import type { OrderItem, SessionChannel } from "@/domain/types";
import {
  lineAmounts,
  resolveTaxIncludedUnitPrice,
  resolveTaxRate,
} from "@/lib/pricing";

/** Product IDs covered (¥0) by active plans on the session. */
export function coveredProductIdsForSession(
  orderItems: OrderItem[],
  sessionId: string,
  planDefinitions: PlanDefinition[],
): Set<string> {
  const covered = new Set<string>();
  for (const o of orderItems) {
    if (o.sessionId !== sessionId) continue;
    if (o.status === "canceled") continue;
    const plan = getPlanDefinition(planDefinitions, o.productId);
    if (!plan) continue;
    for (const id of plan.coveredProductIds) covered.add(id);
  }
  return covered;
}

/** Tax-included unit price for the session (0 when covered by a plan). */
export function resolveUnitPriceForSession(
  product: MenuProduct,
  channel: SessionChannel,
  coveredProductIds: Set<string>,
): number {
  if (coveredProductIds.has(product.id)) return 0;
  return resolveTaxIncludedUnitPrice(product, channel);
}

/** Re-apply catalog / plan pricing to open order lines on a session. */
export function repriceSessionOrderItems(
  orderItems: OrderItem[],
  sessionId: string,
  sessionChannel: SessionChannel,
  products: MenuProduct[],
  planDefinitions: PlanDefinition[],
): OrderItem[] {
  const covered = coveredProductIdsForSession(
    orderItems,
    sessionId,
    planDefinitions,
  );
  return orderItems.map((o) => {
    if (o.sessionId !== sessionId || o.status === "canceled") return o;
    if (o.complimentary === true) return o;
    const product = products.find((p) => p.id === o.productId);
    if (!product) return o;
    const channel = o.channel ?? sessionChannel;
    const { taxType, taxRate } = resolveTaxRate(product, channel);
    const unitIn = resolveUnitPriceForSession(product, channel, covered);
    const amounts = lineAmounts(unitIn, taxRate, 1);
    if (
      o.channel === channel &&
      o.unitPriceTaxIncluded === unitIn &&
      o.unitPriceTaxExcluded === amounts.unitTaxExcluded &&
      o.taxRate === taxRate &&
      o.taxType === taxType
    ) {
      return o;
    }
    return {
      ...o,
      channel,
      taxType,
      taxRate,
      unitPriceTaxExcluded: amounts.unitTaxExcluded,
      unitPriceTaxIncluded: unitIn,
    };
  });
}

export function planProductIds(planDefinitions: PlanDefinition[]): Set<string> {
  return new Set(planDefinitions.map((p) => p.productId));
}
