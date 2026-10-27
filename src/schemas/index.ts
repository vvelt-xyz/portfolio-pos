/**
 * Zod schema barrel — re-exports domain schemas used by Firestore converters
 * and validation call sites. Prefer importing from `@/domain/*` for types;
 * this module is the stable entry for “all schemas”.
 */
export {
  BusinessDayOpenSchema,
  BusinessDayCloseSchema,
  BusinessDayDocSchema,
} from "@/domain/business-day";
export {
  FloorCellSchema,
  FloorCategorySchema,
  FloorSeatDefSchema,
  FloorLayoutCatalogSchema,
} from "@/domain/floor-layout";
export {
  GuestGenderSchema,
  GuestAgeBandSchema,
  GuestPartySchema,
  GuestsSchema,
  GuestsInputSchema,
} from "@/domain/guests";
export {
  MenuChannelSchema,
  MenuLargeKindSchema,
  MenuLargeCategorySchema,
  MenuMiddleCategorySchema,
  MenuProductSchema,
  PlanDefinitionSchema,
  MenuCatalogSchema,
} from "@/domain/menu-catalog";
export {
  OpsEventTypeSchema,
  OpsEventSchema,
  OrderBatchSchema,
  SeatStateSchema,
  OpsMetaSchema,
} from "@/domain/ops";
export {
  SessionTagDefSchema,
  SessionTagCatalogSchema,
  FrozenSessionTagSchema,
} from "@/domain/session-tags";
export {
  TaxTypeSchema,
  RoundingModeSchema,
  TaxExtractionMethodSchema,
  LineTaxBasisSchema,
  CatalogPriceBasisSchema,
  TaxCategorySchema,
  TaxPolicySchema,
} from "@/domain/tax-policy";
export {
  SessionChannelSchema,
  OrderStatusSchema,
  PaymentMethodSchema,
  OrderItemSchema,
  ServiceSessionSchema,
  SaleLineSchema,
  SaleTaxBucketSchema,
  WriteOffSchema,
  ServiceDiscountSchema,
  SaleSchema,
  PosStateSchema,
} from "@/domain/types";
