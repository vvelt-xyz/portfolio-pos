"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { HomeLink } from "@/components/layout/HomeLink";
import { MenuCatalogPanel } from "@/components/menu/MenuCatalogPanel";
import { SessionTagsMasterPanel } from "@/components/backoffice/SessionTagsMasterPanel";
import { SettingsMasterPanel } from "@/components/backoffice/SettingsMasterPanel";
import { FloorMasterPanel } from "@/components/backoffice/FloorMasterPanel";
import { ReverseSalePanel } from "@/components/backoffice/ReverseSalePanel";
import { OverlayDialog } from "@/components/ui/OverlayDialog";
import { LABELS } from "@/constants";
import { taxTypeLabel } from "@/domain/tax-policy";
import {
  isPlanLargeCategory,
  type MenuChannel,
  type MenuLargeCategory,
  type MenuMiddleCategory,
  type MenuProduct,
  type TaxType,
} from "@/domain/menu-catalog";
import {
  catalogTaxRate,
  extractTaxFromIncluded,
  formatYen,
  resolveTaxRate,
} from "@/lib/pricing";
import { newMenuIds, useMenu } from "@/store/menu-store";
import { useSettings } from "@/store/settings-store";

function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function moveId(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids;
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0) return ids;
  const next = ids.filter((id) => id !== fromId);
  let insertAt = next.indexOf(toId);
  // Moving down: insert after the drop target (natural list reorder).
  if (fromIndex < toIndex) insertAt += 1;
  next.splice(insertAt, 0, fromId);
  return next;
}

