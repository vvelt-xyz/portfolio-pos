/**
 * Floor layout master (L1): categories (shape templates) + stamped seats on a cell grid.
 * MUST: Seat `id` stays stable across layout/number edits (ops seat lock keys).
 * EN: Never rename seat ids when editing layout or numbers.
 */
import { z } from "zod";

export const FloorCellSchema = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});
export type FloorCell = z.infer<typeof FloorCellSchema>;

export const FloorCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
  /** Default guest capacity when stamping a seat. */
  capacity: z.number().int().min(1),
  /** Relative polyomino cells (normalized so min col/row is 0). */
  cells: z.array(FloorCellSchema).min(1),
});
export type FloorCategory = z.infer<typeof FloorCategorySchema>;

export const FloorSeatDefSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  /** Display number within category (e.g. テーブル「1」). */
  number: z.number().int().min(1),
  capacity: z.number().int().min(1),
  /** Anchor = top-left of the category shape's bounding box on the floor grid. */
  anchorCol: z.number().int().min(0),
  anchorRow: z.number().int().min(0),
});
export type FloorSeatDef = z.infer<typeof FloorSeatDefSchema>;

export const FloorLayoutCatalogSchema = z.object({
  version: z.number().int().min(1),
  gridCols: z.number().int().min(4).max(96),
  gridRows: z.number().int().min(4).max(96),
  /** Live + editor canvas max width (mobile-friendly). */
  /**
   * Settings editor map max width (px). Live floor fills the responsive shell
   * and does not nest-shrink to this value.
   * EN: Editor canvas cap only; ops board is full shell width.
   */
  maxCanvasWidthPx: z.number().int().min(320).max(960),
  /**
   * Live floor board base height (rem). Deploy reference ≈ 15.5.
   * Live UI clamps upward with viewport; settings preview uses this as-is.
   * EN: Base rem; live floor fluid-grows, editor preview fixed.
   */
  opsBoardHeightRem: z.number().min(10).max(28).default(15.5),
  categories: z.array(FloorCategorySchema),
  seats: z.array(FloorSeatDefSchema),
});
export type FloorLayoutCatalog = z.infer<typeof FloorLayoutCatalogSchema>;

/** Resolved seat for floor UI / label helpers. */
export type ResolvedFloorSeat = FloorSeatDef & {
  categoryName: string;
  label: string;
  code: string;
  absoluteCells: FloorCell[];
  bounds: FloorBounds;
};

export type FloorBounds = {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
  width: number;
  height: number;
};

export function cellKey(c: FloorCell): string {
  return `${c.col},${c.row}`;
}

export function normalizeShape(cells: FloorCell[]): FloorCell[] {
  if (cells.length === 0) return [];
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  const seen = new Set<string>();
  const out: FloorCell[] = [];
  for (const c of cells) {
    const next = { col: c.col - minCol, row: c.row - minRow };
    const k = cellKey(next);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(next);
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

export function rectShape(cols: number, rows: number): FloorCell[] {
  const cells: FloorCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ col, row });
    }
  }
  return cells;
}

