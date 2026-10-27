/**
 * Default menu seed — sheet import + plan tree.
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
  { id: "mid_986aaace2a", largeCategoryId: "large_food", name: "海賊のおつまみ", sortOrder: 1 },
  { id: "mid_56a0e51dac", largeCategoryId: "large_food", name: "ガッツリ海賊メシ", sortOrder: 2 },
  { id: "mid_d92855663a", largeCategoryId: "large_food", name: "サクッとメシ", sortOrder: 3 },
  { id: "mid_8f6075de53", largeCategoryId: "large_dessert", name: "宝探しのデザート", sortOrder: 1 },
  { id: "mid_13885db98f", largeCategoryId: "large_drink", name: "サワー", sortOrder: 1 },
  { id: "mid_cb2d8cedf6", largeCategoryId: "large_drink", name: "ウイスキー（グラス）", sortOrder: 2 },
  { id: "mid_3cc79b3dc6", largeCategoryId: "large_drink", name: "ウイスキー（ボトル）", sortOrder: 3 },
  { id: "mid_d063746a4e", largeCategoryId: "large_drink", name: "焼酎（グラス）", sortOrder: 4 },
  { id: "mid_eebce2431a", largeCategoryId: "large_drink", name: "焼酎（ボトル）", sortOrder: 5 },
  { id: "mid_8935ae61a8", largeCategoryId: "large_drink", name: "果実酒その他", sortOrder: 6 },
  { id: "mid_59e798c633", largeCategoryId: "large_drink", name: "世界のビール", sortOrder: 7 },
  { id: "mid_23e836783a", largeCategoryId: "large_nonalc", name: "お茶", sortOrder: 1 },
  { id: "mid_b690ede354", largeCategoryId: "large_nonalc", name: "ジュース", sortOrder: 2 },
  { id: "mid_plan_course", largeCategoryId: "large_plan", name: "コース料理", sortOrder: 1 },
  { id: "mid_plan_nomihodai", largeCategoryId: "large_plan", name: "飲み放題", sortOrder: 2 },
];

export const MENU_PRODUCTS: SeedProduct[] = [
  { id: "prod_45e3ddb9ff", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "ポテトサラダ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_ffec6cfa90", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "明太ポテサラ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_afb02cb96e", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "マカロニサラダ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_4748257d25", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "おつまみパスタ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 4, isActive: true },
  { id: "prod_3e175507f1", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "枝豆", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 5, isActive: true },
  { id: "prod_91a1bdc8aa", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "なすのたたき", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 6, isActive: true },
  { id: "prod_8335483a43", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "ケサギィーヤ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 7, isActive: true },
  { id: "prod_96f90cf2cd", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "タコのチャンジャ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 8, isActive: true },
  { id: "prod_59e689b34e", largeCategoryId: "large_food", middleCategoryId: "mid_986aaace2a", name: "ごぼう唐揚げ", priceTaxIncluded: 330, costTaxIncluded: 0, taxType: "reduced", sortOrder: 9, isActive: true },
  { id: "prod_4370f13ccb", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "ガーリックライス", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_5b587ffcd7", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "ガパオライス", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_b6be0d7eb1", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "タコライス", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_90e55d3296", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "シーフードカレー", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 4, isActive: true },
  { id: "prod_84581b7fbe", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "キーマカレー", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 5, isActive: true },
  { id: "prod_a08321cb9b", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "シーフードピラフ", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 6, isActive: true },
  { id: "prod_3248798281", largeCategoryId: "large_food", middleCategoryId: "mid_56a0e51dac", name: "ロコモコ", priceTaxIncluded: 880, costTaxIncluded: 0, taxType: "reduced", sortOrder: 7, isActive: true },
  { id: "prod_6e32211b26", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "ポテト（クリームチーズ添え）", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_0ccba0aef7", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "明太うどん", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_057e5e9bfa", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "シーザーサラダ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 3, isActive: true },
  { id: "prod_bf4a10b191", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "アメスパ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 4, isActive: true },
  { id: "prod_72ed4dd1a1", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "ボンゴレ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 5, isActive: true },
  { id: "prod_80a10989f1", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "ボロネーゼ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 6, isActive: true },
  { id: "prod_26790eb251", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "アラビアータ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 7, isActive: true },
  { id: "prod_0a2b66bc31", largeCategoryId: "large_food", middleCategoryId: "mid_d92855663a", name: "オムナポ", priceTaxIncluded: 770, costTaxIncluded: 0, taxType: "reduced", sortOrder: 8, isActive: true },
  { id: "prod_5b46d8d299", largeCategoryId: "large_dessert", middleCategoryId: "mid_8f6075de53", name: "船長特性あんバタクロワッサン", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_ab3c1935b5", largeCategoryId: "large_dessert", middleCategoryId: "mid_8f6075de53", name: "エッグワッフル", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_c9e0d286d7", largeCategoryId: "large_drink", middleCategoryId: "mid_13885db98f", name: "レモンサワー", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_fafaea668d", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "山崎", priceTaxIncluded: 1000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_c89fb620fa", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "ジャックダニエル", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_aafa99a95c", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "角", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_f67ef129af", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "デュワーズ", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 4, isActive: true },
  { id: "prod_354088f71c", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "ジムビーム", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 5, isActive: true },
  { id: "prod_0ddb65c919", largeCategoryId: "large_drink", middleCategoryId: "mid_cb2d8cedf6", name: "ホワイトホース", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 6, isActive: true },
  { id: "prod_6b157b116f", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "山崎", priceTaxIncluded: 15000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_d0951bdb51", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "ジャックダニエル", priceTaxIncluded: 7000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_34e18ee2fd", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "角", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_165d6c0c1f", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "デュワーズ", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 4, isActive: true },
  { id: "prod_a4c409e2bc", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "ジムビーム", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 5, isActive: true },
  { id: "prod_487361b804", largeCategoryId: "large_drink", middleCategoryId: "mid_3cc79b3dc6", name: "ホワイトホース", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 6, isActive: true },
  { id: "prod_8c9b786453", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "吉四六", priceTaxIncluded: 500, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_786456656f", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "田苑", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_4c1a8635e3", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "金宮", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_8fd57a3694", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "神の河", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 4, isActive: true },
  { id: "prod_94ca61a9c9", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "いいちこ", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 5, isActive: true },
  { id: "prod_132d0c6d63", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "二階堂", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 6, isActive: true },
  { id: "prod_6745f47294", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "JJ", priceTaxIncluded: 300, costTaxIncluded: 0, taxType: "standard", sortOrder: 7, isActive: true },
  { id: "prod_d9642e607b", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "霧島（シングル）", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 8, isActive: true },
  { id: "prod_6e5af4b6b7", largeCategoryId: "large_drink", middleCategoryId: "mid_d063746a4e", name: "霧島（ダブル）", priceTaxIncluded: 600, costTaxIncluded: 0, taxType: "standard", sortOrder: 9, isActive: true },
  { id: "prod_70735c0038", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "吉四六", priceTaxIncluded: 5000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_62cc5d0fc4", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "田苑", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_77f11a9204", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "金宮", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_3003e7f2a2", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "神の河", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 4, isActive: true },
  { id: "prod_43b228b027", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "いいちこ", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 5, isActive: true },
  { id: "prod_a47424b971", largeCategoryId: "large_drink", middleCategoryId: "mid_eebce2431a", name: "二階堂", priceTaxIncluded: 3000, costTaxIncluded: 0, taxType: "standard", sortOrder: 6, isActive: true },
  { id: "prod_00c7dbd388", largeCategoryId: "large_drink", middleCategoryId: "mid_8935ae61a8", name: "梅酒", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_5c8dfb6625", largeCategoryId: "large_drink", middleCategoryId: "mid_8935ae61a8", name: "カルーア", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_0337fcd24f", largeCategoryId: "large_drink", middleCategoryId: "mid_8935ae61a8", name: "マリブ", priceTaxIncluded: 400, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_2ae9adbeb3", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ハイネケン", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_71c4fd2ab4", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "サタン・ゴールド", priceTaxIncluded: 1000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_7411f4e207", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "デリリウム・トレメンス", priceTaxIncluded: 1200, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_0f59a92a3d", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "デュベル", priceTaxIncluded: 1200, costTaxIncluded: 0, taxType: "standard", sortOrder: 4, isActive: true },
  { id: "prod_d70e28cf73", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "コロナ・エキストラ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 5, isActive: true },
  { id: "prod_7c722c9f31", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "リンデマンス・ペシェリーゼ", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 6, isActive: true },
  { id: "prod_089eac5304", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "リンデマンス・クリーク", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 7, isActive: true },
  { id: "prod_0a32ae7dc8", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "シンハー", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 8, isActive: true },
  { id: "prod_52c7bce1be", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "コナ・ビッグウェーブ", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 9, isActive: true },
  { id: "prod_f9fd854bca", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "コナ・ロングボード", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 10, isActive: true },
  { id: "prod_16deecea16", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ヒナノ・タヒチ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 11, isActive: true },
  { id: "prod_d8f5fa5b39", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ピルスナー・ウルケル", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 12, isActive: true },
  { id: "prod_b63e235c2a", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ソル", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 13, isActive: true },
  { id: "prod_1e793a63ec", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ビットブルガー", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 14, isActive: true },
  { id: "prod_a436405d43", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "パブスト・ブルーリボン", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 15, isActive: true },
  { id: "prod_7aeeb183fb", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ビッラ・モレッティ", priceTaxIncluded: 550, costTaxIncluded: 0, taxType: "standard", sortOrder: 16, isActive: true },
  { id: "prod_6c0fab449a", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "リーフマンス・フル－ツ", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 17, isActive: true },
  { id: "prod_6b0e6efdf3", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ギネス・オリジナル", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 18, isActive: true },
  { id: "prod_5ad8b1c61c", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ライオン・スタウト", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 19, isActive: true },
  { id: "prod_e0c958396b", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ケストリッツァー・シュヴァルツビア", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 20, isActive: true },
  { id: "prod_6c74cc5d7c", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "クーパーズ・ベスト・エクストラ・スタウト", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 21, isActive: true },
  { id: "prod_a24e9affde", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "ヴァルシュタイナー", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 22, isActive: true },
  { id: "prod_453d37f28c", largeCategoryId: "large_drink", middleCategoryId: "mid_59e798c633", name: "パウラーナー・ヴァイスビア", priceTaxIncluded: 680, costTaxIncluded: 0, taxType: "standard", sortOrder: 23, isActive: true },
  { id: "prod_d8c333e503", largeCategoryId: "large_nonalc", middleCategoryId: "mid_23e836783a", name: "緑茶", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_d5f4d6bdae", largeCategoryId: "large_nonalc", middleCategoryId: "mid_23e836783a", name: "ウーロン茶", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_e4aa4f34bb", largeCategoryId: "large_nonalc", middleCategoryId: "mid_b690ede354", name: "コーラ", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 1, isActive: true },
  { id: "prod_b2567fad2f", largeCategoryId: "large_nonalc", middleCategoryId: "mid_b690ede354", name: "オレンジジュース", priceTaxIncluded: 200, costTaxIncluded: 0, taxType: "reduced", sortOrder: 2, isActive: true },
  { id: "prod_plan_course_matsu", largeCategoryId: "large_plan", middleCategoryId: "mid_plan_course", name: "松", priceTaxIncluded: 6000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_plan_course_take", largeCategoryId: "large_plan", middleCategoryId: "mid_plan_course", name: "竹", priceTaxIncluded: 4000, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
  { id: "prod_plan_course_ume", largeCategoryId: "large_plan", middleCategoryId: "mid_plan_course", name: "梅", priceTaxIncluded: 2500, costTaxIncluded: 0, taxType: "standard", sortOrder: 3, isActive: true },
  { id: "prod_plan_nomihodai_foreign", largeCategoryId: "large_plan", middleCategoryId: "mid_plan_nomihodai", name: "外国ビール飲み放題", priceTaxIncluded: 5000, costTaxIncluded: 0, taxType: "standard", sortOrder: 1, isActive: true },
  { id: "prod_plan_nomihodai_easy", largeCategoryId: "large_plan", middleCategoryId: "mid_plan_nomihodai", name: "お手軽飲み放題", priceTaxIncluded: 1500, costTaxIncluded: 0, taxType: "standard", sortOrder: 2, isActive: true },
];

export const MENU_PLAN_DEFINITIONS: PlanDefinition[] = [
  { productId: "prod_plan_course_matsu", coveredProductIds: [] },
  { productId: "prod_plan_course_take", coveredProductIds: [] },
  { productId: "prod_plan_course_ume", coveredProductIds: [] },
  { productId: "prod_plan_nomihodai_foreign", coveredProductIds: [] },
  { productId: "prod_plan_nomihodai_easy", coveredProductIds: [] },
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
