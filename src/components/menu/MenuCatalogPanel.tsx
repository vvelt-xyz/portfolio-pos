"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LABELS } from "@/constants";
import type {
  MenuLargeCategory,
  MenuMiddleCategory,
  MenuProduct,
} from "@/domain/menu-catalog";
import type { OrderMenuLayout } from "@/domain/tax-policy";
import { formatYen } from "@/lib/pricing";

export type MenuCatalogPanelMode = "order" | "cover";

type OrderTileMeta = {
  unitPriceTaxIncluded: number;
  covered?: boolean;
  taxPercent?: number;
  /** Shown instead of the tax percent (e.g. complimentary). */
  billingLabel?: string;
};

type MenuCatalogPanelProps = {
  largeCategories: Pick<MenuLargeCategory, "id" | "name">[];
  selectedLargeId: string;
  onSelectLarge: (largeId: string) => void;
  middleCategories: MenuMiddleCategory[];
  products: MenuProduct[];
  /**
   * Tabs: replaces product grid when set.
   * Tree: rendered under panelContentLargeId section.
   */
  panelContent?: ReactNode;
  /** Tree: which large section hosts panelContent (e.g. manual entry). */
  panelContentLargeId?: string;
  /** A=tabs (default), B=tree (VS-like sidebar). */
  layout?: OrderMenuLayout;
  className?: string;
} & (
  | {
      mode: "order";
      qtyByProductId: Map<string, number>;
      onAdd: (productId: string) => void;
      onDecrement: (productId: string) => void;
      onClear: (productId: string) => void;
      getTileMeta: (product: MenuProduct) => OrderTileMeta;
    }
  | {
      mode: "cover";
      selectedIds: Set<string>;
      onToggle: (productId: string) => void;
      getTileMeta?: (product: MenuProduct) => {
        unitPriceTaxIncluded?: number;
      };
    }
);

export function MenuCatalogPanel(props: MenuCatalogPanelProps) {
  const layout = props.layout ?? "tabs";
  if (layout === "tree") {
    return <MenuCatalogTree {...props} />;
  }
  return <MenuCatalogTabs {...props} />;
}

