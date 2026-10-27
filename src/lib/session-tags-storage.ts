import {
  DEFAULT_SESSION_TAG_CATALOG,
  migrateSessionTagCatalog,
  type SessionTagCatalog,
} from "@/domain/session-tags";

const STORAGE_KEY = "pos_v1_session_tags";

export function loadSessionTagsLocal(): SessionTagCatalog {
  if (typeof window === "undefined") return DEFAULT_SESSION_TAG_CATALOG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SESSION_TAG_CATALOG);
    return migrateSessionTagCatalog(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SESSION_TAG_CATALOG);
  }
}

export function saveSessionTagsLocal(catalog: SessionTagCatalog): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}
