import {
  DEFAULT_FLOOR_LAYOUT,
  migrateFloorLayoutCatalog,
  type FloorLayoutCatalog,
} from "@/domain/floor-layout";

const STORAGE_KEY = "pos_v1_floor_layout";

export function loadFloorLayoutLocal(): FloorLayoutCatalog {
  if (typeof window === "undefined") return structuredClone(DEFAULT_FLOOR_LAYOUT);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_FLOOR_LAYOUT);
    return migrateFloorLayoutCatalog(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_FLOOR_LAYOUT);
  }
}

export function saveFloorLayoutLocal(catalog: FloorLayoutCatalog): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}
