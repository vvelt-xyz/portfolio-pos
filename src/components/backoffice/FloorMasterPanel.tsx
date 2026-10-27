"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FloorCanvas,
  FloorSeatCardShell,
} from "@/components/floor/FloorCanvas";
import { FloorOpsBoard } from "@/components/floor/FloorOpsBoard";
import { LABELS } from "@/constants";
import {
  DEFAULT_FLOOR_LAYOUT,
  canPlaceSeat,
  cellKey,
  getCategory,
  nextNumberForCategory,
  normalizeShape,
  rectShape,
  floorEditorMaxWidthPx,
  resizeFloorLayoutCanvas,
  shapeBounds,
  type FloorCategory,
  type FloorCell,
  type FloorLayoutCatalog,
  type FloorSeatDef,
  type ResolvedFloorSeat,
} from "@/domain/floor-layout";
import { newId } from "@/lib/ids";
import { useFloor } from "@/store/floor-store";
import { usePos } from "@/store/pos-store";

const SHAPE_EDITOR_SIZE = 16;

const RECT_PRESETS: { label: string; cols: number; rows: number }[] = [
  { label: "2×2", cols: 2, rows: 2 },
  { label: "4×4", cols: 4, rows: 4 },
  { label: "8×8", cols: 8, rows: 8 },
  { label: "12×8", cols: 12, rows: 8 },
  { label: "12×12", cols: 12, rows: 12 },
  { label: "16×8", cols: 16, rows: 8 },
  { label: "1×1", cols: 1, rows: 1 },
];

type EditorTab = "categories" | "layout";

