import {
  MenuCatalogSchema,
  migrateMenuCatalog,
  type MenuCatalog,
} from "@/domain/menu-catalog";
import { createSeedMenuCatalog } from "@/data/menu.seed";

const STORAGE_KEY = "pos_v1_menu_catalog";

export type LoadMenuCatalogResult = {
  catalog: MenuCatalog;
  /** True when stored JSON was missing/invalid — in-memory seed, not yet written. */
  loadError: boolean;
};

export function loadMenuCatalog(): LoadMenuCatalogResult {
  if (typeof window === "undefined") {
    return { catalog: createSeedMenuCatalog(), loadError: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { catalog: createSeedMenuCatalog(), loadError: false };
    const parsed = MenuCatalogSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("Invalid menu catalog; using seed in memory", parsed.error);
      return { catalog: createSeedMenuCatalog(), loadError: true };
    }
    return {
      catalog: migrateMenuCatalog(parsed.data),
      loadError: false,
    };
  } catch {
    return { catalog: createSeedMenuCatalog(), loadError: true };
  }
}

export function saveMenuCatalog(catalog: MenuCatalog): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(migrateMenuCatalog(catalog)),
  );
}

export function clearMenuCatalog(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
