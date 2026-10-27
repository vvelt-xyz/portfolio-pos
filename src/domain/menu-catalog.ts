import { z } from "zod";
import {
  applyRounding,
  getTaxPolicy,
  rateForTaxType,
  TaxTypeSchema,
  type TaxType,
} from "@/domain/tax-policy";

export { TaxTypeSchema };
export type { TaxType };

export const MenuChannelSchema = z.enum(["table", "takeout"]);
export type MenuChannel = z.infer<typeof MenuChannelSchema>;

export const MenuLargeKindSchema = z.enum(["menu", "plan"]);
export type MenuLargeKind = z.infer<typeof MenuLargeKindSchema>;

export const MenuLargeCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  /** plan = 飲み放題等。配下商品は planDefinitions を持つ。 */
  kind: MenuLargeKindSchema.default("menu"),
});
export type MenuLargeCategory = z.infer<typeof MenuLargeCategorySchema>;

export const MenuMiddleCategorySchema = z.object({
  id: z.string().min(1),
  largeCategoryId: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int(),
});
export type MenuMiddleCategory = z.infer<typeof MenuMiddleCategorySchema>;

export const MenuProductSchema = z.object({
  id: z.string().min(1),
  largeCategoryId: z.string().min(1),
  middleCategoryId: z.string().min(1),
  name: z.string().min(1),
  /** Optional internal SKU / PLU — unique when set. */
  productCode: z.string().optional(),
  /**
   * Canonical unit price (tax included) — matches guest-facing menu.
   * EN: Catalog source of truth is tax-included list price.
   */
  priceTaxIncluded: z.number().min(0),
  /** Optional takeout override (e.g. container), also tax-included. */
  priceTaxIncludedTakeout: z.number().min(0).optional(),
  /** Food cost (tax included) for margin reporting. */
  costTaxIncluded: z.number().min(0).optional(),
  taxType: TaxTypeSchema,
  /** Channels where this SKU appears on the order UI. */
  availableChannels: z
    .array(MenuChannelSchema)
    .min(1)
    .default(["table", "takeout"]),
  /** Internal note (not shown on guest order UI). */
  adminMemo: z.string().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type MenuProduct = z.infer<typeof MenuProductSchema>;

export const PlanDefinitionSchema = z.object({
  productId: z.string().min(1),
  coveredProductIds: z.array(z.string()),
});
export type PlanDefinition = z.infer<typeof PlanDefinitionSchema>;

export const MenuCatalogSchema = z.object({
  version: z.literal(2),
  largeCategories: z.array(MenuLargeCategorySchema),
  middleCategories: z.array(MenuMiddleCategorySchema),
  products: z.array(MenuProductSchema),
  planDefinitions: z.array(PlanDefinitionSchema),
});
export type MenuCatalog = z.infer<typeof MenuCatalogSchema>;

/** Legacy / in-flight product rows before migrate. */
type RawMenuProduct = Partial<MenuProduct> & {
  id: string;
  largeCategoryId: string;
  middleCategoryId: string;
  name: string;
  taxType: TaxType;
  sortOrder: number;
  isActive: boolean;
  /** @deprecated legacy tax-excluded catalog */
  priceTaxExcluded?: number;
  priceTaxExcludedTakeout?: number;
  costTaxExcluded?: number;
  forceStandardTax?: boolean;
};

function coerceTaxIncludedPrice(
  included: number | undefined,
  excluded: number | undefined,
  taxType: TaxType,
): number {
  if (typeof included === "number" && Number.isFinite(included)) {
    return Math.max(0, included);
  }
  if (typeof excluded === "number" && Number.isFinite(excluded)) {
    const rate = rateForTaxType(taxType);
    return applyRounding(excluded * (1 + rate), getTaxPolicy().rounding);
  }
  return 0;
}

export function migrateMenuProduct(raw: RawMenuProduct): MenuProduct {
  const { forceStandardTax: _removed, ...rest } = raw;
  const availableChannels =
    rest.availableChannels && rest.availableChannels.length > 0
      ? rest.availableChannels
      : raw.id === "prod_bento_takeout"
        ? (["takeout"] as MenuChannel[])
        : (["table", "takeout"] as MenuChannel[]);

  const priceTaxIncluded = coerceTaxIncludedPrice(
    rest.priceTaxIncluded,
    rest.priceTaxExcluded,
    rest.taxType,
  );
  const priceTaxIncludedTakeout =
    rest.priceTaxIncludedTakeout != null ||
    rest.priceTaxExcludedTakeout != null
      ? coerceTaxIncludedPrice(
          rest.priceTaxIncludedTakeout,
          rest.priceTaxExcludedTakeout,
          rest.taxType,
        )
      : undefined;
  const costTaxIncluded = coerceTaxIncludedPrice(
    rest.costTaxIncluded,
    rest.costTaxExcluded,
    rest.taxType,
  );

  const product: MenuProduct = {
    id: rest.id,
    largeCategoryId: rest.largeCategoryId,
    middleCategoryId: rest.middleCategoryId,
    name: rest.name,
    priceTaxIncluded,
    costTaxIncluded,
    taxType: rest.taxType,
    availableChannels,
    sortOrder: rest.sortOrder,
    isActive: rest.isActive,
  };
  if (rest.productCode) product.productCode = rest.productCode;
  if (priceTaxIncludedTakeout != null) {
    product.priceTaxIncludedTakeout = priceTaxIncludedTakeout;
  }
  if (rest.adminMemo) product.adminMemo = rest.adminMemo;
  return product;
}

export function migrateMenuCatalog(
  catalog: Omit<MenuCatalog, "version" | "products"> & {
    version?: number;
    products: RawMenuProduct[];
    planDefinitions: PlanDefinition[];
  },
): MenuCatalog {
  const largeCategories = catalog.largeCategories.map((c) => ({
    ...c,
    // Zod default("menu") can mask missing kind on legacy large_plan rows.
    kind: isPlanLargeCategory(c) ? ("plan" as const) : ("menu" as const),
  }));
  const products = catalog.products.map((p) => migrateMenuProduct(p));
  const productIds = new Set(products.map((p) => p.id));
  const planLargeIds = new Set(
    largeCategories.filter((c) => isPlanLargeCategory(c)).map((c) => c.id),
  );
  const planProductIds = new Set(
    products.filter((p) => planLargeIds.has(p.largeCategoryId)).map((p) => p.id),
  );

  let planDefinitions = catalog.planDefinitions
    .filter((d) => productIds.has(d.productId))
    .map((d) => ({
      ...d,
      coveredProductIds: d.coveredProductIds.filter((id) => productIds.has(id)),
    }));

  for (const productId of planProductIds) {
    if (!planDefinitions.some((d) => d.productId === productId)) {
      planDefinitions = [
        ...planDefinitions,
        { productId, coveredProductIds: [] },
      ];
    }
  }
  planDefinitions = planDefinitions.filter((d) => planProductIds.has(d.productId));

  return {
    version: 2,
    largeCategories,
    middleCategories: catalog.middleCategories,
    products,
    planDefinitions,
  };
}

export function isPlanLargeCategory(
  large: Pick<MenuLargeCategory, "kind" | "id">,
): boolean {
  return large.kind === "plan" || large.id === "large_plan";
}