export function FloorMasterPanel() {
  const {
    ready,
    catalog,
    saveError,
    saveCatalog,
    resetCatalog,
    clearSaveError,
  } = useFloor();
  const { openSessions } = usePos();
  /** Any open session → block delete / renumber / reset (move & stamp OK). */
  const layoutDangerLocked = openSessions.length > 0;

  const [draft, setDraft] = useState<FloorLayoutCatalog>(catalog);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [tab, setTab] = useState<EditorTab>("categories");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [stampCategoryId, setStampCategoryId] = useState<string | null>(null);
  const [gridResizeError, setGridResizeError] = useState<string | null>(null);
  const [gridInputNonce, setGridInputNonce] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!dirty) setDraft(catalog);
  }, [catalog, dirty]);

  useEffect(() => {
    if (!selectedCategoryId && draft.categories[0]) {
      setSelectedCategoryId(draft.categories[0].id);
    }
    if (!stampCategoryId) {
      const firstEnabled = draft.categories.find((c) => c.enabled);
      if (firstEnabled) setStampCategoryId(firstEnabled.id);
    }
  }, [draft.categories, selectedCategoryId, stampCategoryId]);

  const selectedCategory = selectedCategoryId
    ? getCategory(draft, selectedCategoryId)
    : undefined;

  const sortedCategories = useMemo(
    () =>
      [...draft.categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft.categories],
  );

  if (!ready) {
    return (
      <p className="p-6 text-sm text-zinc-500">{LABELS.common.loading}</p>
    );
  }

  function mark(next: FloorLayoutCatalog) {
    setDirty(true);
    setDraft(next);
    setGridResizeError(null);
  }

  function applyCanvasResize(nextCols: number, nextRows: number) {
    const result = resizeFloorLayoutCanvas(draft, nextCols, nextRows);
    if (result.ok) {
      if (result.catalog !== draft) {
        mark(result.catalog);
      } else {
        setGridResizeError(null);
      }
      setGridInputNonce((n) => n + 1);
      return;
    }
    if (result.blocked === "cols") {
      setGridResizeError(
        LABELS.floorMaster.gridResizeBlockedCols.replace(
          "{n}",
          String(result.minCols),
        ),
      );
    } else if (result.blocked === "rows") {
      setGridResizeError(
        LABELS.floorMaster.gridResizeBlockedRows.replace(
          "{n}",
          String(result.minRows),
        ),
      );
    } else {
      setGridResizeError(
        LABELS.floorMaster.gridResizeBlockedBoth
          .replace("{cols}", String(result.minCols))
          .replace("{rows}", String(result.minRows)),
      );
    }
    setGridInputNonce((n) => n + 1);
  }

  function patchCategory(id: string, patch: Partial<FloorCategory>) {
    mark({
      ...draft,
      categories: draft.categories.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              cells: patch.cells ? normalizeShape(patch.cells) : c.cells,
            }
          : c,
      ),
    });
  }

  function setCategoryShape(cells: FloorCell[]) {
    if (!selectedCategory) return;
    const next = normalizeShape(cells);
    if (next.length === 0) return;
    patchCategory(selectedCategory.id, { cells: next });
  }

  function applyRectPreset(cols: number, rows: number) {
    if (!selectedCategory) return;
    patchCategory(selectedCategory.id, { cells: rectShape(cols, rows) });
  }

  function addCategory() {
    const maxOrder = draft.categories.reduce(
      (m, c) => Math.max(m, c.sortOrder),
      0,
    );
    const id = newId("cat");
    mark({
      ...draft,
      categories: [
        ...draft.categories,
        {
          id,
          name: LABELS.floorMaster.newCategoryDefault,
          sortOrder: maxOrder + 10,
          enabled: true,
          capacity: 2,
          cells: rectShape(8, 8),
        },
      ],
    });
    setSelectedCategoryId(id);
    setTab("categories");
  }

  function removeCategory(id: string) {
    if (draft.seats.some((s) => s.categoryId === id)) {
      window.alert(LABELS.floorMaster.categoryInUse);
      return;
    }
    if (!window.confirm(LABELS.floorMaster.deleteCategoryConfirm)) return;
    mark({
      ...draft,
      categories: draft.categories.filter((c) => c.id !== id),
    });
    if (selectedCategoryId === id) setSelectedCategoryId(null);
  }

  function stampAt(col: number, row: number) {
    if (selectedSeatId) {
      const seat = draft.seats.find((s) => s.id === selectedSeatId);
      const category = seat ? getCategory(draft, seat.categoryId) : undefined;
      if (seat && category) {
        if (!canPlaceSeat(draft, category, col, row, seat.id)) return;
        mark({
          ...draft,
          seats: draft.seats.map((s) =>
            s.id === seat.id
              ? { ...s, anchorCol: col, anchorRow: row }
              : s,
          ),
        });
      }
      return;
    }

    const categoryId = stampCategoryId;
    if (!categoryId) return;
    const category = getCategory(draft, categoryId);
    if (!category || !category.enabled) return;
    if (!canPlaceSeat(draft, category, col, row)) return;
    const seat: FloorSeatDef = {
      id: newId("seat"),
      categoryId,
      number: nextNumberForCategory(draft, categoryId),
      capacity: category.capacity,
      anchorCol: col,
      anchorRow: row,
    };
    mark({ ...draft, seats: [...draft.seats, seat] });
    setSelectedSeatId(seat.id);
  }

  function tryMoveSeat(
    seatId: string,
    anchorCol: number,
    anchorRow: number,
  ): boolean {
    const current = draftRef.current;
    const seat = current.seats.find((s) => s.id === seatId);
    const category = seat ? getCategory(current, seat.categoryId) : undefined;
    if (!seat || !category) return false;
    if (seat.anchorCol === anchorCol && seat.anchorRow === anchorRow) {
      return true;
    }
    if (!canPlaceSeat(current, category, anchorCol, anchorRow, seatId)) {
      return false;
    }
    mark({
      ...current,
      seats: current.seats.map((s) =>
        s.id === seatId ? { ...s, anchorCol, anchorRow } : s,
      ),
    });
    return true;
  }

  function removeSeat(id: string) {
    if (layoutDangerLocked) return;
    mark({ ...draft, seats: draft.seats.filter((s) => s.id !== id) });
    if (selectedSeatId === id) setSelectedSeatId(null);
  }

  function patchSeat(id: string, patch: Partial<FloorSeatDef>) {
    if (layoutDangerLocked && patch.number !== undefined) return;
    mark({
      ...draft,
      seats: draft.seats.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  async function handleSave() {
    setSaving(true);
    clearSaveError();
    await saveCatalog(draft);
    setDirty(false);
    setSaving(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }

  async function handleReset() {
    if (layoutDangerLocked) return;
    if (!window.confirm(LABELS.floorMaster.resetConfirm)) return;
    setSaving(true);
    clearSaveError();
    await resetCatalog();
    setDraft(structuredClone(DEFAULT_FLOOR_LAYOUT));
    setDirty(false);
    setSaving(false);
    setSelectedSeatId(null);
  }

  const selectedSeat = selectedSeatId
    ? draft.seats.find((s) => s.id === selectedSeatId)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          {LABELS.floorMaster.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {LABELS.floorMaster.subtitle}
        </p>
        {layoutDangerLocked ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="status"
          >
            {LABELS.floorMaster.layoutOpsLockBanner}
          </p>
        ) : null}
      </div>

      <div className="space-y-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div
            className="flex min-w-0 items-end gap-1 border-b border-zinc-200"
            role="tablist"
            aria-label={LABELS.floorMaster.title}
          >
            {(
              [
                {
                  id: "categories" as const,
                  title: LABELS.floorMaster.tabCategories,
                  desc: LABELS.floorMaster.tabCategoriesDesc,
                  activeTab:
                    "border-sky-200 border-b-sky-50 bg-sky-50 text-sky-950",
                  idleTab:
                    "border-transparent bg-zinc-100/80 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
                },
                {
                  id: "layout" as const,
                  title: LABELS.floorMaster.tabLayout,
                  desc: LABELS.floorMaster.tabLayoutDesc,
                  activeTab:
                    "border-amber-200 border-b-amber-50 bg-amber-50 text-amber-950",
                  idleTab:
                    "border-transparent bg-zinc-100/80 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
                },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.id)}
                  className={`-mb-px rounded-t-lg border px-3 py-2 text-left transition sm:px-4 ${
                    active ? item.activeTab : item.idleTab
                  }`}
                >
                  <span className="block text-sm font-semibold leading-tight">
                    {item.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] leading-snug sm:text-xs ${
                      active ? "opacity-70" : "opacity-60"
                    }`}
                  >
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mb-1 flex shrink-0 flex-wrap items-center justify-end gap-2">
            {saveError ? (
              <span
                className="max-w-[10rem] truncate text-xs text-rose-700"
                title={saveError}
              >
                {saveError}
              </span>
            ) : null}
            {savedFlash ? (
              <span className="text-xs text-emerald-700">
                {LABELS.floorMaster.saved}
              </span>
            ) : null}
            {dirty ? (
              <span className="text-xs text-amber-700">
                {LABELS.floorMaster.unsaved}
              </span>
            ) : null}
            <button
              type="button"
              disabled={saving || layoutDangerLocked}
              onClick={() => void handleReset()}
              className="text-xs text-zinc-500 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                layoutDangerLocked
                  ? LABELS.floorMaster.layoutOpsLockShort
                  : undefined
              }
            >
              {LABELS.floorMaster.reset}
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? LABELS.floorMaster.saving : LABELS.floorMaster.save}
            </button>
          </div>
        </div>

        <div
          role="tabpanel"
          className={`rounded-b-xl border border-t-0 p-4 sm:p-5 ${
            tab === "categories"
              ? "border-sky-200 bg-sky-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
      {tab === "categories" ? (
        <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <ul className="space-y-1">
              {sortedCategories.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(c.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedCategoryId === c.id
                        ? "bg-zinc-900 text-white"
                        : "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    {c.name}
                    {!c.enabled ? (
                      <span className="ml-1 text-xs opacity-70">
                        ({LABELS.floorMaster.disabled})
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addCategory}
              className="w-full rounded-lg border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              {LABELS.floorMaster.addCategory}
            </button>
          </div>

          {selectedCategory ? (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
              <label className="block text-sm">
                <span className="text-zinc-600">{LABELS.floorMaster.categoryName}</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  value={selectedCategory.name}
                  onChange={(e) =>
                    patchCategory(selectedCategory.id, {
                      name: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-600">
                  {LABELS.floorMaster.defaultCapacity}
                </span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-24 rounded-lg border border-zinc-300 px-3 py-2"
                  value={selectedCategory.capacity}
                  onChange={(e) =>
                    patchCategory(selectedCategory.id, {
                      capacity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={selectedCategory.enabled}
                  onChange={(e) =>
                    patchCategory(selectedCategory.id, {
                      enabled: e.target.checked,
                    })
                  }
                />
                {LABELS.floorMaster.enabled}
              </label>

              <div>
                <p className="text-sm font-medium text-zinc-800">
                  {LABELS.floorMaster.shapeTitle}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {LABELS.floorMaster.shapeHint}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {RECT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyRectPreset(p.cols, p.rows)}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <ShapePainter
                  size={SHAPE_EDITOR_SIZE}
                  cells={selectedCategory.cells}
                  onChange={setCategoryShape}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {LABELS.floorMaster.cellCount}:{" "}
                  {selectedCategory.cells.length}（
                  {shapeBounds(selectedCategory.cells).width}×
                  {shapeBounds(selectedCategory.cells).height}）
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeCategory(selectedCategory.id)}
                className="text-sm text-rose-700 hover:underline"
              >
                {LABELS.floorMaster.deleteCategory}
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              {LABELS.floorMaster.selectCategory}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">{LABELS.floorMaster.layoutHint}</p>

          {sortedCategories.filter((c) => c.enabled).length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>{LABELS.floorMaster.layoutNeedCategory}</p>
              <button
                type="button"
                onClick={() => setTab("categories")}
                className="mt-2 text-sm font-medium text-amber-950 underline underline-offset-2"
              >
                {LABELS.floorMaster.goToCategories}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">
              {LABELS.floorMaster.stampCategory}
            </span>
            {sortedCategories
              .filter((c) => c.enabled)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setStampCategoryId(c.id);
                    setSelectedSeatId(null);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    stampCategoryId === c.id && !selectedSeatId
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200"
                  }`}
                >
                  {c.name}
                </button>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-600">
              {LABELS.floorMaster.gridCols}
              <input
                type="number"
                min={4}
                max={96}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                defaultValue={draft.gridCols}
                key={`cols-${draft.gridCols}-${gridInputNonce}`}
                onBlur={(e) => {
                  const cols = Math.min(
                    96,
                    Math.max(4, Number(e.target.value) || 4),
                  );
                  if (cols !== draft.gridCols) {
                    applyCanvasResize(cols, draft.gridRows);
                  }
                }}
              />
              <span className="mt-0.5 block text-[10px] text-zinc-400">
                {LABELS.floorMaster.gridColsHint}
              </span>
            </label>
            <label className="text-xs text-zinc-600">
              {LABELS.floorMaster.gridRows}
              <input
                type="number"
                min={4}
                max={96}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                defaultValue={draft.gridRows}
                key={`rows-${draft.gridRows}-${gridInputNonce}`}
                onBlur={(e) => {
                  const rows = Math.min(
                    96,
                    Math.max(4, Number(e.target.value) || 4),
                  );
                  if (rows !== draft.gridRows) {
                    applyCanvasResize(draft.gridCols, rows);
                  }
                }}
              />
              <span className="mt-0.5 block text-[10px] text-zinc-400">
                {LABELS.floorMaster.gridRowsHint}
              </span>
            </label>
            {gridResizeError ? (
              <p
                className="col-span-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800"
                role="alert"
              >
                {gridResizeError}
              </p>
            ) : null}
          </div>

          <div
            className="mx-auto w-full space-y-4"
            style={{ maxWidth: floorEditorMaxWidthPx(draft) }}
          >
          <FloorCanvas
            catalog={draft}
            showGrid
            onCellClick={stampAt}
            seatDrag={{
              onSelect: (id) => {
                setSelectedSeatId(id);
                const seat = draftRef.current.seats.find((s) => s.id === id);
                if (seat) setStampCategoryId(seat.categoryId);
              },
              onDragAnchor: tryMoveSeat,
            }}
            renderSeat={(seat, { dragging, dragInvalid }) => (
              <EditorSeatCard
                seat={seat}
                selected={selectedSeatId === seat.id}
                dragging={dragging}
                dragInvalid={dragInvalid}
              />
            )}
          />

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500">
              {LABELS.floorMaster.layoutPreview}
            </p>
            <FloorOpsBoard
              catalog={draft}
              responsiveHeight={false}
              renderSeat={(seat) => (
                <div
                  className={[
                    "flex h-full w-full flex-col items-center justify-center rounded-lg px-1.5 text-center shadow-sm",
                    selectedSeatId === seat.id
                      ? "bg-sky-700 text-white"
                      : "bg-zinc-300 text-zinc-700",
                    seat.bounds.width >= 10
                      ? "text-sm font-semibold sm:text-base"
                      : "text-xs font-semibold sm:text-sm",
                  ].join(" ")}
                >
                  <span className="leading-tight">
                    {seat.categoryName}
                    {seat.number}
                  </span>
                  <span className="mt-0.5 text-[10px] font-normal opacity-80">
                    {LABELS.floor.vacant}
                  </span>
                </div>
              )}
            />
          </div>
          </div>

          {selectedSeat ? (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="w-full text-sm font-medium text-zinc-800">
                {LABELS.floorMaster.selectedSeat}:{" "}
                {getCategory(draft, selectedSeat.categoryId)?.name}
                {selectedSeat.number}
              </p>
              <label className="text-xs text-zinc-600">
                {LABELS.floorMaster.seatNumber}
                <input
                  type="number"
                  min={1}
                  disabled={layoutDangerLocked}
                  className="mt-1 w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60"
                  value={selectedSeat.number}
                  title={
                    layoutDangerLocked
                      ? LABELS.floorMaster.layoutOpsLockShort
                      : undefined
                  }
                  onChange={(e) =>
                    patchSeat(selectedSeat.id, {
                      number: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
              <label className="text-xs text-zinc-600">
                {LABELS.floorMaster.seatCapacity}
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                  value={selectedSeat.capacity}
                  onChange={(e) =>
                    patchSeat(selectedSeat.id, {
                      capacity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
              <p className="text-xs text-zinc-500">
                {LABELS.floorMaster.moveHint}
              </p>
              <button
                type="button"
                disabled={layoutDangerLocked}
                onClick={() => removeSeat(selectedSeat.id)}
                className="ml-auto text-sm text-rose-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                title={
                  layoutDangerLocked
                    ? LABELS.floorMaster.layoutOpsLockShort
                    : undefined
                }
              >
                {LABELS.floorMaster.deleteSeat}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSeatId(null)}
                className="text-sm text-zinc-600 hover:underline"
              >
                {LABELS.floorMaster.deselectSeat}
              </button>
            </div>
          ) : null}

          <SeatList
            draft={draft}
            selectedSeatId={selectedSeatId}
            onSelect={(id) => setSelectedSeatId(id)}
          />
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function ShapePainter({
  size,
  cells,
  onChange,
}: {
  size: number;
  cells: FloorCell[];
  onChange: (cells: FloorCell[]) => void;
}) {
  const [local, setLocal] = useState(() => new Set(cells.map(cellKey)));
  const paintRef = useRef<{
    fill: boolean;
    pointerId: number;
    lastKey: string | null;
  } | null>(null);
  const localRef = useRef(local);
  localRef.current = local;
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (paintRef.current) return;
    setLocal(new Set(cells.map(cellKey)));
  }, [cells]);

  function cellsFromSet(set: Set<string>): FloorCell[] {
    return [...set].map((k) => {
      const [c, r] = k.split(",").map(Number);
      return { col: c!, row: r! };
    });
  }

  function paintAt(col: number, row: number, fill: boolean) {
    const k = cellKey({ col, row });
    setLocal((prev) => {
      const next = new Set(prev);
      if (fill) {
        next.add(k);
      } else if (next.size > 1) {
        next.delete(k);
      }
      localRef.current = next;
      return next;
    });
  }

  function cellFromPoint(clientX: number, clientY: number): FloorCell | null {
    const el = document.elementFromPoint(clientX, clientY);
    const btn = el?.closest?.("[data-floor-cell]") as HTMLElement | null;
    if (!btn || !gridRef.current?.contains(btn)) return null;
    const col = Number(btn.dataset.col);
    const row = Number(btn.dataset.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return { col, row };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    const k = cellKey(cell);
    const fill = !localRef.current.has(k);
    paintRef.current = { fill, pointerId: e.pointerId, lastKey: k };
    paintAt(cell.col, cell.row, fill);
    gridRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const stroke = paintRef.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    const k = cellKey(cell);
    if (stroke.lastKey === k) return;
    stroke.lastKey = k;
    paintAt(cell.col, cell.row, stroke.fill);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const stroke = paintRef.current;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    try {
      gridRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    paintRef.current = null;
    onChange(cellsFromSet(localRef.current));
  }

  return (
    <div
      ref={gridRef}
      className="mt-3 inline-grid touch-none gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
      style={{
        gridTemplateColumns: `repeat(${size}, 1.1rem)`,
        gridTemplateRows: `repeat(${size}, 1.1rem)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const col = i % size;
        const row = Math.floor(i / size);
        const on = local.has(cellKey({ col, row }));
        return (
          <div
            key={`${col}-${row}`}
            data-floor-cell=""
            data-col={col}
            data-row={row}
            className={`rounded-sm ${
              on
                ? "bg-sky-600 shadow-sm"
                : "bg-white ring-1 ring-zinc-200"
            }`}
            aria-pressed={on}
          />
        );
      })}
    </div>
  );
}

function EditorSeatCard({
  seat,
  selected,
  dragging = false,
  dragInvalid = false,
}: {
  seat: ResolvedFloorSeat;
  selected: boolean;
  dragging?: boolean;
  dragInvalid?: boolean;
}) {
  return (
    <FloorSeatCardShell
      seat={seat}
      toneClassName={
        selected || dragging
          ? "bg-sky-700 text-white"
          : "bg-zinc-500 text-white"
      }
      selected={selected}
      dragging={dragging}
      dragInvalid={dragInvalid}
    >
      <span className="text-[9px] font-semibold leading-none text-white opacity-90">
        {seat.categoryName}
      </span>
      <span className="text-sm font-bold tabular-nums text-white">
        {seat.number}
      </span>
    </FloorSeatCardShell>
  );
}

function SeatList({
  draft,
  selectedSeatId,
  onSelect,
}: {
  draft: FloorLayoutCatalog;
  selectedSeatId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = [...draft.seats].sort((a, b) => {
    const ca = getCategory(draft, a.categoryId)?.sortOrder ?? 0;
    const cb = getCategory(draft, b.categoryId)?.sortOrder ?? 0;
    if (ca !== cb) return ca - cb;
    return a.number - b.number;
  });
  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <p className="border-b border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-500">
        {LABELS.floorMaster.seatList}（{rows.length}）
      </p>
      <ul className="max-h-48 divide-y divide-zinc-100 overflow-y-auto text-sm">
        {rows.map((s) => {
          const cat = getCategory(draft, s.categoryId);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 ${
                  selectedSeatId === s.id ? "bg-sky-50" : ""
                }`}
              >
                <span>
                  {cat?.name ?? "?"}
                  {s.number}
                </span>
                <span className="tabular-nums text-xs text-zinc-400">
                  ({s.anchorCol},{s.anchorRow})
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
