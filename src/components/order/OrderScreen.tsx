"use client";

import { useEffect, useMemo, useState } from "react";
import { MenuCatalogPanel } from "@/components/menu/MenuCatalogPanel";
import { LABELS, SESSION_CHANNEL } from "@/constants";
import { MANUAL_LARGE_CATEGORY_ID, type MenuProduct } from "@/data/menu.seed";
import { resolveSessionSeatLabel } from "@/data/floor.seed";
import type { SessionChannel } from "@/domain/types";
import {
  coveredProductIdsForSession,
  resolveUnitPriceForSession,
} from "@/lib/plans";
import {
  formatYen,
  resolveTaxIncludedUnitPrice,
  resolveTaxRate,
} from "@/lib/pricing";
import { useMenu } from "@/store/menu-store";
import { usePos, useSession } from "@/store/pos-store";
import { useSettings } from "@/store/settings-store";

type MenuBasketLine = {
  kind: "menu";
  productId: string;
  channel: SessionChannel;
  complimentary: boolean;
  qty: number;
  memo: string;
};

type ManualBasketLine = {
  kind: "manual";
  tempId: string;
  name: string;
  channel: SessionChannel;
  complimentary: boolean;
  qty: number;
  unitPriceTaxIncluded: number;
  memo: string;
};

type BasketLine = MenuBasketLine | ManualBasketLine;

function newTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function menuLineKey(
  productId: string,
  channel: SessionChannel,
  complimentary: boolean,
) {
  return `${productId}::${channel}::${complimentary ? "free" : "paid"}`;
}