function middlesForLarge(
  middleCategories: MenuMiddleCategory[],
  largeId: string,
) {
  return middleCategories
    .filter((m) => m.largeCategoryId === largeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function MenuCatalogTabs(props: MenuCatalogPanelProps) {
  const {
    largeCategories,
    selectedLargeId,
    onSelectLarge,
    middleCategories,
    products,
    panelContent,
    className,
  } = props;

  const middles = useMemo(
    () => middlesForLarge(middleCategories, selectedLargeId),
    [middleCategories, selectedLargeId],
  );

  return (
    <div className={["flex min-h-0 flex-1 flex-col gap-3", className].join(" ")}>
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {largeCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectLarge(c.id)}
            className={[
              "min-h-11 shrink-0 rounded-full px-4 text-sm",
              selectedLargeId === c.id
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 bg-white",
            ].join(" ")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {panelContent ? (
          panelContent
        ) : (
          <ProductSections
            panelProps={props}
            middles={middles}
            products={products}
            display="grid"
          />
        )}
      </div>
    </div>
  );
}

function MenuCatalogTree(props: MenuCatalogPanelProps) {
  const {
    largeCategories,
    selectedLargeId,
    onSelectLarge,
    middleCategories,
    products,
    panelContent,
    panelContentLargeId,
    className,
  } = props;

  const [selectedMiddleId, setSelectedMiddleId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const scrollLockUntil = useRef(0);

  function registerSection(id: string, el: HTMLElement | null) {
    if (el) sectionEls.current.set(id, el);
    else sectionEls.current.delete(id);
  }

  function scrollToSection(id: string) {
    const el = sectionEls.current.get(id);
    if (!el) return;
    scrollLockUntil.current = Date.now() + 600;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < scrollLockUntil.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        const first = visible[0];
        if (!first?.target) return;
        const el = first.target as HTMLElement;
        const midId = el.dataset.middleId;
        const largeId = el.dataset.largeId;
        if (midId && largeId) {
          onSelectLarge(largeId);
          setSelectedMiddleId(midId);
        } else if (largeId) {
          onSelectLarge(largeId);
          setSelectedMiddleId(null);
        }
      },
      { root, rootMargin: "-8% 0px -70% 0px", threshold: 0 },
    );

    const nodes = root.querySelectorAll<HTMLElement>("[data-observe='1']");
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [largeCategories, middleCategories, products, onSelectLarge]);

  function selectLarge(largeId: string) {
    onSelectLarge(largeId);
    setSelectedMiddleId(null);
    requestAnimationFrame(() => scrollToSection(`large:${largeId}`));
  }

  function selectMiddle(largeId: string, middleId: string) {
    onSelectLarge(largeId);
    setSelectedMiddleId(middleId);
    requestAnimationFrame(() => scrollToSection(`middle:${middleId}`));
  }

  return (
    <div
      className={[
        "flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white",
        className,
      ].join(" ")}
    >
      <aside className="flex w-[6.5rem] shrink-0 flex-col border-r border-zinc-200 bg-zinc-100 sm:w-40 md:w-48">
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5">
          {largeCategories.map((large) => {
            const kids = middlesForLarge(middleCategories, large.id);
            const isLargeActive =
              selectedLargeId === large.id && !selectedMiddleId;

            return (
              <div key={large.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => selectLarge(large.id)}
                  className={[
                    "w-full px-1.5 py-2 text-left text-[12px] font-bold leading-snug break-words sm:px-2 sm:text-sm",
                    isLargeActive
                      ? "bg-zinc-900 text-white"
                      : selectedLargeId === large.id
                        ? "bg-zinc-800 text-white"
                        : "bg-zinc-700 text-zinc-50",
                  ].join(" ")}
                >
                  {large.name}
                </button>
                {kids.map((mid) => {
                  const active =
                    selectedLargeId === large.id &&
                    selectedMiddleId === mid.id;
                  return (
                    <button
                      key={mid.id}
                      type="button"
                      onClick={() => selectMiddle(large.id, mid.id)}
                      className={[
                        "w-full px-1.5 py-1.5 text-left text-[11px] leading-snug break-words sm:px-2 sm:py-2 sm:text-xs",
                        active
                          ? "bg-amber-400 font-semibold text-zinc-950"
                          : "bg-white text-zinc-700 hover:bg-amber-50",
                      ].join(" ")}
                    >
                      {mid.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div
        ref={listRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2 sm:p-3"
      >
        <div className="flex flex-col gap-5 pb-8 sm:gap-6">
          {largeCategories.map((large) => {
            const kids = middlesForLarge(middleCategories, large.id);
            const isPanelHost =
              panelContent != null && panelContentLargeId === large.id;

            return (
              <section
                key={large.id}
                ref={(el) => registerSection(`large:${large.id}`, el)}
                data-large-id={large.id}
                data-observe={kids.length === 0 ? "1" : undefined}
                className="scroll-mt-1"
              >
                <h2 className="sticky top-0 z-[1] mb-2 border-b-2 border-zinc-800 bg-white/95 px-0.5 py-1.5 text-sm font-bold tracking-tight text-zinc-900 backdrop-blur-sm sm:mb-3 sm:text-base">
                  {large.name}
                </h2>

                {isPanelHost ? (
                  <div className="mb-3 sm:mb-4">{panelContent}</div>
                ) : null}

                {kids.length === 0 && !isPanelHost ? (
                  <p className="text-sm text-zinc-500">
                    {LABELS.order.menuTreeEmpty}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 sm:gap-4">
                    {kids.map((mid) => (
                      <TreeMiddleBlock
                        key={mid.id}
                        mid={mid}
                        largeId={large.id}
                        catalogProducts={products}
                        panelProps={props}
                        registerSection={registerSection}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TreeMiddleBlock({
  mid,
  largeId,
  catalogProducts,
  panelProps,
  registerSection,
}: {
  mid: MenuMiddleCategory;
  largeId: string;
  catalogProducts: MenuProduct[];
  panelProps: MenuCatalogPanelProps;
  registerSection: (id: string, el: HTMLElement | null) => void;
}) {
  const midProducts = catalogProducts
    .filter((p) => p.middleCategoryId === mid.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (midProducts.length === 0 && panelProps.mode === "order") {
    return null;
  }

  return (
    <div
      ref={(el) => registerSection(`middle:${mid.id}`, el)}
      data-large-id={largeId}
      data-middle-id={mid.id}
      data-observe="1"
      className="scroll-mt-10"
    >
      <h3 className="mb-1 border-b border-zinc-200 pb-1 text-[11px] font-semibold tracking-wide text-zinc-500 sm:mb-1.5 sm:text-xs">
        {mid.name}
      </h3>
      {midProducts.length === 0 ? (
        <p className="py-1 text-xs text-zinc-400">{LABELS.order.menuTreeEmpty}</p>
      ) : panelProps.mode === "order" ? (
        <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {midProducts.map((p) => (
            <OrderListRow
              key={p.id}
              product={p}
              qty={panelProps.qtyByProductId.get(p.id) ?? 0}
              meta={panelProps.getTileMeta(p)}
              onAdd={() => panelProps.onAdd(p.id)}
              onDecrement={() => panelProps.onDecrement(p.id)}
              onClear={() => panelProps.onClear(p.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {midProducts.map((p) => (
            <CoverTile
              key={p.id}
              product={p}
              selected={panelProps.selectedIds.has(p.id)}
              unitPriceTaxIncluded={
                panelProps.getTileMeta?.(p)?.unitPriceTaxIncluded
              }
              onToggle={() => panelProps.onToggle(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSections({
  panelProps,
  middles,
  products,
  display = "grid",
}: {
  panelProps: MenuCatalogPanelProps;
  middles: MenuMiddleCategory[];
  products: MenuProduct[];
  display?: "grid" | "list";
}) {
  return (
    <div className="flex flex-col gap-5 pb-1">
      {middles.map((mid) => {
        const midProducts = products
          .filter((p) => p.middleCategoryId === mid.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (midProducts.length === 0) return null;
        return (
          <section key={mid.id} className="flex flex-col gap-2">
            <h2 className="border-b border-zinc-200 pb-1 text-sm font-semibold text-zinc-800">
              {mid.name}
            </h2>
            {display === "list" ? (
              <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                {midProducts.map((p) => {
                  if (panelProps.mode === "order") {
                    return (
                      <OrderListRow
                        key={p.id}
                        product={p}
                        qty={panelProps.qtyByProductId.get(p.id) ?? 0}
                        meta={panelProps.getTileMeta(p)}
                        onAdd={() => panelProps.onAdd(p.id)}
                        onDecrement={() => panelProps.onDecrement(p.id)}
                        onClear={() => panelProps.onClear(p.id)}
                      />
                    );
                  }
                  return (
                    <li key={p.id}>
                      <CoverTile
                        product={p}
                        selected={panelProps.selectedIds.has(p.id)}
                        unitPriceTaxIncluded={
                          panelProps.getTileMeta?.(p)?.unitPriceTaxIncluded
                        }
                        onToggle={() => panelProps.onToggle(p.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {midProducts.map((p) => {
                  if (panelProps.mode === "order") {
                    return (
                      <OrderTile
                        key={p.id}
                        product={p}
                        qty={panelProps.qtyByProductId.get(p.id) ?? 0}
                        meta={panelProps.getTileMeta(p)}
                        onAdd={() => panelProps.onAdd(p.id)}
                        onDecrement={() => panelProps.onDecrement(p.id)}
                        onClear={() => panelProps.onClear(p.id)}
                      />
                    );
                  }
                  return (
                    <CoverTile
                      key={p.id}
                      product={p}
                      selected={panelProps.selectedIds.has(p.id)}
                      unitPriceTaxIncluded={
                        panelProps.getTileMeta?.(p)?.unitPriceTaxIncluded
                      }
                      onToggle={() => panelProps.onToggle(p.id)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OrderListRow({
  product,
  qty,
  meta,
  onAdd,
  onDecrement,
  onClear,
}: {
  product: MenuProduct;
  qty: number;
  meta: OrderTileMeta;
  onAdd: () => void;
  onDecrement: () => void;
  onClear: () => void;
}) {
  const selected = qty > 0;
  return (
    <li
      className={[
        "flex min-h-14 items-center gap-2 px-2.5 py-2.5 sm:min-h-12 sm:py-2",
        selected ? "bg-amber-50/80" : "bg-white",
      ].join(" ")}
    >
      <button
        type="button"
        className="min-w-0 flex-1 py-0.5 text-left"
        onClick={onAdd}
      >
        <span className="block text-[15px] font-medium leading-snug text-zinc-900 sm:text-sm">
          {product.name}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-600 sm:text-[11px]">
          {formatYen(meta.unitPriceTaxIncluded)}
          {meta.billingLabel ? (
            <span className="ml-1 font-medium text-emerald-800">
              {meta.billingLabel}
            </span>
          ) : meta.covered ? (
            <span className="ml-1 font-medium text-emerald-700">
              {LABELS.order.planCovered}
            </span>
          ) : meta.taxPercent != null ? (
            <span className="ml-1 text-zinc-400">{meta.taxPercent}%</span>
          ) : null}
        </span>
      </button>
      {selected ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`${product.name} −`}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-400 bg-white text-xl font-medium text-zinc-800 sm:h-10 sm:w-10 sm:text-lg"
            onClick={onDecrement}
          >
            −
          </button>
          <span className="w-8 text-center text-base font-semibold tabular-nums text-zinc-900 sm:w-7 sm:text-sm">
            {qty}
          </span>
          <button
            type="button"
            aria-label={`${product.name} +`}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-900 text-xl font-medium text-white sm:h-10 sm:w-10 sm:text-lg"
            onClick={onAdd}
          >
            +
          </button>
          <button
            type="button"
            aria-label={`${product.name} ${LABELS.order.cancelItem}`}
            className="ml-0.5 flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 bg-white text-xl leading-none text-red-700 sm:h-10 sm:w-10 sm:text-lg"
            onClick={onClear}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`${product.name} +`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-xl font-medium text-zinc-800 sm:h-10 sm:w-10 sm:text-lg"
          onClick={onAdd}
        >
          +
        </button>
      )}
    </li>
  );
}

function OrderTile({
  product,
  qty,
  meta,
  onAdd,
  onDecrement,
  onClear,
}: {
  product: MenuProduct;
  qty: number;
  meta: OrderTileMeta;
  onAdd: () => void;
  onDecrement: () => void;
  onClear: () => void;
}) {
  const selected = qty > 0;
  return (
    <div
      className={[
        "relative flex min-h-[6.5rem] flex-col rounded-xl border-2 bg-white px-2.5 pt-3 pb-2",
        selected
          ? "border-amber-500 bg-amber-50/60 shadow-sm"
          : "border-zinc-200",
      ].join(" ")}
    >
      {selected ? (
        <span className="absolute -top-2 -right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-zinc-950">
          {qty}
        </span>
      ) : null}
      <button
        type="button"
        className="flex flex-1 flex-col items-start text-left"
        onClick={onAdd}
      >
        <span className="pr-4 text-sm font-medium leading-snug text-zinc-900">
          {product.name}
        </span>
        <span className="mt-auto pt-2 text-sm text-zinc-700">
          {formatYen(meta.unitPriceTaxIncluded)}
          {meta.billingLabel ? (
            <span className="ml-1 text-[10px] font-medium text-emerald-800">
              {meta.billingLabel}
            </span>
          ) : meta.covered ? (
            <span className="ml-1 text-[10px] font-medium text-emerald-700">
              {LABELS.order.planCovered}
            </span>
          ) : meta.taxPercent != null ? (
            <span className="ml-1 text-[10px] text-zinc-400">
              {meta.taxPercent}%
            </span>
          ) : null}
        </span>
      </button>
      {selected ? (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-label={`${product.name} −`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400 bg-white text-lg font-medium text-zinc-800"
            onClick={onDecrement}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`${product.name} ${LABELS.order.cancelItem}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-xl leading-none text-red-700"
            onClick={onClear}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CoverTile({
  product,
  selected,
  unitPriceTaxIncluded,
  onToggle,
}: {
  product: MenuProduct;
  selected: boolean;
  unitPriceTaxIncluded?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "relative flex min-h-[6.5rem] flex-col items-start rounded-xl border-2 bg-white px-2.5 pt-3 pb-2 text-left",
        selected
          ? "border-amber-500 bg-amber-50/60 shadow-sm"
          : "border-zinc-200",
      ].join(" ")}
    >
      {selected ? (
        <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-zinc-950">
          ✓
        </span>
      ) : null}
      <span className="pr-4 text-sm font-medium leading-snug text-zinc-900">
        {product.name}
      </span>
      {unitPriceTaxIncluded != null ? (
        <span className="mt-auto pt-2 text-sm text-zinc-700">
          {formatYen(unitPriceTaxIncluded)}
        </span>
      ) : (
        <span className="mt-auto" />
      )}
    </button>
  );
}