export function shapeBounds(cells: FloorCell[]): FloorBounds {
  if (cells.length === 0) {
    return { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0, width: 0, height: 0 };
  }
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  const maxCol = Math.max(...cells.map((c) => c.col));
  const maxRow = Math.max(...cells.map((c) => c.row));
  return {
    minCol,
    minRow,
    maxCol,
    maxRow,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

export function absoluteCellsForSeat(
  seat: Pick<FloorSeatDef, "anchorCol" | "anchorRow">,
  category: Pick<FloorCategory, "cells">,
): FloorCell[] {
  return category.cells.map((c) => ({
    col: seat.anchorCol + c.col,
    row: seat.anchorRow + c.row,
  }));
}

export function formatFloorSeatLabel(categoryName: string, number: number): string {
  return `${categoryName}${number}`;
}

export function formatFloorSeatCode(categoryName: string, number: number): string {
  const initial = categoryName.trim().charAt(0) || "?";
  return `${initial}${number}`;
}

export function getCategory(
  catalog: FloorLayoutCatalog,
  categoryId: string,
): FloorCategory | undefined {
  return catalog.categories.find((c) => c.id === categoryId);
}

export function resolveFloorSeat(
  catalog: FloorLayoutCatalog,
  seatId: string,
): ResolvedFloorSeat | undefined {
  const seat = catalog.seats.find((s) => s.id === seatId);
  if (!seat) return undefined;
  const category = getCategory(catalog, seat.categoryId);
  if (!category) return undefined;
  const absolute = absoluteCellsForSeat(seat, category);
  return {
    ...seat,
    categoryName: category.name,
    label: formatFloorSeatLabel(category.name, seat.number),
    code: formatFloorSeatCode(category.name, seat.number),
    absoluteCells: absolute,
    bounds: shapeBounds(absolute),
  };
}

export function resolveAllFloorSeats(
  catalog: FloorLayoutCatalog,
): ResolvedFloorSeat[] {
  return catalog.seats
    .map((s) => resolveFloorSeat(catalog, s.id))
    .filter((s): s is ResolvedFloorSeat => Boolean(s));
}

/** Bounding box of all placed seats (empty floor → full grid). */
export function floorContentBounds(
  catalog: FloorLayoutCatalog,
): FloorBounds {
  const seats = resolveAllFloorSeats(catalog);
  if (seats.length === 0) {
    return {
      minCol: 0,
      minRow: 0,
      maxCol: catalog.gridCols - 1,
      maxRow: catalog.gridRows - 1,
      width: catalog.gridCols,
      height: catalog.gridRows,
    };
  }
  const cells = seats.flatMap((s) => s.absoluteCells);
  return shapeBounds(cells);
}

/**
 * Columns/rows actually covered by stamps (0 when empty).
 * EN: Occupied extent; empty layout reports 0×0.
 */
export function floorOccupiedExtent(catalog: FloorLayoutCatalog): {
  usedCols: number;
  usedRows: number;
} {
  const seats = resolveAllFloorSeats(catalog);
  if (seats.length === 0) return { usedCols: 0, usedRows: 0 };
  const bounds = shapeBounds(seats.flatMap((s) => s.absoluteCells));
  return { usedCols: bounds.maxCol + 1, usedRows: bounds.maxRow + 1 };
}

/** Smallest canvas that still fits all stamps (schema floor ≥ 4). */
export function minFloorCanvasSize(catalog: FloorLayoutCatalog): {
  minCols: number;
  minRows: number;
} {
  const { usedCols, usedRows } = floorOccupiedExtent(catalog);
  return {
    minCols: Math.max(4, usedCols),
    minRows: Math.max(4, usedRows),
  };
}

export type ResizeFloorCanvasResult =
  | { ok: true; catalog: FloorLayoutCatalog }
  | {
      ok: false;
      blocked: "cols" | "rows" | "both";
      minCols: number;
      minRows: number;
    };

/**
 * Resize the placement canvas only.
 * MUST: Columns grow/shrink on the right; rows on the bottom. Stamps stay put.
 * EN: Add/remove empty right columns / bottom rows; never rescale seats.
 * Shrink blocked when stamps occupy the edge being removed.
 */
export function resizeFloorLayoutCanvas(
  catalog: FloorLayoutCatalog,
  nextCols: number,
  nextRows: number,
): ResizeFloorCanvasResult {
  const cols = Math.min(96, Math.max(4, Math.floor(nextCols)));
  const rows = Math.min(96, Math.max(4, Math.floor(nextRows)));
  if (cols === catalog.gridCols && rows === catalog.gridRows) {
    return { ok: true, catalog };
  }

  const { minCols, minRows } = minFloorCanvasSize(catalog);
  const colsBlocked = cols < minCols;
  const rowsBlocked = rows < minRows;
  if (colsBlocked || rowsBlocked) {
    return {
      ok: false,
      blocked:
        colsBlocked && rowsBlocked ? "both" : colsBlocked ? "cols" : "rows",
      minCols,
      minRows,
    };
  }

  return {
    ok: true,
    catalog: {
      ...catalog,
      gridCols: cols,
      gridRows: rows,
    },
  };
}

/**
 * Settings editor map width (not applied as a nested shrink on live floor).
 */
export function floorEditorMaxWidthPx(catalog: FloorLayoutCatalog): number {
  return Math.min(960, Math.max(320, catalog.maxCanvasWidthPx));
}

export function occupiedCellMap(
  catalog: FloorLayoutCatalog,
  exceptSeatId?: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const seat of catalog.seats) {
    if (exceptSeatId && seat.id === exceptSeatId) continue;
    const category = getCategory(catalog, seat.categoryId);
    if (!category) continue;
    for (const cell of absoluteCellsForSeat(seat, category)) {
      map.set(cellKey(cell), seat.id);
    }
  }
  return map;
}

export function canPlaceSeat(
  catalog: FloorLayoutCatalog,
  category: FloorCategory,
  anchorCol: number,
  anchorRow: number,
  exceptSeatId?: string,
): boolean {
  const occupied = occupiedCellMap(catalog, exceptSeatId);
  for (const c of category.cells) {
    const col = anchorCol + c.col;
    const row = anchorRow + c.row;
    if (col < 0 || row < 0 || col >= catalog.gridCols || row >= catalog.gridRows) {
      return false;
    }
    if (occupied.has(cellKey({ col, row }))) return false;
  }
  return true;
}

export function nextNumberForCategory(
  catalog: FloorLayoutCatalog,
  categoryId: string,
): number {
  const nums = catalog.seats
    .filter((s) => s.categoryId === categoryId)
    .map((s) => s.number);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

export function formatSeatLabelsFromCatalog(
  catalog: FloorLayoutCatalog,
  seatIds: string[],
): string {
  const labels = seatIds
    .map((id) => resolveFloorSeat(catalog, id)?.label)
    .filter((v): v is string => Boolean(v));
  return labels.join("・");
}

export function totalCapacityFromCatalog(
  catalog: FloorLayoutCatalog,
  seatIds: string[],
): number {
  return seatIds.reduce((sum, id) => {
    const seat = catalog.seats.find((s) => s.id === id);
    return sum + (seat?.capacity ?? 0);
  }, 0);
}

/** Visual center of occupied cells (fractional grid coords). */
export function shapeVisualCenter(cells: FloorCell[]): { col: number; row: number } {
  if (cells.length === 0) return { col: 0.5, row: 0.5 };
  const col = cells.reduce((s, c) => s + c.col + 0.5, 0) / cells.length;
  const row = cells.reduce((s, c) => s + c.row + 0.5, 0) / cells.length;
  return { col, row };
}

const TABLE_SHAPE = rectShape(12, 8);
const BAR_SHAPE = rectShape(8, 8);

/**
 * Default layout mirrors legacy deformed floor (stable seat ids).
 * Fine grid (48×32); seat ids unchanged.
 *   T1 T2 T3 T4
 *            B6
 *            B5
 *   B1 B2 B3 B4
 */
export const DEFAULT_FLOOR_LAYOUT: FloorLayoutCatalog = {
  version: 3,
  gridCols: 48,
  gridRows: 32,
  maxCanvasWidthPx: 640,
  opsBoardHeightRem: 15.5,
  categories: [
    {
      id: "cat_table",
      name: "テーブル",
      sortOrder: 10,
      enabled: true,
      capacity: 2,
      cells: TABLE_SHAPE,
    },
    {
      id: "cat_bar",
      name: "バー",
      sortOrder: 20,
      enabled: true,
      capacity: 1,
      cells: BAR_SHAPE,
    },
  ],
  seats: [
    {
      id: "seat_t1",
      categoryId: "cat_table",
      number: 1,
      capacity: 2,
      anchorCol: 0,
      anchorRow: 0,
    },
    {
      id: "seat_t2",
      categoryId: "cat_table",
      number: 2,
      capacity: 2,
      anchorCol: 12,
      anchorRow: 0,
    },
    {
      id: "seat_t3",
      categoryId: "cat_table",
      number: 3,
      capacity: 2,
      anchorCol: 24,
      anchorRow: 0,
    },
    {
      id: "seat_t4",
      categoryId: "cat_table",
      number: 4,
      capacity: 2,
      anchorCol: 36,
      anchorRow: 0,
    },
    {
      id: "seat_b6",
      categoryId: "cat_bar",
      number: 1,
      capacity: 1,
      anchorCol: 0,
      anchorRow: 24,
    },
    {
      id: "seat_b5",
      categoryId: "cat_bar",
      number: 2,
      capacity: 1,
      anchorCol: 8,
      anchorRow: 24,
    },
    {
      id: "seat_b4",
      categoryId: "cat_bar",
      number: 3,
      capacity: 1,
      anchorCol: 16,
      anchorRow: 24,
    },
    {
      id: "seat_b3",
      categoryId: "cat_bar",
      number: 4,
      capacity: 1,
      anchorCol: 24,
      anchorRow: 24,
    },
    {
      id: "seat_b2",
      categoryId: "cat_bar",
      number: 5,
      capacity: 1,
      anchorCol: 40,
      anchorRow: 16,
    },
    {
      id: "seat_b1",
      categoryId: "cat_bar",
      number: 6,
      capacity: 1,
      anchorCol: 40,
      anchorRow: 8,
    },
  ],
};

/** Scale each cell into a scale×scale block (coarse → fine grid). */
function scaleShapeCells(cells: FloorCell[], scale: number): FloorCell[] {
  return scaleShapeCellsXY(cells, scale, scale);
}

function scaleShapeCellsXY(
  cells: FloorCell[],
  scaleX: number,
  scaleY: number,
): FloorCell[] {
  const out: FloorCell[] = [];
  for (const c of cells) {
    for (let dr = 0; dr < scaleY; dr++) {
      for (let dc = 0; dc < scaleX; dc++) {
        out.push({ col: c.col * scaleX + dc, row: c.row * scaleY + dr });
      }
    }
  }
  return normalizeShape(out);
}

/** Shrink polyomino by integer factor (cell → floor(cell/factor)). */
function shrinkShapeCellsXY(
  cells: FloorCell[],
  factorX: number,
  factorY: number,
): FloorCell[] {
  const seen = new Set<string>();
  const out: FloorCell[] = [];
  for (const c of cells) {
    const next = {
      col: Math.floor(c.col / factorX),
      row: Math.floor(c.row / factorY),
    };
    const k = cellKey(next);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(next);
  }
  return normalizeShape(out.length > 0 ? out : [{ col: 0, row: 0 }]);
}

/**
 * Uniform scale for fineness (×2 / ÷2). Not for manual col/row edits —
 * those use `resizeFloorLayoutCanvas` (right/bottom empty only).
 * MUST: Fineness keeps relative placement; canvas resize must not call this.
 * EN: Proportional rescale for fineness buttons only.
 */
export function rescaleFloorLayoutToGrid(
  catalog: FloorLayoutCatalog,
  nextCols: number,
  nextRows: number,
): FloorLayoutCatalog {
  const cols = Math.min(96, Math.max(4, Math.floor(nextCols)));
  const rows = Math.min(96, Math.max(4, Math.floor(nextRows)));
  if (cols === catalog.gridCols && rows === catalog.gridRows) return catalog;

  const sx = cols / catalog.gridCols;
  const sy = rows / catalog.gridRows;
  const growX = Number.isInteger(sx) && sx >= 1;
  const growY = Number.isInteger(sy) && sy >= 1;
  const shrinkX = Number.isInteger(1 / sx) && sx > 0 && sx < 1;
  const shrinkY = Number.isInteger(1 / sy) && sy > 0 && sy < 1;

  function scaleCells(cells: FloorCell[]): FloorCell[] {
    if (growX && growY) return scaleShapeCellsXY(cells, sx, sy);
    if (shrinkX && shrinkY) {
      return shrinkShapeCellsXY(cells, Math.round(1 / sx), Math.round(1 / sy));
    }
    const mapped = cells.map((c) => ({
      col: Math.min(cols - 1, Math.max(0, Math.round(c.col * sx))),
      row: Math.min(rows - 1, Math.max(0, Math.round(c.row * sy))),
    }));
    return normalizeShape(mapped.length > 0 ? mapped : [{ col: 0, row: 0 }]);
  }

  return {
    ...catalog,
    gridCols: cols,
    gridRows: rows,
    opsBoardHeightRem: catalog.opsBoardHeightRem ?? 15.5,
    categories: catalog.categories.map((c) => ({
      ...c,
      cells: scaleCells(c.cells),
    })),
    seats: catalog.seats.map((s) => ({
      ...s,
      anchorCol: Math.min(
        Math.max(0, Math.round(s.anchorCol * sx)),
        Math.max(0, cols - 1),
      ),
      anchorRow: Math.min(
        Math.max(0, Math.round(s.anchorRow * sy)),
        Math.max(0, rows - 1),
      ),
    })),
  };
}

/** Uniform fineness: ×2 or ÷2 on both axes (placement stays in sync). */
export function scaleFloorLayoutFineness(
  catalog: FloorLayoutCatalog,
  factor: 2 | 0.5,
): FloorLayoutCatalog {
  if (factor === 2) {
    const cols = Math.min(96, catalog.gridCols * 2);
    const rows = Math.min(96, catalog.gridRows * 2);
    if (cols === catalog.gridCols && rows === catalog.gridRows) return catalog;
    return rescaleFloorLayoutToGrid(catalog, cols, rows);
  }
  const cols = Math.max(4, Math.floor(catalog.gridCols / 2));
  const rows = Math.max(4, Math.floor(catalog.gridRows / 2));
  if (cols === catalog.gridCols && rows === catalog.gridRows) return catalog;
  return rescaleFloorLayoutToGrid(catalog, cols, rows);
}

function scaleLayoutGrid(
  data: FloorLayoutCatalog,
  fromCols: number,
  fromRows: number,
  toCols: number,
  toRows: number,
  version: number,
): FloorLayoutCatalog {
  if (data.gridCols !== fromCols || data.gridRows !== fromRows) return data;
  const scaled = rescaleFloorLayoutToGrid(data, toCols, toRows);
  return {
    ...scaled,
    version: Math.max(data.version, version),
  };
}

/** Migrate older coarse grids → current fine grid (48×32). */
function migrateToFinerGrid(data: FloorLayoutCatalog): FloorLayoutCatalog {
  let next = scaleLayoutGrid(data, 12, 8, 24, 16, 2);
  next = scaleLayoutGrid(next, 24, 16, 48, 32, 3);
  return next;
}

export function migrateFloorLayoutCatalog(raw: unknown): FloorLayoutCatalog {
  const parsed = FloorLayoutCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    return structuredClone(DEFAULT_FLOOR_LAYOUT);
  }
  const data = migrateToFinerGrid({
    ...parsed.data,
    maxCanvasWidthPx: Math.min(
      960,
      Math.max(320, parsed.data.maxCanvasWidthPx || 640),
    ),
    opsBoardHeightRem: parsed.data.opsBoardHeightRem ?? 15.5,
    categories: parsed.data.categories.map((c) => ({
      ...c,
      cells: normalizeShape(c.cells),
    })),
    seats: [...parsed.data.seats],
  });
  return data;
}
