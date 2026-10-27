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
  DEFAULT_TAX_POLICY,
  migrateTaxPolicy,
  setTaxPolicy as applyTaxPolicy,
  type TaxPolicy,
} from "@/domain/tax-policy";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  fetchTaxPolicyFromFirestore,
  subscribeTaxPolicy,
  writeTaxPolicyToFirestore,
} from "@/lib/firebase/tax-policy";
import {
  loadTaxPolicyLocal,
  saveTaxPolicyLocal,
} from "@/lib/tax-policy-storage";

export type SettingsPersistence = "firestore" | "local";

type SettingsContextValue = {
  ready: boolean;
  policy: TaxPolicy;
  persistence: SettingsPersistence;
  saveError: string | null;
  savePolicy: (next: TaxPolicy) => Promise<void>;
  resetPolicy: () => Promise<void>;
  clearSaveError: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [policy, setPolicyState] = useState<TaxPolicy>(DEFAULT_TAX_POLICY);
  const [persistence, setPersistence] =
    useState<SettingsPersistence>("local");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function boot() {
      if (isFirebaseConfigured()) {
        try {
          const cloud = await fetchTaxPolicyFromFirestore();
          if (cancelled) return;
          if (cloud) {
            const migrated = migrateTaxPolicy(cloud);
            applyTaxPolicy(migrated);
            setPolicyState(migrated);
            saveTaxPolicyLocal(migrated);
          } else {
            const local = loadTaxPolicyLocal();
            applyTaxPolicy(local);
            setPolicyState(local);
            await writeTaxPolicyToFirestore(local);
          }
          setPersistence("firestore");
          unsubscribe = subscribeTaxPolicy(
            (next) => {
              if (cancelled) return;
              const migrated = migrateTaxPolicy(next);
              applyTaxPolicy(migrated);
              setPolicyState(migrated);
              saveTaxPolicyLocal(migrated);
            },
            () => {
              /* keep last known */
            },
          );
        } catch {
          if (cancelled) return;
          const local = loadTaxPolicyLocal();
          applyTaxPolicy(local);
          setPolicyState(local);
          setPersistence("local");
        }
      } else {
        const local = loadTaxPolicyLocal();
        applyTaxPolicy(local);
        setPolicyState(local);
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

  const savePolicy = useCallback(
    async (next: TaxPolicy) => {
      const migrated = migrateTaxPolicy(next);
      applyTaxPolicy(migrated);
      setPolicyState(migrated);
      saveTaxPolicyLocal(migrated);
      setSaveError(null);

      if (persistence === "firestore" && isFirebaseConfigured()) {
        try {
          await writeTaxPolicyToFirestore(migrated);
        } catch (err) {
          setSaveError(
            err instanceof Error ? err.message : "設定の保存に失敗しました",
          );
        }
      }
    },
    [persistence],
  );

  const resetPolicy = useCallback(async () => {
    await savePolicy(DEFAULT_TAX_POLICY);
  }, [savePolicy]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ready,
      policy,
      persistence,
      saveError,
      savePolicy,
      resetPolicy,
      clearSaveError: () => setSaveError(null),
    }),
    [ready, policy, persistence, saveError, savePolicy, resetPolicy],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