function swapAdjacent(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = ids.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function toggleChannel(
  channels: MenuChannel[],
  channel: MenuChannel,
  checked: boolean,
): MenuChannel[] {
  if (checked) {
    return channels.includes(channel) ? channels : [...channels, channel];
  }
  const next = channels.filter((c) => c !== channel);
  return next.length > 0 ? next : channels;
}

type Selection =
  | { kind: "none" }
  | { kind: "large"; largeId: string }
  | { kind: "middle"; largeId: string; middleId: string };

type DragPayload =
  | { type: "large"; id: string }
  | { type: "middle"; id: string; largeId: string }
  | { type: "product"; id: string; middleId: string };

/** Fixed column widths (rem). */
const COL = {
  handle: "w-[1.75rem]",
  name: "w-[9rem]",
  code: "w-[5.5rem]",
  price: "w-[4.5rem]",
  takeout: "w-[4.5rem]",
  cost: "w-[4.5rem]",
  tax: "w-[5.5rem]",
  active: "w-[2.5rem]",
  channel: "w-[2.25rem]",
  preview: "w-[4.25rem]",
  margin: "w-[4rem]",
  memo: "w-[8rem]",
  cover: "w-[3.5rem]",
  action: "w-[4.5rem]",
} as const;

const cellInput =
  "box-border h-8 w-full border-0 bg-transparent px-1 text-sm outline-none focus:bg-amber-50";
const cellSelect =
  "box-border h-8 w-full border-0 bg-transparent px-0.5 text-xs outline-none focus:bg-amber-50";
const thClass =
  "truncate px-1 py-1.5 text-[10px] font-semibold leading-tight text-zinc-600";
const tdClass = "border-r border-zinc-100 p-0 align-middle";

const DRAG_MIME = "application/x-pos-menu-drag";

export function BackofficeScreen() {
  const {
    ready,
    catalog,
    loadError,
    saveLargeCategory,
    deleteLargeCategory,
    saveMiddleCategory,
    deleteMiddleCategory,
    saveProduct,
    deleteProduct,
    savePlanCoverage,
    reorderLargeCategories,
    reorderMiddleCategories,
    reorderProducts,
    acknowledgeLoadError,
    resetToSeed,
  } = useMenu();
  const { policy: taxPolicy } = useSettings();

  const [tab, setTab] = useState<
    "menu" | "settings" | "floor" | "tags" | "reverse"
  >("settings");
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [planCoverProductId, setPlanCoverProductId] = useState<string | null>(
    null,
  );
  const [coverLargeId, setCoverLargeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const larges = useMemo(
    () => sortByOrder(catalog.largeCategories),
    [catalog.largeCategories],
  );

  const planLargeIds = useMemo(
    () =>
      new Set(
        catalog.largeCategories
          .filter((l) => isPlanLargeCategory(l))
          .map((l) => l.id),
      ),
    [catalog.largeCategories],
  );

  const selectedLarge = useMemo(() => {
    if (selection.kind === "none") return undefined;
    return larges.find((l) => l.id === selection.largeId);
  }, [larges, selection]);

  const selectedMiddle = useMemo(() => {
    if (selection.kind !== "middle") return undefined;
    return catalog.middleCategories.find((m) => m.id === selection.middleId);
  }, [catalog.middleCategories, selection]);

  const sheetIsPlan =
    selectedLarge != null && isPlanLargeCategory(selectedLarge);

  const sheetProducts = useMemo(() => {
    if (selection.kind !== "middle") return [];
    return sortByOrder(
      catalog.products.filter((p) => p.middleCategoryId === selection.middleId),
    );
  }, [catalog.products, selection]);

  const coverableProducts = useMemo(
    () =>
      sortByOrder(
        catalog.products.filter((p) => !planLargeIds.has(p.largeCategoryId)),
      ),
    [catalog.products, planLargeIds],
  );

  const coverLargeCategories = useMemo(
    () => larges.filter((l) => !isPlanLargeCategory(l)),
    [larges],
  );

  const selectedPlanCoverage = useMemo(() => {
    if (!planCoverProductId) return new Set<string>();
    const def = catalog.planDefinitions.find(
      (d) => d.productId === planCoverProductId,
    );
    return new Set(def?.coveredProductIds ?? []);
  }, [catalog.planDefinitions, planCoverProductId]);

  const planCoverProduct = useMemo(
    () =>
      planCoverProductId
        ? catalog.products.find((p) => p.id === planCoverProductId)
        : undefined,
    [catalog.products, planCoverProductId],
  );

  function toggleExpand(largeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(largeId)) next.delete(largeId);
      else next.add(largeId);
      return next;
    });
  }

  function selectLarge(largeId: string) {
    setError(null);
    setPlanCoverProductId(null);
    setExpanded((prev) => new Set(prev).add(largeId));
    setSelection({ kind: "large", largeId });
  }

  function selectMiddle(largeId: string, middleId: string) {
    setError(null);
    setPlanCoverProductId(null);
    setExpanded((prev) => new Set(prev).add(largeId));
    setSelection({ kind: "middle", largeId, middleId });
  }

  function startRename(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  function commitRenameLarge(large: MenuLargeCategory) {
    const name = renameDraft.trim();
    if (name) saveLargeCategory({ ...large, name });
    setRenamingId(null);
  }

  function commitRenameMiddle(middle: MenuMiddleCategory) {
    const name = renameDraft.trim();
    if (name) saveMiddleCategory({ ...middle, name });
    setRenamingId(null);
  }

  function addLarge() {
    const id = newMenuIds().large;
    const item: MenuLargeCategory = {
      id,
      name: LABELS.backoffice.newLargePlaceholder,
      sortOrder: larges.length + 1,
      kind: "menu",
    };
    saveLargeCategory(item);
    setExpanded((prev) => new Set(prev).add(id));
    setSelection({ kind: "large", largeId: id });
    setPlanCoverProductId(null);
    startRename(id, item.name);
  }

  function addMiddle(largeId: string) {
    const siblings = catalog.middleCategories.filter(
      (m) => m.largeCategoryId === largeId,
    );
    const id = newMenuIds().middle;
    const item: MenuMiddleCategory = {
      id,
      largeCategoryId: largeId,
      name: LABELS.backoffice.newMiddlePlaceholder,
      sortOrder: siblings.length + 1,
    };
    saveMiddleCategory(item);
    selectMiddle(largeId, id);
    startRename(id, item.name);
  }

  function addProductRow() {
    if (selection.kind !== "middle") return;
    const id = newMenuIds().product;
    const item: MenuProduct = {
      id,
      largeCategoryId: selection.largeId,
      middleCategoryId: selection.middleId,
      name: LABELS.backoffice.newProductPlaceholder,
      priceTaxIncluded: 0,
      costTaxIncluded: 0,
      taxType: "reduced",
      availableChannels: ["table", "takeout"],
      sortOrder: sheetProducts.length + 1,
      isActive: true,
    };
    const result = saveProduct(item);
    if (!result.ok) {
      setError(LABELS.backoffice.duplicateCode);
    }
  }

  function patchProduct(product: MenuProduct, patch: Partial<MenuProduct>) {
    const next: MenuProduct = { ...product, ...patch };
    if ("productCode" in patch && !patch.productCode?.trim()) {
      delete next.productCode;
    }
    if (
      "priceTaxIncludedTakeout" in patch &&
      (patch.priceTaxIncludedTakeout == null ||
        Number.isNaN(patch.priceTaxIncludedTakeout))
    ) {
      delete next.priceTaxIncludedTakeout;
    }
    if ("adminMemo" in patch && !patch.adminMemo?.trim()) {
      delete next.adminMemo;
    }
    const result = saveProduct(next);
    if (!result.ok && result.reason === "duplicate_code") {
      setError(LABELS.backoffice.duplicateCode);
      return;
    }
    setError(null);
  }

  function confirmReset() {
    const typed = window.prompt(
      LABELS.backoffice.resetConfirmTyped,
      "",
    );
    if (typed !== LABELS.backoffice.resetPlaceholder) return;
    resetToSeed();
    setSelection({ kind: "none" });
    setPlanCoverProductId(null);
    setExpanded(new Set());
    setError(null);
  }

  function readPayload(e: DragEvent): DragPayload | null {
    if (dragPayloadRef.current) return dragPayloadRef.current;
    try {
      // Prefer text/plain — custom MIME is empty on drop in several browsers.
      const raw =
        e.dataTransfer.getData("text/plain") ||
        e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return null;
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function startDrag(e: DragEvent, payload: DragPayload) {
    dragPayloadRef.current = payload;
    const raw = JSON.stringify(payload);
    e.dataTransfer.setData("text/plain", raw);
    e.dataTransfer.setData(DRAG_MIME, raw);
    e.dataTransfer.effectAllowed = "move";
  }

  function endDrag() {
    dragPayloadRef.current = null;
    setDragOverId(null);
  }

  function allowDrop(e: DragEvent, overId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(overId);
  }

  function onDropLarge(e: DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readPayload(e);
    endDrag();
    if (!payload || payload.type !== "large") return;
    const ids = larges.map((l) => l.id);
    reorderLargeCategories(moveId(ids, payload.id, targetId));
  }

  function onDropMiddle(e: DragEvent, largeId: string, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readPayload(e);
    // Expanded children swallow drops: redirect large→large onto this parent.
    if (payload?.type === "large") {
      endDrag();
      if (payload.id === largeId) return;
      const ids = larges.map((l) => l.id);
      reorderLargeCategories(moveId(ids, payload.id, largeId));
      return;
    }
    endDrag();
    if (!payload || payload.type !== "middle" || payload.largeId !== largeId) {
      return;
    }
    const ids = sortByOrder(
      catalog.middleCategories.filter((m) => m.largeCategoryId === largeId),
    ).map((m) => m.id);
    reorderMiddleCategories(largeId, moveId(ids, payload.id, targetId));
  }

  function onDropProduct(e: DragEvent, middleId: string, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readPayload(e);
    endDrag();
    if (
      !payload ||
      payload.type !== "product" ||
      payload.middleId !== middleId
    ) {
      return;
    }
    const ids = sheetProducts.map((p) => p.id);
    reorderProducts(middleId, moveId(ids, payload.id, targetId));
  }

  function moveLarge(id: string, direction: -1 | 1) {
    reorderLargeCategories(swapAdjacent(larges.map((l) => l.id), id, direction));
  }

  function moveMiddle(largeId: string, id: string, direction: -1 | 1) {
    const ids = sortByOrder(
      catalog.middleCategories.filter((m) => m.largeCategoryId === largeId),
    ).map((m) => m.id);
    reorderMiddleCategories(largeId, swapAdjacent(ids, id, direction));
  }

  function moveProduct(middleId: string, id: string, direction: -1 | 1) {
    const ids = sheetProducts.map((p) => p.id);
    reorderProducts(middleId, swapAdjacent(ids, id, direction));
  }

  function openPlanCover(productId: string) {
    const firstLarge = coverLargeCategories[0]?.id ?? "";
    setCoverLargeId(firstLarge);
    setPlanCoverProductId(productId);
  }

  function togglePlanCover(productId: string) {
    if (!planCoverProductId) return;
    const next = new Set(selectedPlanCoverage);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    savePlanCoverage(planCoverProductId, Array.from(next));
  }

  if (!ready) {
    return (
      <AppShell
        title={LABELS.backoffice.title}
        headerRight={
          <div className="flex items-center gap-2">
            <SignOutButton />
            <HomeLink />
          </div>
        }
        showNav={false}
        wide
        flush
      >
        <p className="p-4 text-sm text-zinc-500">{LABELS.common.loading}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={LABELS.backoffice.title}
      headerRight={
        <div className="flex items-center gap-2">
          <SignOutButton />
          <HomeLink />
        </div>
      }
      showNav={false}
      wide
      flush
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-zinc-200 bg-white px-3 pt-2">
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              tab === "settings"
                ? "border border-b-0 border-zinc-200 bg-zinc-50 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {LABELS.backoffice.tabSettings}
          </button>
          <button
            type="button"
            onClick={() => setTab("floor")}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              tab === "floor"
                ? "border border-b-0 border-zinc-200 bg-zinc-50 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {LABELS.backoffice.tabFloor}
          </button>
          <button
            type="button"
            onClick={() => setTab("menu")}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              tab === "menu"
                ? "border border-b-0 border-zinc-200 bg-zinc-50 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {LABELS.backoffice.tabMenu}
          </button>
          <button
            type="button"
            onClick={() => setTab("tags")}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              tab === "tags"
                ? "border border-b-0 border-zinc-200 bg-zinc-50 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {LABELS.backoffice.tabTags}
          </button>
          <button
            type="button"
            onClick={() => setTab("reverse")}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              tab === "reverse"
                ? "border border-b-0 border-zinc-200 bg-zinc-50 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {LABELS.backoffice.tabReverse}
          </button>
        </div>

        {tab === "settings" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsMasterPanel />
          </div>
        ) : tab === "floor" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FloorMasterPanel />
          </div>
        ) : tab === "tags" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SessionTagsMasterPanel />
          </div>
        ) : tab === "reverse" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ReverseSalePanel />
          </div>
        ) : (
          <>
        {loadError ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-900">
              {LABELS.backoffice.loadErrorBanner}
            </p>
            <button
              type="button"
              className="min-h-8 shrink-0 rounded-lg border border-amber-400 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100"
              onClick={acknowledgeLoadError}
            >
              {LABELS.backoffice.loadErrorKeepSeed}
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-44 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/80 sm:w-48">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                {LABELS.backoffice.tree}
              </p>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-lg leading-none text-zinc-600 hover:bg-zinc-200"
                title={LABELS.backoffice.addLarge}
                onClick={addLarge}
              >
                +
              </button>
            </div>
            <p className="px-3 py-1 text-[10px] text-zinc-400">
              {LABELS.backoffice.dragHint}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {larges.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-500">
                  {LABELS.backoffice.emptyLarge}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {larges.map((large, largeIndex) => {
                    const open = expanded.has(large.id);
                    const middles = sortByOrder(
                      catalog.middleCategories.filter(
                        (m) => m.largeCategoryId === large.id,
                      ),
                    );
                    const largeActive =
                      selection.kind !== "none" &&
                      selection.largeId === large.id &&
                      selection.kind === "large";
                    return (
                      <li key={large.id}>
                        <div
                          onDragOver={(e) => allowDrop(e, large.id)}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(e) => onDropLarge(e, large.id)}
                          className={[
                            "group flex items-center gap-0.5 px-1",
                            largeActive
                              ? "bg-amber-100"
                              : "hover:bg-zinc-200/70",
                            dragOverId === large.id
                              ? "ring-1 ring-inset ring-amber-500"
                              : "",
                          ].join(" ")}
                        >
                          <span
                            draggable={renamingId !== large.id}
                            onDragStart={(e) =>
                              startDrag(e, { type: "large", id: large.id })
                            }
                            onDragEnd={endDrag}
                            className="cursor-grab px-0.5 text-[10px] text-zinc-400 active:cursor-grabbing"
                            aria-hidden
                            title={LABELS.backoffice.dragHint}
                          >
                            ⋮⋮
                          </span>
                          <button
                            type="button"
                            className="flex h-7 w-4 shrink-0 items-center justify-center text-[10px] text-zinc-500"
                            onClick={() => toggleExpand(large.id)}
                          >
                            {open ? "▼" : "▶"}
                          </button>
                          {renamingId === large.id ? (
                            <input
                              className="min-h-7 min-w-0 flex-1 rounded border border-amber-400 bg-white px-1 text-sm"
                              value={renameDraft}
                              autoFocus
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRenameLarge(large)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRenameLarge(large);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate py-1.5 text-left text-sm font-medium text-zinc-900"
                              onClick={() => selectLarge(large.id)}
                              onDoubleClick={() =>
                                startRename(large.id, large.name)
                              }
                            >
                              {large.name}
                            </button>
                          )}
                          <button
                            type="button"
                            className="hidden h-6 w-5 shrink-0 items-center justify-center text-[10px] text-zinc-500 group-hover:flex hover:text-zinc-900 disabled:opacity-30"
                            title={LABELS.backoffice.moveUp}
                            disabled={largeIndex === 0}
                            onClick={() => moveLarge(large.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="hidden h-6 w-5 shrink-0 items-center justify-center text-[10px] text-zinc-500 group-hover:flex hover:text-zinc-900 disabled:opacity-30"
                            title={LABELS.backoffice.moveDown}
                            disabled={largeIndex === larges.length - 1}
                            onClick={() => moveLarge(large.id, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="hidden h-6 w-6 shrink-0 items-center justify-center text-zinc-500 group-hover:flex hover:text-zinc-900"
                            title={LABELS.backoffice.addMiddle}
                            onClick={() => addMiddle(large.id)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="hidden h-6 w-6 shrink-0 items-center justify-center text-red-600 group-hover:flex"
                            title={LABELS.backoffice.delete}
                            onClick={() => {
                              if (!deleteLargeCategory(large.id)) {
                                setError(LABELS.backoffice.deleteBlocked);
                                return;
                              }
                              setError(null);
                              if (
                                selection.kind !== "none" &&
                                selection.largeId === large.id
                              ) {
                                setSelection({ kind: "none" });
                                setPlanCoverProductId(null);
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                        {open ? (
                          <ul className="mb-1">
                            {middles.map((middle, middleIndex) => {
                              const middleActive =
                                selection.kind === "middle" &&
                                selection.middleId === middle.id;
                              const count = catalog.products.filter(
                                (p) => p.middleCategoryId === middle.id,
                              ).length;
                              return (
                                <li key={middle.id}>
                                  <div
                                    onDragOver={(e) => allowDrop(e, middle.id)}
                                    onDragLeave={() => setDragOverId(null)}
                                    onDrop={(e) =>
                                      onDropMiddle(e, large.id, middle.id)
                                    }
                                    className={[
                                      "group flex items-center gap-0.5 py-0 pl-4 pr-1",
                                      middleActive
                                        ? "bg-amber-200/80"
                                        : "hover:bg-zinc-200/70",
                                      dragOverId === middle.id
                                        ? "ring-1 ring-inset ring-amber-500"
                                        : "",
                                    ].join(" ")}
                                  >
                                    <span
                                      draggable={renamingId !== middle.id}
                                      onDragStart={(e) =>
                                        startDrag(e, {
                                          type: "middle",
                                          id: middle.id,
                                          largeId: large.id,
                                        })
                                      }
                                      onDragEnd={endDrag}
                                      className="cursor-grab px-0.5 text-[10px] text-zinc-400 active:cursor-grabbing"
                                      aria-hidden
                                      title={LABELS.backoffice.dragHint}
                                    >
                                      ⋮⋮
                                    </span>
                                    {renamingId === middle.id ? (
                                      <input
                                        className="min-h-7 min-w-0 flex-1 rounded border border-amber-400 bg-white px-1 text-sm"
                                        value={renameDraft}
                                        autoFocus
                                        onChange={(e) =>
                                          setRenameDraft(e.target.value)
                                        }
                                        onBlur={() =>
                                          commitRenameMiddle(middle)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            commitRenameMiddle(middle);
                                          if (e.key === "Escape")
                                            setRenamingId(null);
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="min-w-0 flex-1 truncate py-1.5 text-left text-sm text-zinc-800"
                                        onClick={() =>
                                          selectMiddle(large.id, middle.id)
                                        }
                                        onDoubleClick={() =>
                                          startRename(middle.id, middle.name)
                                        }
                                      >
                                        {middle.name}
                                        <span className="ml-1 text-[10px] text-zinc-400">
                                          {count}
                                        </span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="hidden h-6 w-5 shrink-0 items-center justify-center text-[10px] text-zinc-500 group-hover:flex hover:text-zinc-900 disabled:opacity-30"
                                      title={LABELS.backoffice.moveUp}
                                      disabled={middleIndex === 0}
                                      onClick={() =>
                                        moveMiddle(large.id, middle.id, -1)
                                      }
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      className="hidden h-6 w-5 shrink-0 items-center justify-center text-[10px] text-zinc-500 group-hover:flex hover:text-zinc-900 disabled:opacity-30"
                                      title={LABELS.backoffice.moveDown}
                                      disabled={
                                        middleIndex === middles.length - 1
                                      }
                                      onClick={() =>
                                        moveMiddle(large.id, middle.id, 1)
                                      }
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      className="hidden h-6 w-6 shrink-0 items-center justify-center text-red-600 group-hover:flex"
                                      title={LABELS.backoffice.delete}
                                      onClick={() => {
                                        if (!deleteMiddleCategory(middle.id)) {
                                          setError(
                                            LABELS.backoffice.deleteBlocked,
                                          );
                                          return;
                                        }
                                        setError(null);
                                        if (
                                          selection.kind === "middle" &&
                                          selection.middleId === middle.id
                                        ) {
                                          setSelection({
                                            kind: "large",
                                            largeId: large.id,
                                          });
                                          setPlanCoverProductId(null);
                                        }
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                            {middles.length === 0 ? (
                              <li className="px-5 py-1 text-[11px] text-zinc-400">
                                {LABELS.backoffice.emptyMiddle}
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-zinc-200 p-2">
              <button
                type="button"
                className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
                onClick={confirmReset}
              >
                {LABELS.backoffice.resetSeed}
              </button>
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {selection.kind === "middle"
                    ? `${selectedLarge?.name ?? ""} / ${selectedMiddle?.name ?? ""}`
                    : selection.kind === "large"
                      ? (selectedLarge?.name ?? "")
                      : LABELS.backoffice.products}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {LABELS.backoffice.subtitle} · {LABELS.backoffice.dragHint}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {selection.kind === "large" && selectedLarge ? (
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={isPlanLargeCategory(selectedLarge)}
                      onChange={(e) =>
                        saveLargeCategory({
                          ...selectedLarge,
                          kind: e.target.checked ? "plan" : "menu",
                        })
                      }
                    />
                    {LABELS.backoffice.kindPlan}
                  </label>
                ) : null}
                {selection.kind === "middle" ? (
                  <button
                    type="button"
                    className="min-h-8 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white"
                    onClick={addProductRow}
                  >
                    {LABELS.backoffice.addRow}
                  </button>
                ) : selection.kind === "large" ? (
                  <button
                    type="button"
                    className="min-h-8 shrink-0 rounded-lg border border-zinc-300 px-3 text-xs"
                    onClick={() => addMiddle(selection.largeId)}
                  >
                    {LABELS.backoffice.addMiddle}
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <p className="shrink-0 border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                {error}
              </p>
            ) : null}

            {selection.kind !== "middle" ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-400">
                {LABELS.backoffice.selectFolder}
              </div>
            ) : sheetProducts.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
                <p className="text-sm text-zinc-400">
                  {LABELS.backoffice.emptyProducts}
                </p>
                <button
                  type="button"
                  className="min-h-9 rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white"
                  onClick={addProductRow}
                >
                  {LABELS.backoffice.addRow}
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-max table-fixed border-collapse text-left">
                    <colgroup>
                      <col className={COL.handle} />
                      <col className={COL.name} />
                      <col className={COL.code} />
                      <col className={COL.price} />
                      <col className={COL.takeout} />
                      <col className={COL.cost} />
                      <col className={COL.tax} />
                      <col className={COL.active} />
                      <col className={COL.channel} />
                      <col className={COL.channel} />
                      <col className={COL.preview} />
                      <col className={COL.preview} />
                      <col className={COL.preview} />
                      <col className={COL.margin} />
                      <col className={COL.memo} />
                      {sheetIsPlan ? <col className={COL.cover} /> : null}
                      <col className={COL.action} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-zinc-100">
                      <tr className="border-b border-zinc-200">
                        <th className={thClass} />
                        <th className={thClass}>{LABELS.backoffice.name}</th>
                        <th className={thClass}>
                          {LABELS.backoffice.productCode}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.priceTaxIncluded}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.priceTaxIncludedTakeout}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.costTaxIncluded}
                        </th>
                        <th className={thClass}>{LABELS.backoffice.taxType}</th>
                        <th className={`${thClass} text-center`}>
                          {LABELS.backoffice.isActive}
                        </th>
                        <th className={`${thClass} text-center`}>
                          {LABELS.backoffice.channelTable}
                        </th>
                        <th className={`${thClass} text-center`}>
                          {LABELS.backoffice.channelTakeout}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.priceTaxExcluded}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.priceTaxExcludedTakeout}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.costTaxExcluded}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.marginPreview}
                        </th>
                        <th className={thClass}>
                          {LABELS.backoffice.adminMemo}
                        </th>
                        {sheetIsPlan ? (
                          <th className={`${thClass} text-center`}>
                            {LABELS.backoffice.planCover}
                          </th>
                        ) : null}
                        <th className={thClass} />
                      </tr>
                    </thead>
                    <tbody>
                      {sheetProducts.map((product, productIndex) => {
                        const channels =
                          product.availableChannels?.length > 0
                            ? product.availableChannels
                            : (["table", "takeout"] as MenuChannel[]);
                        const rateCatalog = catalogTaxRate(product.taxType);
                        const rateTakeout = resolveTaxRate(
                          product,
                          "takeout",
                        ).taxRate;
                        const priceIn = product.priceTaxIncluded;
                        const costIn = product.costTaxIncluded ?? 0;
                        const takeoutIn =
                          product.priceTaxIncludedTakeout ?? null;
                        const priceEx = extractTaxFromIncluded(
                          priceIn,
                          rateCatalog,
                        ).taxExcluded;
                        const costEx = extractTaxFromIncluded(
                          costIn,
                          rateCatalog,
                        ).taxExcluded;
                        const takeoutEx =
                          takeoutIn != null
                            ? extractTaxFromIncluded(takeoutIn, rateTakeout)
                                .taxExcluded
                            : null;
                        const margin = priceEx - costEx;
                        const coverCount =
                          catalog.planDefinitions.find(
                            (d) => d.productId === product.id,
                          )?.coveredProductIds.length ?? 0;
                        return (
                          <tr
                            key={product.id}
                            onDragOver={(e) => allowDrop(e, product.id)}
                            onDragLeave={() => setDragOverId(null)}
                            onDrop={(e) =>
                              onDropProduct(
                                e,
                                product.middleCategoryId,
                                product.id,
                              )
                            }
                            className={[
                              "border-b border-zinc-100 hover:bg-zinc-50/80",
                              dragOverId === product.id
                                ? "bg-amber-50 ring-1 ring-inset ring-amber-400"
                                : "",
                            ].join(" ")}
                          >
                            <td className={`${tdClass} text-center`}>
                              <span
                                draggable
                                onDragStart={(e) =>
                                  startDrag(e, {
                                    type: "product",
                                    id: product.id,
                                    middleId: product.middleCategoryId,
                                  })
                                }
                                onDragEnd={endDrag}
                                className="inline-block cursor-grab px-1 text-[10px] text-zinc-400 active:cursor-grabbing"
                                title={LABELS.backoffice.dragHint}
                              >
                                ⋮⋮
                              </span>
                            </td>
                            <td className={tdClass}>
                              <input
                                className={`${cellInput} font-medium`}
                                defaultValue={product.name}
                                key={`${product.id}-name-${product.name}`}
                                onBlur={(e) => {
                                  const name = e.target.value.trim();
                                  if (name && name !== product.name) {
                                    patchProduct(product, { name });
                                  } else if (!name) {
                                    e.target.value = product.name;
                                  }
                                }}
                              />
                            </td>
                            <td className={tdClass}>
                              <input
                                className={cellInput}
                                defaultValue={product.productCode ?? ""}
                                placeholder={
                                  LABELS.backoffice.productCodePlaceholder
                                }
                                key={`${product.id}-code-${product.productCode ?? ""}`}
                                onBlur={(e) => {
                                  const productCode =
                                    e.target.value.trim() || undefined;
                                  if (
                                    (productCode ?? "") !==
                                    (product.productCode ?? "")
                                  ) {
                                    patchProduct(product, { productCode });
                                  }
                                }}
                              />
                            </td>
                            <td className={tdClass}>
                              <input
                                type="number"
                                min={0}
                                className={`${cellInput} text-right tabular-nums`}
                                defaultValue={priceIn}
                                key={`${product.id}-priceIn-${product.priceTaxIncluded}-${product.taxType}`}
                                onBlur={(e) => {
                                  const priceTaxIncluded = Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0),
                                  );
                                  if (
                                    priceTaxIncluded !== product.priceTaxIncluded
                                  ) {
                                    patchProduct(product, { priceTaxIncluded });
                                  }
                                }}
                              />
                            </td>
                            <td className={tdClass}>
                              <input
                                type="number"
                                min={0}
                                className={`${cellInput} text-right tabular-nums`}
                                defaultValue={takeoutIn ?? ""}
                                key={`${product.id}-toIn-${product.priceTaxIncludedTakeout ?? ""}-${product.taxType}`}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  if (raw === "") {
                                    if (
                                      product.priceTaxIncludedTakeout != null
                                    ) {
                                      patchProduct(product, {
                                        priceTaxIncludedTakeout: undefined,
                                      });
                                    }
                                    return;
                                  }
                                  const priceTaxIncludedTakeout = Math.max(
                                    0,
                                    Math.floor(Number(raw) || 0),
                                  );
                                  if (
                                    priceTaxIncludedTakeout !==
                                    product.priceTaxIncludedTakeout
                                  ) {
                                    patchProduct(product, {
                                      priceTaxIncludedTakeout,
                                    });
                                  }
                                }}
                              />
                            </td>
                            <td className={tdClass}>
                              <input
                                type="number"
                                min={0}
                                className={`${cellInput} text-right tabular-nums`}
                                defaultValue={costIn}
                                key={`${product.id}-costIn-${product.costTaxIncluded ?? 0}-${product.taxType}`}
                                onBlur={(e) => {
                                  const costTaxIncluded = Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0),
                                  );
                                  if (
                                    costTaxIncluded !==
                                    (product.costTaxIncluded ?? 0)
                                  ) {
                                    patchProduct(product, { costTaxIncluded });
                                  }
                                }}
                              />
                            </td>
                            <td className={tdClass}>
                              <select
                                className={cellSelect}
                                value={product.taxType}
                                onChange={(e) =>
                                  patchProduct(product, {
                                    taxType: e.target.value as TaxType,
                                  })
                                }
                              >
                                <option value="standard">
                                  {taxTypeLabel("standard", taxPolicy)}
                                </option>
                                <option value="reduced">
                                  {taxTypeLabel("reduced", taxPolicy)}
                                </option>
                                <option value="zero">
                                  {taxTypeLabel("zero", taxPolicy)}
                                </option>
                              </select>
                            </td>
                            <td className={`${tdClass} text-center`}>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={product.isActive}
                                onChange={(e) =>
                                  patchProduct(product, {
                                    isActive: e.target.checked,
                                  })
                                }
                              />
                            </td>
                            <td className={`${tdClass} text-center`}>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={channels.includes("table")}
                                onChange={(e) =>
                                  patchProduct(product, {
                                    availableChannels: toggleChannel(
                                      channels,
                                      "table",
                                      e.target.checked,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className={`${tdClass} text-center`}>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={channels.includes("takeout")}
                                onChange={(e) =>
                                  patchProduct(product, {
                                    availableChannels: toggleChannel(
                                      channels,
                                      "takeout",
                                      e.target.checked,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className="truncate px-1 text-[11px] tabular-nums text-zinc-500">
                              {formatYen(priceEx)}
                            </td>
                            <td className="truncate px-1 text-[11px] tabular-nums text-zinc-500">
                              {takeoutEx != null
                                ? formatYen(takeoutEx)
                                : LABELS.serve.seatUnknown}
                            </td>
                            <td className="truncate px-1 text-[11px] tabular-nums text-zinc-500">
                              {formatYen(costEx)}
                            </td>
                            <td className="truncate px-1 text-[11px] tabular-nums text-zinc-500">
                              {formatYen(margin)}
                            </td>
                            <td className={tdClass}>
                              <input
                                className={cellInput}
                                defaultValue={product.adminMemo ?? ""}
                                placeholder={
                                  LABELS.backoffice.adminMemoPlaceholder
                                }
                                key={`${product.id}-memo-${product.adminMemo ?? ""}`}
                                onBlur={(e) => {
                                  const adminMemo =
                                    e.target.value.trim() || undefined;
                                  if (
                                    (adminMemo ?? "") !==
                                    (product.adminMemo ?? "")
                                  ) {
                                    patchProduct(product, { adminMemo });
                                  }
                                }}
                              />
                            </td>
                            {sheetIsPlan ? (
                              <td className="px-0.5 text-center">
                                <button
                                  type="button"
                                  className={[
                                    "min-h-7 rounded px-1.5 text-[11px] font-medium",
                                    coverCount > 0
                                      ? "bg-amber-100 text-amber-950 hover:bg-amber-200"
                                      : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50",
                                  ].join(" ")}
                                  title={LABELS.backoffice.planCoverHint}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPlanCover(product.id);
                                  }}
                                >
                                  {coverCount > 0
                                    ? `${coverCount}`
                                    : LABELS.backoffice.planCoverEdit}
                                </button>
                              </td>
                            ) : null}
                            <td className="px-0.5 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  className="rounded px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                                  title={LABELS.backoffice.moveUp}
                                  disabled={productIndex === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveProduct(
                                      product.middleCategoryId,
                                      product.id,
                                      -1,
                                    );
                                  }}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-1 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                                  title={LABELS.backoffice.moveDown}
                                  disabled={
                                    productIndex === sheetProducts.length - 1
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveProduct(
                                      product.middleCategoryId,
                                      product.id,
                                      1,
                                    );
                                  }}
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-1 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      window.confirm(LABELS.backoffice.delete)
                                    ) {
                                      if (
                                        planCoverProductId === product.id
                                      ) {
                                        setPlanCoverProductId(null);
                                      }
                                      deleteProduct(product.id);
                                    }
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
          </>
        )}
      </div>
      {planCoverProductId && planCoverProduct ? (
        <OverlayDialog
          size="lg"
          tone="white"
          fillHeight
          onClose={() => setPlanCoverProductId(null)}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-600">
                {planCoverProduct.name} · {selectedPlanCoverage.size}
                {LABELS.backoffice.planCoverCount}
              </p>
              <button
                type="button"
                className="min-h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white"
                onClick={() => setPlanCoverProductId(null)}
              >
                {LABELS.backoffice.planCoverDone}
              </button>
            </div>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {LABELS.backoffice.planCover}
              </p>
              <p className="text-[11px] text-zinc-500">
                {LABELS.backoffice.planCoverHint}
              </p>
            </div>
            <MenuCatalogPanel
              mode="cover"
              largeCategories={coverLargeCategories}
              selectedLargeId={
                coverLargeId || coverLargeCategories[0]?.id || ""
              }
              onSelectLarge={setCoverLargeId}
              middleCategories={catalog.middleCategories}
              products={coverableProducts}
              selectedIds={selectedPlanCoverage}
              onToggle={togglePlanCover}
              getTileMeta={(p) => ({
                unitPriceTaxIncluded: p.priceTaxIncluded,
              })}
            />
          </div>
        </OverlayDialog>
      ) : null}
    </AppShell>
  );
}
