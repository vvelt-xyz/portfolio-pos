/**
 * Floor seed compatibility + session palette.
 * Live layout comes from FloorProvider via setActiveFloorLayout.
 * Helpers fall back to DEFAULT_FLOOR_LAYOUT until the provider boots.
 */
import {
  DEFAULT_FLOOR_LAYOUT,
  formatSeatLabelsFromCatalog,
  resolveFloorSeat,
  totalCapacityFromCatalog,
  type FloorLayoutCatalog,
  type ResolvedFloorSeat,
} from "@/domain/floor-layout";

export type { FloorLayoutCatalog, ResolvedFloorSeat };
export {
  DEFAULT_FLOOR_LAYOUT,
  formatFloorSeatLabel,
  resolveAllFloorSeats,
  resolveFloorSeat,
} from "@/domain/floor-layout";

/** @deprecated Prefer ResolvedFloorSeat from floor-layout; kept for gradual migration. */
export type FloorSeatKind = "bar" | "table";

/** @deprecated Prefer ResolvedFloorSeat. */
export type FloorSeat = {
  id: string;
  code: string;
  label: string;
  kind: FloorSeatKind;
  capacity: number;
  gridColumn: string;
  gridRow: string;
};

let activeLayout: FloorLayoutCatalog = structuredClone(DEFAULT_FLOOR_LAYOUT);

export function setActiveFloorLayout(layout: FloorLayoutCatalog): void {
  activeLayout = layout;
}

export function getActiveFloorLayout(): FloorLayoutCatalog {
  return activeLayout;
}

function kindFromCategoryName(name: string): FloorSeatKind {
  return name.includes("バー") || name.toLowerCase().includes("bar")
    ? "bar"
    : "table";
}

function toLegacySeat(resolved: ResolvedFloorSeat): FloorSeat {
  return {
    id: resolved.id,
    code: resolved.code,
    label: resolved.label,
    kind: kindFromCategoryName(resolved.categoryName),
    capacity: resolved.capacity,
    gridColumn: String(resolved.bounds.minCol + 1),
    gridRow: String(resolved.bounds.minRow + 1),
  };
}

/** Snapshot of seats from the active layout (legacy shape). */
export function getFloorSeats(): FloorSeat[] {
  return activeLayout.seats
    .map((s) => resolveFloorSeat(activeLayout, s.id))
    .filter((s): s is ResolvedFloorSeat => Boolean(s))
    .map(toLegacySeat);
}

/** @deprecated Use getFloorSeats() — static export kept for rare direct imports. */
export const FLOOR_SEATS: FloorSeat[] = getFloorSeats();

/** @deprecated Layout tracks are derived from catalog grid; kept for takeout column align. */
export const FLOOR_LAYOUT = {
  columns: "repeat(5, minmax(0, 1fr))",
  rows: "4.75rem 3.5rem 3.5rem 3.5rem",
} as const;

/** Distinct colors per concurrent open session (table/bar). */
export const SESSION_PALETTE = [
  { card: "bg-sky-700", ring: "ring-sky-300", chip: "bg-sky-100 text-sky-900" },
  { card: "bg-violet-700", ring: "ring-violet-300", chip: "bg-violet-100 text-violet-900" },
  { card: "bg-rose-700", ring: "ring-rose-300", chip: "bg-rose-100 text-rose-900" },
  { card: "bg-amber-700", ring: "ring-amber-300", chip: "bg-amber-100 text-amber-950" },
  { card: "bg-teal-700", ring: "ring-teal-300", chip: "bg-teal-100 text-teal-900" },
  { card: "bg-indigo-700", ring: "ring-indigo-300", chip: "bg-indigo-100 text-indigo-900" },
] as const;

export function getFloorSeat(seatId: string): FloorSeat | undefined {
  const resolved = resolveFloorSeat(activeLayout, seatId);
  return resolved ? toLegacySeat(resolved) : undefined;
}

export function getResolvedFloorSeat(
  seatId: string,
): ResolvedFloorSeat | undefined {
  return resolveFloorSeat(activeLayout, seatId);
}

/** Join current floor labels for seat ids (always live from active layout). */
export function formatSeatLabels(seatIds: string[]): string {
  return formatSeatLabelsFromCatalog(activeLayout, seatIds);
}

/**
 * Display label for a session: prefer live labels from seatIds.
 * Falls back to frozen seatLabel (e.g. takeout / legacy).
 * EN: Ops UI always shows current floor names; snapshot is fallback only.
 */
export function resolveSessionSeatLabel(input: {
  seatIds?: string[];
  seatId?: string;
  seatLabel?: string;
}): string {
  const ids =
    input.seatIds && input.seatIds.length > 0
      ? input.seatIds
      : input.seatId
        ? [input.seatId]
        : [];
  if (ids.length > 0) {
    const live = formatSeatLabels(ids);
    if (live) return live;
  }
  return input.seatLabel?.trim() || "";
}

export function totalCapacity(seatIds: string[]): number {
  return totalCapacityFromCatalog(activeLayout, seatIds);
}
