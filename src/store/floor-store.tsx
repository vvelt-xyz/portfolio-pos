"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setActiveFloorLayout } from "@/data/floor.seed";
import {
  DEFAULT_FLOOR_LAYOUT,
  migrateFloorLayoutCatalog,
  type FloorLayoutCatalog,
} from "@/domain/floor-layout";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  fetchFloorLayoutFromFirestore,
  subscribeFloorLayout,
  writeFloorLayoutToFirestore,
} from "@/lib/firebase/floor-layout";
import {
  loadFloorLayoutLocal,
  saveFloorLayoutLocal,
} from "@/lib/floor-layout-storage";

export type FloorPersistence = "firestore" | "local";

type FloorContextValue = {
  ready: boolean;
  catalog: FloorLayoutCatalog;
  persistence: FloorPersistence;
  saveError: string | null;
  saveCatalog: (next: FloorLayoutCatalog) => Promise<void>;
  resetCatalog: () => Promise<void>;
  clearSaveError: () => void;
};

const FloorContext = createContext<FloorContextValue | null>(null);

export function FloorProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<FloorLayoutCatalog>(
    DEFAULT_FLOOR_LAYOUT,
  );
  const [persistence, setPersistence] = useState<FloorPersistence>("local");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setActiveFloorLayout(catalog);
  }, [catalog]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function boot() {
      if (isFirebaseConfigured()) {
        try {
          const cloud = await fetchFloorLayoutFromFirestore();
          if (cancelled) return;
          if (cloud) {
            const migrated = migrateFloorLayoutCatalog(cloud);
            setCatalog(migrated);
            saveFloorLayoutLocal(migrated);
          } else {
            const local = loadFloorLayoutLocal();
            setCatalog(local);
            await writeFloorLayoutToFirestore(local);
          }
          setPersistence("firestore");
          unsubscribe = subscribeFloorLayout(
            (next) => {
              if (cancelled) return;
              const migrated = migrateFloorLayoutCatalog(next);
              setCatalog(migrated);
              saveFloorLayoutLocal(migrated);
            },
            () => {
              /* keep last known */
            },
          );
        } catch {
          if (cancelled) return;
          const local = loadFloorLayoutLocal();
          setCatalog(local);
          setPersistence("local");
        }
      } else {
        const local = loadFloorLayoutLocal();
        setCatalog(local);
        setPersistence("local");
      }
      if (!cancelled) setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const saveCatalog = useCallback(
    async (next: FloorLayoutCatalog) => {
      const migrated = migrateFloorLayoutCatalog(next);
      setCatalog(migrated);
      saveFloorLayoutLocal(migrated);
      setSaveError(null);

      if (persistence === "firestore" && isFirebaseConfigured()) {
        try {
          await writeFloorLayoutToFirestore(migrated);
        } catch (err) {
          setSaveError(
            err instanceof Error
              ? err.message
              : "フロアレイアウトの保存に失敗しました",
          );
        }
      }
    },
    [persistence],
  );

  const resetCatalog = useCallback(async () => {
    await saveCatalog(structuredClone(DEFAULT_FLOOR_LAYOUT));
  }, [saveCatalog]);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  const value = useMemo(
    () => ({
      ready,
      catalog,
      persistence,
      saveError,
      saveCatalog,
      resetCatalog,
      clearSaveError,
    }),
    [
      ready,
      catalog,
      persistence,
      saveError,
      saveCatalog,
      resetCatalog,
      clearSaveError,
    ],
  );

  return (
    <FloorContext.Provider value={value}>{children}</FloorContext.Provider>
  );
}

export function useFloor(): FloorContextValue {
  const ctx = useContext(FloorContext);
  if (!ctx) {
    throw new Error("useFloor must be used within FloorProvider");
  }
  return ctx;
}
