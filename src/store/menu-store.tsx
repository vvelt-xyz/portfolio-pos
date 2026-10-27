"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LABELS } from "@/constants";
import {
  MANUAL_LARGE_CATEGORY_ID,
  createSeedMenuCatalog,
} from "@/data/menu.seed";
import {
  isPlanLargeCategory,
  migrateMenuCatalog,
  type MenuCatalog,
  type MenuLargeCategory,
  type MenuMiddleCategory,
  type MenuProduct,
  type PlanDefinition,
} from "@/domain/menu-catalog";
import { newId } from "@/lib/ids";
import {
  clearMenuCatalog,
  loadMenuCatalog,
  saveMenuCatalog,
} from "@/lib/menu-storage";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  ensureCanonicalMenu,
  subscribeMenuCatalog,
  writeMenuCatalogToFirestore,
} from "@/lib/firebase/menu-catalog";

export type MenuPersistence = "firestore" | "local";

type MenuContextValue = {
  ready: boolean;
  catalog: MenuCatalog;
  /** Stored catalog was corrupt; in-memory seed until acknowledge/reset. */
  loadError: boolean;
  /** Where the canonical menu is persisted. */
  persistence: MenuPersistence;
  catalogRevision: number;
  orderLargeCategories: MenuLargeCategory[];
  allProducts: MenuProduct[];
  activeProducts: MenuProduct[];
  planDefinitions: PlanDefinition[];
  saveLargeCategory: (input: MenuLargeCategory) => void;
  deleteLargeCategory: (id: string) => boolean;
  saveMiddleCategory: (input: MenuMiddleCategory) => void;
  deleteMiddleCategory: (id: string) => boolean;
  saveProduct: (
    input: MenuProduct,
  ) => { ok: true } | { ok: false; reason: "duplicate_code" };
  deleteProduct: (id: string) => boolean;
  savePlanCoverage: (productId: string, coveredProductIds: string[]) => void;
  reorderLargeCategories: (orderedIds: string[]) => void;
  reorderMiddleCategories: (largeId: string, orderedIds: string[]) => void;
  reorderProducts: (middleId: string, orderedIds: string[]) => void;
  acknowledgeLoadError: () => void;
  resetToSeed: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function scrubPlans(catalog: MenuCatalog): MenuCatalog {
  return migrateMenuCatalog(catalog);
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const useFirestore = isFirebaseConfigured();
  const [catalog, setCatalog] = useState<MenuCatalog>(createSeedMenuCatalog);
  const [loadError, setLoadError] = useState(false);
  const [ready, setReady] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const skipNextSave = useRef(true);
  const blockSave = useRef(false);
  const applyingRemote = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistence: MenuPersistence = useFirestore ? "firestore" : "local";

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    async function boot() {
      if (useFirestore) {
        try {
          const canonical = await ensureCanonicalMenu();
          if (cancelled) return;
          applyingRemote.current = true;
          setCatalog(canonical);
          setLoadError(false);
          blockSave.current = false;
          setReady(true);
          skipNextSave.current = true;
          // Keep a local mirror for offline open / faster boot.
          saveMenuCatalog(canonical);
          unsub = subscribeMenuCatalog(
            (doc) => {
              if (cancelled) return;
              applyingRemote.current = true;
              setCatalog(doc.catalog);
              setCatalogRevision((r) => r + 1);
              saveMenuCatalog(doc.catalog);
            },
            (err) => {
              console.warn("Firestore menu subscribe failed", err);
            },
          );
        } catch (err) {
          console.warn("Firestore menu boot failed; falling back to local", err);
          if (cancelled) return;
          const loaded = loadMenuCatalog();
          setCatalog(loaded.catalog);
          setLoadError(loaded.loadError);
          blockSave.current = loaded.loadError;
          setReady(true);
        }
        return;
      }

      const loaded = loadMenuCatalog();
      if (cancelled) return;
      setCatalog(loaded.catalog);
      setLoadError(loaded.loadError);
      blockSave.current = loaded.loadError;
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
      unsub?.();
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [useFirestore]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (blockSave.current) return;
    if (applyingRemote.current) {
      applyingRemote.current = false;
      return;
    }

    // Always mirror locally.
    saveMenuCatalog(catalog);

    if (!useFirestore) return;

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void writeMenuCatalogToFirestore(catalog, { source: "backoffice" }).catch(
        (err) => console.warn("Firestore menu write failed", err),
      );
    }, 400);
  }, [catalog, ready, useFirestore]);

  const mutate = useCallback((fn: (prev: MenuCatalog) => MenuCatalog) => {
    setCatalog((prev) => scrubPlans(fn(prev)));
    setCatalogRevision((r) => r + 1);
  }, []);

  const orderLargeCategories = useMemo(
    () =>
      sortByOrder([
        ...catalog.largeCategories,
        {
          id: MANUAL_LARGE_CATEGORY_ID,
          name: LABELS.order.manualTab,
          sortOrder: 999,
          kind: "menu" as const,
        },
      ]),
    [catalog.largeCategories],
  );

  const allProducts = catalog.products;
  const activeProducts = useMemo(
    () => allProducts.filter((p) => p.isActive),
    [allProducts],
  );

  const saveLargeCategory = useCallback(
    (input: MenuLargeCategory) => {
      mutate((prev) => {
        const item: MenuLargeCategory = {
          ...input,
          kind: input.kind ?? "menu",
        };
        const exists = prev.largeCategories.some((c) => c.id === item.id);
        const largeCategories = exists
          ? prev.largeCategories.map((c) => (c.id === item.id ? item : c))
          : [...prev.largeCategories, item];
        return { ...prev, largeCategories: sortByOrder(largeCategories) };
      });
    },
    [mutate],
  );

  const deleteLargeCategory = useCallback(
    (id: string) => {
      let ok = false;
      mutate((prev) => {
        const hasChildren = prev.middleCategories.some(
          (m) => m.largeCategoryId === id,
        );
        if (hasChildren) return prev;
        ok = true;
        return {
          ...prev,
          largeCategories: prev.largeCategories.filter((c) => c.id !== id),
        };
      });
      return ok;
    },
    [mutate],
  );

  const saveMiddleCategory = useCallback(
    (input: MenuMiddleCategory) => {
      mutate((prev) => {
        const exists = prev.middleCategories.some((c) => c.id === input.id);
        const middleCategories = exists
          ? prev.middleCategories.map((c) =>
              c.id === input.id ? input : c,
            )
          : [...prev.middleCategories, input];
        return { ...prev, middleCategories: sortByOrder(middleCategories) };
      });
    },
    [mutate],
  );

  const deleteMiddleCategory = useCallback(
    (id: string) => {
      let ok = false;
      mutate((prev) => {
        const hasProducts = prev.products.some((p) => p.middleCategoryId === id);
        if (hasProducts) return prev;
        ok = true;
        return {
          ...prev,
          middleCategories: prev.middleCategories.filter((c) => c.id !== id),
        };
      });
      return ok;
    },
    [mutate],
  );

  const saveProduct = useCallback(
    (input: MenuProduct) => {
      let result: { ok: true } | { ok: false; reason: "duplicate_code" } = {
        ok: true,
      };
      mutate((prev) => {
        const code = input.productCode?.trim();
        if (code) {
          const dup = prev.products.some(
            (p) =>
              p.id !== input.id &&
              (p.productCode?.trim() || "").toLowerCase() === code.toLowerCase(),
          );
          if (dup) {
            result = { ok: false, reason: "duplicate_code" };
            return prev;
          }
        }
        const normalized: MenuProduct = {
          ...input,
          productCode: code || undefined,
          availableChannels:
            input.availableChannels?.length > 0
              ? input.availableChannels
              : ["table", "takeout"],
        };
        const exists = prev.products.some((p) => p.id === normalized.id);
        const products = exists
          ? prev.products.map((p) =>
              p.id === normalized.id ? normalized : p,
            )
          : [...prev.products, normalized];

        const large = prev.largeCategories.find(
          (c) => c.id === normalized.largeCategoryId,
        );
        let planDefinitions = prev.planDefinitions;
        if (large && isPlanLargeCategory(large)) {
          if (!planDefinitions.some((d) => d.productId === normalized.id)) {
            planDefinitions = [
              ...planDefinitions,
              { productId: normalized.id, coveredProductIds: [] },
            ];
          }
        } else {
          planDefinitions = planDefinitions.filter(
            (d) => d.productId !== normalized.id,
          );
        }

        return {
          ...prev,
          products: sortByOrder(products),
          planDefinitions,
        };
      });
      return result;
    },
    [mutate],
  );

  const deleteProduct = useCallback(
    (id: string) => {
      let ok = false;
      mutate((prev) => {
        ok = true;
        return {
          ...prev,
          products: prev.products.filter((p) => p.id !== id),
          planDefinitions: prev.planDefinitions
            .filter((d) => d.productId !== id)
            .map((d) => ({
              ...d,
              coveredProductIds: d.coveredProductIds.filter((cid) => cid !== id),
            })),
        };
      });
      return ok;
    },
    [mutate],
  );

  const savePlanCoverage = useCallback(
    (productId: string, coveredProductIds: string[]) => {
      mutate((prev) => {
        const exists = prev.planDefinitions.some((d) => d.productId === productId);
        if (!exists) {
          return {
            ...prev,
            planDefinitions: [
              ...prev.planDefinitions,
              { productId, coveredProductIds },
            ],
          };
        }
        return {
          ...prev,
          planDefinitions: prev.planDefinitions.map((d) =>
            d.productId === productId ? { ...d, coveredProductIds } : d,
          ),
        };
      });
    },
    [mutate],
  );

  const reorderLargeCategories = useCallback(
    (orderedIds: string[]) => {
      mutate((prev) => {
        const rank = new Map(orderedIds.map((id, i) => [id, i + 1]));
        return {
          ...prev,
          largeCategories: sortByOrder(
            prev.largeCategories.map((c) =>
              rank.has(c.id) ? { ...c, sortOrder: rank.get(c.id)! } : c,
            ),
          ),
        };
      });
    },
    [mutate],
  );

  const reorderMiddleCategories = useCallback(
    (largeId: string, orderedIds: string[]) => {
      mutate((prev) => {
        const rank = new Map(orderedIds.map((id, i) => [id, i + 1]));
        return {
          ...prev,
          middleCategories: sortByOrder(
            prev.middleCategories.map((c) =>
              c.largeCategoryId === largeId && rank.has(c.id)
                ? { ...c, sortOrder: rank.get(c.id)! }
                : c,
            ),
          ),
        };
      });
    },
    [mutate],
  );

  const reorderProducts = useCallback(
    (middleId: string, orderedIds: string[]) => {
      mutate((prev) => {
        const rank = new Map(orderedIds.map((id, i) => [id, i + 1]));
        return {
          ...prev,
          products: sortByOrder(
            prev.products.map((p) =>
              p.middleCategoryId === middleId && rank.has(p.id)
                ? { ...p, sortOrder: rank.get(p.id)! }
                : p,
            ),
          ),
        };
      });
    },
    [mutate],
  );

  const acknowledgeLoadError = useCallback(() => {
    blockSave.current = false;
    setLoadError(false);
    saveMenuCatalog(catalog);
    if (useFirestore) {
      void writeMenuCatalogToFirestore(catalog, { source: "backoffice" }).catch(
        (err) => console.warn("Firestore menu write failed", err),
      );
    }
  }, [catalog, useFirestore]);

  const resetToSeed = useCallback(() => {
    clearMenuCatalog();
    const seed = createSeedMenuCatalog();
    applyingRemote.current = false;
    setCatalog(seed);
    setCatalogRevision((r) => r + 1);
    blockSave.current = false;
    setLoadError(false);
    skipNextSave.current = false;
    saveMenuCatalog(seed);
    if (useFirestore) {
      void writeMenuCatalogToFirestore(seed, { source: "seed" }).catch((err) =>
        console.warn("Firestore menu reset failed", err),
      );
    }
  }, [useFirestore]);

  const value: MenuContextValue = {
    ready,
    catalog,
    loadError,
    persistence,
    catalogRevision,
    orderLargeCategories,
    allProducts,
    activeProducts,
    planDefinitions: catalog.planDefinitions,
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
  };

  return (
    <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
  );
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used within MenuProvider");
  return ctx;
}

export function newMenuIds() {
  return {
    large: newId("large"),
    middle: newId("mid"),
    product: newId("prod"),
  };
}
