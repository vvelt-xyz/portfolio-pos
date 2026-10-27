import {
  emptyPosState,
  migratePosState,
  PosStateSchema,
  type PosState,
} from "@/domain/types";

const STORAGE_KEY = "pos_v1_state";

export function loadPosState(): PosState {
  if (typeof window === "undefined") return emptyPosState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPosState();
    const parsed = PosStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("Invalid POS state; resetting", parsed.error);
      return emptyPosState();
    }
    return migratePosState(parsed.data);
  } catch {
    return emptyPosState();
  }
}

export function savePosState(state: PosState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migratePosState(state)));
}

export function clearPosState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
