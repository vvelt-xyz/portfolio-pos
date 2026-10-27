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
import {
  DEFAULT_SESSION_TAG_CATALOG,
  migrateSessionTagCatalog,
  type SessionTagCatalog,
} from "@/domain/session-tags";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  fetchSessionTagsFromFirestore,
  subscribeSessionTags,
  writeSessionTagsToFirestore,
} from "@/lib/firebase/session-tags";
import {
  loadSessionTagsLocal,
  saveSessionTagsLocal,
} from "@/lib/session-tags-storage";

export type SessionTagsPersistence = "firestore" | "local";

type SessionTagsContextValue = {
  ready: boolean;
  catalog: SessionTagCatalog;
  persistence: SessionTagsPersistence;
  saveError: string | null;
  saveCatalog: (next: SessionTagCatalog) => Promise<void>;
  resetCatalog: () => Promise<void>;
  clearSaveError: () => void;
};

const SessionTagsContext = createContext<SessionTagsContextValue | null>(null);

export function SessionTagsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<SessionTagCatalog>(
    DEFAULT_SESSION_TAG_CATALOG,
  );
  const [persistence, setPersistence] =
    useState<SessionTagsPersistence>("local");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function boot() {
      if (isFirebaseConfigured()) {
        try {
          const cloud = await fetchSessionTagsFromFirestore();
          if (cancelled) return;
          if (cloud) {
            const migrated = migrateSessionTagCatalog(cloud);
            setCatalog(migrated);
            saveSessionTagsLocal(migrated);
          } else {
            const local = loadSessionTagsLocal();
            setCatalog(local);
            await writeSessionTagsToFirestore(local);
          }
          setPersistence("firestore");
          unsubscribe = subscribeSessionTags(
            (next) => {
              if (cancelled) return;
              const migrated = migrateSessionTagCatalog(next);
              setCatalog(migrated);
              saveSessionTagsLocal(migrated);
            },
            () => {
              /* keep last known */
            },
          );
        } catch {
          if (cancelled) return;
          const local = loadSessionTagsLocal();
          setCatalog(local);
          setPersistence("local");
        }
      } else {
        const local = loadSessionTagsLocal();
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
    async (next: SessionTagCatalog) => {
      const migrated = migrateSessionTagCatalog(next);
      setCatalog(migrated);
      saveSessionTagsLocal(migrated);
      setSaveError(null);

      if (persistence === "firestore" && isFirebaseConfigured()) {
        try {
          await writeSessionTagsToFirestore(migrated);
        } catch (err) {
          setSaveError(
            err instanceof Error ? err.message : "タグの保存に失敗しました",
          );
        }
      }
    },
    [persistence],
  );

  const resetCatalog = useCallback(async () => {
    await saveCatalog(structuredClone(DEFAULT_SESSION_TAG_CATALOG));
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
    <SessionTagsContext.Provider value={value}>
      {children}
    </SessionTagsContext.Provider>
  );
}

export function useSessionTags(): SessionTagsContextValue {
  const ctx = useContext(SessionTagsContext);
  if (!ctx) {
    throw new Error("useSessionTags must be used within SessionTagsProvider");
  }
  return ctx;
}
