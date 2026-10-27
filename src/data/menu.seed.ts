/**
 * Default menu seed — WELT showcase demo catalog.
 * Source: mothership sheet「リビルドメニュー案」(master-edited).
 * Catalog prices are tax-included (canonical). Tax extraction via tax-policy.
 */
import type {
  MenuCatalog,
  MenuLargeCategory,
  MenuMiddleCategory,
  MenuProduct,
  PlanDefinition,
  TaxType,
} from "@/domain/menu-catalog";
import { migrateMenuCatalog } from "@/domain/menu-catalog";

export type {
  MenuLargeCategory,
  MenuMiddleCategory,
  MenuProduct,
  PlanDefinition,
  TaxType,
} from "@/domain/menu-catalog";

/** Virtual large category for freeform lines (not stored in catalog). */
export const MANUAL_LARGE_CATEGORY_ID = "large_manual";

type SeedProduct = Omit<MenuProduct, "availableChannels"> & {
  availableChannels?: MenuProduct["availableChannels"];
};

export const MENU_LARGE_CATEGORIES: MenuLargeCategory[] = [
  { id: "large_drink", name: "ドリンク", sortOrder: 1, kind: "menu" },
  { id: "large_nonalc", name: "ノンアル", sortOrder: 2, kind: "menu" },
  { id: "large_food", name: "フード", sortOrder: 3, kind: "menu" },
  { id: "large_dessert", name: "デザート", sortOrder: 4, kind: "menu" },
  { id: "large_plan", name: "プラン", sortOrder: 5, kind: "plan" },
];

export const MENU_MIDDLE_CATEGORIES: MenuMiddleCategory[] = [
  { id: "mid_9ef0d374a8", largeCategoryId: "large_food", name: "おつまみ", sortOrder: 1 },
  { id: "mid_2c16c6b1f3", largeCategoryId: "large_food", name: "ごはんもの", sortOrder: 2 },
  { id: "mid_19ee0eca29", largeCategoryId: "large_food", name: "軽食・パスタ", sortOrder: 3 },
  { id: "mid_f84b60073b", largeCategoryId: "large_dessert", name: "スイーツ", sortOrder: 1 },
  { id: "mid_13885db98f", largeCategoryId: "large_drink", name: "サワー", sortOrder: 1 },
  { id: "mid_cb2d8cedf6", largeCategoryId: "large_drink", name: "ウイスキー（グラス）", sortOrder: 2 },
  { id: "mid_3cc79b3dc6", largeCategoryId: "large_drink", name: "ウイスキー（ボトル）", sortOrder: 3 },
  { id: "mid_d063746a4e", largeCategoryId: "large_drink", name: "焼酎（グラス）", sortOrder: 4 },
  { id: "mid_eebce2431a", largeCategoryId: "large_drink", name: "焼酎（ボトル）", sortOrder: 5 },
  { id: "mid_35529b1a5b", largeCategoryId: "large_drink", name: "リキュール・果実酒", sortOrder: 6 },
  { id: "mid_e6e3074586", largeCategoryId: "large_drink", name: "ビール（国産）", sortOrder: 7 },
  { id: "mid_dd56c4d509", largeCategoryId: "large_drink", name: "ビール（輸入）", sortOrder: 8 },
  { id: "mid_23e836783a", largeCategoryId: "large_nonalc", name: "お茶", sortOrder: 1 },
  { id: "mid_b690ede354", largeCategoryId: "large_nonalc", name: "ジュース", sortOrder: 2 },
  { id: "mid_592a1ac2be", largeCategoryId: "large_plan", name: "コース料理", sortOrder: 1 },
  { id: "mid_51fbcc8031", largeCategoryId: "large_plan", name: "飲み放題", sortOrder: 2 },
];