export function OrderScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const session = useSession(sessionId);
  const {
    ready,
    products,
    confirmOrderBatch,
    addManualOrder,
    state,
    businessDayPhase,
  } = usePos();
  const { orderLargeCategories, catalog, planDefinitions } = useMenu();
  const { policy } = useSettings();
  const [largeId, setLargeId] = useState(
    () => orderLargeCategories[0]?.id ?? "",
  );
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [complimentaryMode, setComplimentaryMode] = useState(false);
  const [takeoutMode, setTakeoutMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [manualError, setManualError] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  /** Pick menu → review cart → confirm (both A/B layouts). */
  const [orderStep, setOrderStep] = useState<"pick" | "review">("pick");

  const isManualTab = largeId === MANUAL_LARGE_CATEGORY_ID;
  const orderChannel: SessionChannel = takeoutMode ? "takeout" : "table";
  const isTreeLayout = (policy.orderMenuLayout ?? "tabs") === "tree";

  useEffect(() => {
    if (session?.channel === "takeout") setTakeoutMode(true);
  }, [session?.channel]);

  const coveredProductIds = useMemo(
    () =>
      coveredProductIdsForSession(
        state.orderItems,
        sessionId,
        planDefinitions,
      ),
    [state.orderItems, sessionId, planDefinitions],
  );

  const visibleProducts = useMemo(
    () =>
      products.filter((p) => {
        const channels = p.availableChannels ?? ["table", "takeout"];
        return channels.includes(orderChannel);
      }),
    [products, orderChannel],
  );

  const qtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of basket) {
      if (
        line.kind === "menu" &&
        line.channel === orderChannel &&
        line.complimentary === complimentaryMode
      ) {
        map.set(line.productId, line.qty);
      }
    }
    return map;
  }, [basket, orderChannel, complimentaryMode]);

  function productById(id: string): MenuProduct | undefined {
    return products.find((p) => p.id === id);
  }

  function setMenuQty(
    productId: string,
    qty: number,
    channel: SessionChannel,
    complimentary: boolean,
  ) {
    setBasket((prev) => {
      const existing = prev.find(
        (l) =>
          l.kind === "menu" &&
          l.productId === productId &&
          l.channel === channel &&
          l.complimentary === complimentary,
      );
      const others = prev.filter(
        (l) =>
          !(
            l.kind === "menu" &&
            l.productId === productId &&
            l.channel === channel &&
            l.complimentary === complimentary
          ),
      );
      if (qty <= 0) return others;
      return [
        ...others,
        {
          kind: "menu",
          productId,
          channel,
          complimentary,
          qty,
          memo: existing?.kind === "menu" ? existing.memo : "",
        },
      ];
    });
  }

  function setManualLineQty(tempId: string, qty: number) {
    setBasket((prev) => {
      if (qty <= 0)
        return prev.filter((l) => !(l.kind === "manual" && l.tempId === tempId));
      return prev.map((l) =>
        l.kind === "manual" && l.tempId === tempId ? { ...l, qty } : l,
      );
    });
  }

  function setLineMemo(
    key:
      | {
          kind: "menu";
          productId: string;
          channel: SessionChannel;
          complimentary: boolean;
        }
      | { kind: "manual"; tempId: string },
    memo: string,
  ) {
    setBasket((prev) =>
      prev.map((l) => {
        if (
          key.kind === "menu" &&
          l.kind === "menu" &&
          l.productId === key.productId &&
          l.channel === key.channel &&
          l.complimentary === key.complimentary
        ) {
          return { ...l, memo };
        }
        if (key.kind === "manual" && l.kind === "manual" && l.tempId === key.tempId) {
          return { ...l, memo };
        }
        return l;
      }),
    );
  }

  function addManualToBasket() {
    const name = manualName.trim();
    const qty = Math.floor(Number(manualQty));
    const price = Math.floor(Number(manualPrice));
    if (!name || qty < 1 || !Number.isFinite(price) || price < 0) {
      setManualError(true);
      return;
    }
    setManualError(false);
    setBasket((prev) => [
      ...prev,
      {
        kind: "manual",
        tempId: newTempId(),
        name,
        channel: orderChannel,
        complimentary: complimentaryMode,
        qty,
        unitPriceTaxIncluded: price,
        memo: "",
      },
    ]);
    setManualName("");
    setManualQty("1");
    setManualPrice("");
  }

  async function confirmBasket() {
    if (!session || basket.length === 0) return;
    if (businessDayPhase !== "open") {
      setDayError(LABELS.order.businessDayNotOpen);
      return;
    }
    setDayError(null);
    const menuLines = basket.filter(
      (line): line is Extract<BasketLine, { kind: "menu" }> =>
        line.kind === "menu",
    );
    let ok = true;
    if (menuLines.length > 0) {
      ok = await confirmOrderBatch(
        sessionId,
        menuLines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          memo: line.memo,
          channel: line.channel,
          complimentary: line.complimentary,
        })),
      );
    }
    for (const line of basket) {
      if (line.kind === "manual") {
        const manualOk = addManualOrder({
          sessionId,
          name: line.name,
          qty: line.qty,
          unitPriceTaxIncluded: line.unitPriceTaxIncluded,
          memo: line.memo,
          channel: line.channel,
          complimentary: line.complimentary,
        });
        ok = ok && manualOk;
      }
    }
    if (!ok) {
      setDayError(LABELS.order.businessDayNotOpen);
      return;
    }
    setBasket([]);
    onBack();
  }

  if (!ready) {
    return <p className="text-sm text-zinc-500">{LABELS.common.loading}</p>;
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">{LABELS.order.sessionMissing}</p>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-zinc-300 bg-white text-sm"
          onClick={onBack}
        >
          {LABELS.floor.closePanel}
        </button>
      </div>
    );
  }

  const basketTotal = basket.reduce((sum, line) => {
    if (line.complimentary) return sum;
    if (line.kind === "manual") {
      return sum + line.unitPriceTaxIncluded * line.qty;
    }
    const p = productById(line.productId);
    if (!p) return sum;
    const unitIn = resolveUnitPriceForSession(
      p,
      line.channel,
      coveredProductIds,
    );
    return sum + unitIn * line.qty;
  }, 0);

  const basketItemCount = basket.reduce((sum, line) => sum + line.qty, 0);

  const manualPanel = (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3">
      <label className="block text-sm">
        <span className="text-zinc-600">{LABELS.order.manualName}</span>
        <input
          className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
          value={manualName}
          placeholder={LABELS.order.manualNamePlaceholder}
          onChange={(e) => setManualName(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-600">{LABELS.order.manualQty}</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600">{LABELS.order.manualPrice}</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
          />
        </label>
      </div>
      {manualError ? (
        <p className="text-sm text-red-600">{LABELS.order.manualInvalid}</p>
      ) : null}
      <button
        type="button"
        className="min-h-12 rounded-xl bg-zinc-900 text-sm font-medium text-white"
        onClick={addManualToBasket}
      >
        {LABELS.order.manualAdd}
      </button>
    </section>
  );

  const header = (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pr-11 text-sm sm:pr-12">
      <p className="font-semibold text-zinc-900">
        {orderStep === "review" ? LABELS.order.cart : LABELS.order.title}
      </p>
      <div className="flex items-center gap-3">
        {orderStep !== "review" ? (
          <>
            <label
              className={[
                "flex cursor-pointer items-center gap-1.5 text-xs",
                complimentaryMode ? "text-emerald-800" : "text-zinc-500",
              ].join(" ")}
              title={LABELS.order.complimentaryModeHint}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-emerald-600"
                checked={complimentaryMode}
                onChange={(e) => setComplimentaryMode(e.target.checked)}
              />
              <span className={complimentaryMode ? "font-medium" : undefined}>
                {LABELS.order.complimentaryBadge}
              </span>
            </label>
            <label
              className={[
                "flex cursor-pointer items-center gap-1.5 text-xs",
                takeoutMode ? "text-amber-800" : "text-zinc-500",
              ].join(" ")}
              title={LABELS.order.takeoutModeHint}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-amber-600"
                checked={takeoutMode}
                onChange={(e) => setTakeoutMode(e.target.checked)}
              />
              <span className={takeoutMode ? "font-medium" : undefined}>
                {LABELS.order.takeoutBadge}
              </span>
            </label>
          </>
        ) : null}
        <p className="text-zinc-600">
          {session.channel === "takeout"
            ? SESSION_CHANNEL.takeout
            : resolveSessionSeatLabel(session) || session.seatLabel}
        </p>
      </div>
    </div>
  );

  const catalogPanel = (
    <MenuCatalogPanel
      mode="order"
      layout={isTreeLayout ? "tree" : "tabs"}
      largeCategories={orderLargeCategories}
      selectedLargeId={largeId}
      onSelectLarge={setLargeId}
      middleCategories={catalog.middleCategories}
      products={visibleProducts}
      panelContent={
        isTreeLayout || isManualTab ? manualPanel : undefined
      }
      panelContentLargeId={
        isTreeLayout ? MANUAL_LARGE_CATEGORY_ID : undefined
      }
      qtyByProductId={qtyById}
      onAdd={(productId) =>
        setMenuQty(
          productId,
          (qtyById.get(productId) ?? 0) + 1,
          orderChannel,
          complimentaryMode,
        )
      }
      onDecrement={(productId) =>
        setMenuQty(
          productId,
          (qtyById.get(productId) ?? 0) - 1,
          orderChannel,
          complimentaryMode,
        )
      }
      onClear={(productId) =>
        setMenuQty(productId, 0, orderChannel, complimentaryMode)
      }
      getTileMeta={(p) => {
        const { taxRate } = resolveTaxRate(p, orderChannel);
        if (complimentaryMode) {
          return {
            unitPriceTaxIncluded: 0,
            billingLabel: LABELS.order.complimentaryBadge,
          };
        }
        const unitIn = resolveUnitPriceForSession(
          p,
          orderChannel,
          coveredProductIds,
        );
        const covered = coveredProductIds.has(p.id);
        return {
          unitPriceTaxIncluded: unitIn,
          covered,
          taxPercent: covered ? undefined : Math.round(taxRate * 100),
        };
      }}
    />
  );

  const cartBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
      {basket.length === 0 ? (
        <p className="py-2 text-sm text-amber-900/60">{LABELS.order.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {basket.map((line) => {
            if (line.kind === "manual") {
              return (
                <li
                  key={line.tempId}
                  className="flex flex-col gap-2 border-b border-amber-200/80 py-2 text-sm last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-amber-950">
                        {line.complimentary ? (
                          <span className="mr-1.5 inline-block rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-950">
                            {LABELS.order.complimentaryBadge}
                          </span>
                        ) : null}
                        {line.channel === "takeout" ? (
                          <span className="mr-1.5 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                            {LABELS.order.takeoutBadge}
                          </span>
                        ) : null}
                        {line.name}
                      </p>
                      <p className="text-xs text-amber-800/80">
                        {formatYen(
                          line.complimentary ? 0 : line.unitPriceTaxIncluded,
                        )}{" "}
                        × {line.qty}
                        {line.complimentary && line.unitPriceTaxIncluded > 0 ? (
                          <span className="ml-1 line-through">
                            {LABELS.order.listPrice}{" "}
                            {formatYen(line.unitPriceTaxIncluded)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300 bg-white text-lg"
                        onClick={() =>
                          setManualLineQty(line.tempId, line.qty - 1)
                        }
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-semibold tabular-nums">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300 bg-white text-lg"
                        onClick={() =>
                          setManualLineQty(line.tempId, line.qty + 1)
                        }
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="ml-1 min-h-10 rounded-lg border border-red-200 bg-white px-2.5 text-xs text-red-700"
                        onClick={() => setManualLineQty(line.tempId, 0)}
                      >
                        {LABELS.order.cancelItem}
                      </button>
                    </div>
                  </div>
                  <input
                    className="min-h-10 w-full rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 text-sm text-amber-950 placeholder:text-amber-800/50"
                    value={line.memo}
                    placeholder={LABELS.order.lineMemoPlaceholder}
                    aria-label={LABELS.order.lineMemo}
                    onChange={(e) =>
                      setLineMemo(
                        { kind: "manual", tempId: line.tempId },
                        e.target.value,
                      )
                    }
                  />
                </li>
              );
            }
            const p = productById(line.productId);
            if (!p) return null;
            const listIn = resolveTaxIncludedUnitPrice(p, line.channel);
            const unitIn = line.complimentary
              ? 0
              : resolveUnitPriceForSession(
                  p,
                  line.channel,
                  coveredProductIds,
                );
            return (
              <li
                key={menuLineKey(line.productId, line.channel, line.complimentary)}
                className="flex flex-col gap-2 border-b border-amber-200/80 py-2 text-sm last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-amber-950">
                      {line.complimentary ? (
                        <span className="mr-1.5 inline-block rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-950">
                          {LABELS.order.complimentaryBadge}
                        </span>
                      ) : null}
                      {line.channel === "takeout" ? (
                        <span className="mr-1.5 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                          {LABELS.order.takeoutBadge}
                        </span>
                      ) : null}
                      {p.name}
                    </p>
                    <p className="text-xs text-amber-800/80">
                      {formatYen(unitIn)} × {line.qty}
                      {line.complimentary && listIn > 0 ? (
                        <span className="ml-1 line-through">
                          {LABELS.order.listPrice} {formatYen(listIn)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300 bg-white text-lg"
                      onClick={() =>
                        setMenuQty(
                          line.productId,
                          line.qty - 1,
                          line.channel,
                          line.complimentary,
                        )
                      }
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300 bg-white text-lg"
                      onClick={() =>
                        setMenuQty(
                          line.productId,
                          line.qty + 1,
                          line.channel,
                          line.complimentary,
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ml-1 min-h-10 rounded-lg border border-red-200 bg-white px-2.5 text-xs text-red-700"
                      onClick={() =>
                        setMenuQty(
                          line.productId,
                          0,
                          line.channel,
                          line.complimentary,
                        )
                      }
                    >
                      {LABELS.order.cancelItem}
                    </button>
                  </div>
                </div>
                <input
                  className="min-h-10 w-full rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 text-sm text-amber-950 placeholder:text-amber-800/50"
                  value={line.memo}
                  placeholder={LABELS.order.lineMemoPlaceholder}
                  aria-label={LABELS.order.lineMemo}
                  onChange={(e) =>
                    setLineMemo(
                      {
                        kind: "menu",
                        productId: line.productId,
                        channel: line.channel,
                        complimentary: line.complimentary,
                      },
                      e.target.value,
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (orderStep === "review") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {header}
        {dayError || businessDayPhase !== "open" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {dayError ?? LABELS.order.businessDayNotOpen}
          </p>
        ) : null}
        <section className="flex min-h-0 flex-1 flex-col rounded-xl border-2 border-amber-300 bg-white">
          <div className="shrink-0 border-b border-amber-200/80 px-3 pt-3 pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-amber-950">
                {LABELS.order.cart}
              </h2>
              <span className="text-sm font-medium text-amber-950">
                {formatYen(basketTotal)}
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-800/80">
              {LABELS.order.cartHint}
            </p>
          </div>
          {cartBody}
          <div className="flex shrink-0 flex-col gap-2 border-t border-amber-200/80 p-3">
            <button
              type="button"
              className="flex min-h-14 w-full items-center justify-center rounded-xl bg-amber-500 text-base font-semibold text-zinc-950 disabled:opacity-40 sm:min-h-12 sm:text-sm"
              disabled={basket.length === 0}
              onClick={confirmBasket}
            >
              {basket.length === 0
                ? LABELS.order.confirm
                : `${LABELS.order.confirm}（${basketItemCount}${LABELS.order.qtyUnit} · ${formatYen(basketTotal)}）`}
            </button>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-800"
              onClick={() => setOrderStep("pick")}
            >
              {LABELS.order.backToMenu}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {header}
      {businessDayPhase !== "open" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {LABELS.order.businessDayNotOpen}
        </p>
      ) : null}
      {catalogPanel}
      <div className="shrink-0 pt-1">
        <button
          type="button"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-base font-semibold text-white disabled:opacity-40 sm:min-h-12 sm:text-sm"
          disabled={basket.length === 0}
          onClick={() => setOrderStep("review")}
        >
          {basket.length === 0
            ? LABELS.order.reviewCart
            : `${LABELS.order.reviewCart}（${basketItemCount}${LABELS.order.qtyUnit} · ${formatYen(basketTotal)}）`}
        </button>
      </div>
    </div>
  );
}