export const MENU_PRODUCTS: SeedProduct[] = [
  { id: "prod_495c3256ba", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "ポテトサラダ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_c17306355b", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "マカロニサラダ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_f81569cda8", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "枝豆", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_c79a0f22f7", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "冷ややっこ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 4, isActive: true },
  { id: "prod_8a333408f8", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "ナチョス", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 5, isActive: true },
  { id: "prod_b6f34e4f4e", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "エビの唐揚げ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 6, isActive: true },
  { id: "prod_31e245c8f7", largeCategoryId: "large_food", middleCategoryId: "mid_9ef0d374a8", name: "ごぼう唐揚げ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 7, isActive: true },
  { id: "prod_639ff06c4d", largeCategoryId: "large_food", middleCategoryId: "mid_2c16c6b1f3", name: "焼き鳥丼", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_959d8f6a28", largeCategoryId: "large_food", middleCategoryId: "mid_2c16c6b1f3", name: "ロコモコ丼", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_b92371fa72", largeCategoryId: "large_food", middleCategoryId: "mid_2c16c6b1f3", name: "ガパオライス", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_d5e0a7f1dc", largeCategoryId: "large_food", middleCategoryId: "mid_2c16c6b1f3", name: "タコライス", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 4, isActive: true },
  { id: "prod_264dd17d19", largeCategoryId: "large_food", middleCategoryId: "mid_2c16c6b1f3", name: "特製キーマカレー", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 5, isActive: true },
  { id: "prod_9258d251cd", largeCategoryId: "large_food", middleCategoryId: "mid_19ee0eca29", name: "ボンゴレ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_f7e09336e5", largeCategoryId: "large_food", middleCategoryId: "mid_19ee0eca29", name: "ボロネーゼ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_a7e4cfc156", largeCategoryId: "large_food", middleCategoryId: "mid_19ee0eca29", name: "アラビアータ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_9e96f4ff1e", largeCategoryId: "large_dessert", middleCategoryId: "mid_f84b60073b", name: "特製日替わりケーキ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_d5904700f7", largeCategoryId: "large_dessert", middleCategoryId: "mid_f84b60073b", name: "パフェ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_c9e0d286d7", largeCategoryId: "large_drink", middleCategoryId: "mid_13885db98f", name: "レモンサワー", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_39ee6eb0b0", largeCategoryId: "large_drink", middleCategoryId: "mid_13885db98f", name: "グレープフルーツサワー", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_a4bd9318b4", largeCategoryId: "large_drink", middleCategoryId: "mid_13885db98f", name: "ウーロンハイ", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_a3e7499750", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "山崎（グラス）", priceTaxIncluded: 1000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_378fcfb99d", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "ジャックダニエル（グラス）", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_58842402e9", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "角（グラス）", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_6ccd2a8352", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "山崎（ボトル）", priceTaxIncluded: 15000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_69a4b7f629", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "ジャックダニエル（ボトル）", priceTaxIncluded: 7000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_d7cbfb98ef", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "角（ボトル）", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_162f9cb156", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "吉四六（グラス）", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_3e42c97e2d", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "いいちこ（グラス）", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_b4754a05cc", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "二階堂（グラス）", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_ea8c7ab304", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "吉四六（ボトル）", priceTaxIncluded: 5000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_ed9c07956a", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "いいちこ（ボトル）", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_9976ba05d6", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "二階堂（ボトル）", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_443e9a9581", largeCategoryId: "large_drink", middleCategoryId: "mid_35529b1a5b", name: "梅酒", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_fa6a3b928e", largeCategoryId: "large_drink", middleCategoryId: "mid_35529b1a5b", name: "カルーア", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_3b594873cb", largeCategoryId: "large_drink", middleCategoryId: "mid_35529b1a5b", name: "マリブ", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_134cda1375", largeCategoryId: "large_drink", middleCategoryId: "mid_e6e3074586", name: "生ビール（キリン）", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_6a226e305a", largeCategoryId: "large_drink", middleCategoryId: "mid_e6e3074586", name: "生ビール（アサヒ）", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_c9ade330a1", largeCategoryId: "large_drink", middleCategoryId: "mid_e6e3074586", name: "瓶ビール（キリン・ラガー）", priceTaxIncluded: 600, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_7565bed161", largeCategoryId: "large_drink", middleCategoryId: "mid_dd56c4d509", name: "ハイネケン", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_acae31bc6f", largeCategoryId: "large_drink", middleCategoryId: "mid_dd56c4d509", name: "コロナ・エキストラ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_d8c333e503", largeCategoryId: "large_nonalc", middleCategoryId: "mid_23e836783a", name: "緑茶", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_d5f4d6bdae", largeCategoryId: "large_nonalc", middleCategoryId: "mid_23e836783a", name: "ウーロン茶", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_e4aa4f34bb", largeCategoryId: "large_nonalc", middleCategoryId: "mid_b690ede354", name: "コーラ", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_b2567fad2f", largeCategoryId: "large_nonalc", middleCategoryId: "mid_b690ede354", name: "オレンジジュース", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_5433692a17", largeCategoryId: "large_plan", middleCategoryId: "mid_592a1ac2be", name: "コース・松", priceTaxIncluded: 6000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_58edb53228", largeCategoryId: "large_plan", middleCategoryId: "mid_592a1ac2be", name: "コース・竹", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_3146d3b653", largeCategoryId: "large_plan", middleCategoryId: "mid_592a1ac2be", name: "コース・梅", priceTaxIncluded: 2500, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_4f1652b247", largeCategoryId: "large_plan", middleCategoryId: "mid_51fbcc8031", name: "オールフリーコース", priceTaxIncluded: 5000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_477de2b5d1", largeCategoryId: "large_plan", middleCategoryId: "mid_51fbcc8031", name: "お手軽飲み放題", priceTaxIncluded: 1500, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
];

export const MENU_PLAN_DEFINITIONS: PlanDefinition[] = [
  { productId: "prod_5433692a17", coveredProductIds: [] },
  { productId: "prod_58edb53228", coveredProductIds: [] },
  { productId: "prod_3146d3b653", coveredProductIds: [] },
  { productId: "prod_4f1652b247", coveredProductIds: [] },
  { productId: "prod_477de2b5d1", coveredProductIds: [] },
];

export function createSeedMenuCatalog(): MenuCatalog {
  return migrateMenuCatalog({
    version: 2,
    largeCategories: [...MENU_LARGE_CATEGORIES],
    middleCategories: [...MENU_MIDDLE_CATEGORIES],
    products: [...MENU_PRODUCTS] as MenuProduct[],
    planDefinitions: [...MENU_PLAN_DEFINITIONS],
  });
}

export function getPlanDefinition(
  planDefinitions: PlanDefinition[],
  productId: string,
): PlanDefinition | undefined {
  return planDefinitions.find((p) => p.productId === productId);
}

export function isPlanProduct(
  planDefinitions: PlanDefinition[],
  productId: string,
): boolean {
  return planDefinitions.some((p) => p.productId === productId);
}
