"use client";

import { useEffect, useState } from "react";
import { LABELS } from "@/constants";
import {
  DEFAULT_TAX_POLICY,
  type OrderMenuLayout,
  type RoundingMode,
  type TaxCategory,
  type TaxPolicy,
  type TaxType,
} from "@/domain/tax-policy";
import { useSettings } from "@/store/settings-store";

const TAX_IDS: TaxType[] = ["standard", "reduced", "zero"];

function rateToPercentInput(rate: number): string {
  return String(Math.round(rate * 1000) / 10);
}

function percentInputToRate(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 1000;
}

function ensureCategories(policy: TaxPolicy): TaxCategory[] {
  return TAX_IDS.map((id) => {
    const found = policy.categories.find((c) => c.id === id);
    const fallback = DEFAULT_TAX_POLICY.categories.find((c) => c.id === id)!;
    return found ?? fallback;
  });
}

export function SettingsMasterPanel() {
  const {
    ready,
    policy,
    saveError,
    savePolicy,
    resetPolicy,
    clearSaveError,
  } = useSettings();

  const [draft, setDraft] = useState<TaxPolicy>(policy);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(policy);
  }, [policy, dirty]);

  if (!ready) {
    return (
      <p className="p-6 text-sm text-zinc-500">{LABELS.common.loading}</p>
    );
  }

  const categories = ensureCategories(draft);

  function patchCategory(id: TaxType, patch: Partial<TaxCategory>) {
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      categories: ensureCategories(prev).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  }

  async function handleSave() {
    setSaving(true);
    clearSaveError();
    await savePolicy({
      ...draft,
      // MUST: Staff/guest prices are tax-included only — no tax-excluded display mode.
      // EN: Always persist tax-included; UI toggle removed.
      guestPriceDisplay: "tax_included",
      categories: ensureCategories(draft),
    });
    setDirty(false);
    setSaving(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }

  async function handleReset() {
    if (!window.confirm(LABELS.settings.resetConfirm)) return;
    setSaving(true);
    await resetPolicy();
    setDirty(false);
    setSaving(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {LABELS.settings.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {LABELS.settings.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedFlash ? (
            <span className="text-xs text-emerald-700">
              {LABELS.settings.saved}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {LABELS.settings.reset}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? LABELS.settings.saving : LABELS.settings.save}
          </button>
        </div>
      </header>

      {saveError ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {saveError}
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-800">
          {LABELS.settings.taxCategories}
        </h3>
        <p className="text-xs text-zinc-500">{LABELS.settings.taxCategoriesHint}</p>
        <div className="overflow-x-auto rounded border border-zinc-200 bg-white">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] font-semibold text-zinc-600">
                <th className="px-3 py-2">{LABELS.settings.categoryName}</th>
                <th className="px-3 py-2 w-28">{LABELS.settings.dineInRate}</th>
                <th className="px-3 py-2 w-28">{LABELS.settings.takeoutRate}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) =>
                        patchCategory(cat.id, { name: e.target.value })
                      }
                      className="h-8 w-full rounded border border-zinc-200 px-2 text-sm outline-none focus:border-amber-400 focus:bg-amber-50"
                    />
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      id: {cat.id}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={rateToPercentInput(cat.dineInRate)}
                        onChange={(e) =>
                          patchCategory(cat.id, {
                            dineInRate: percentInputToRate(e.target.value),
                          })
                        }
                        className="h-8 w-20 rounded border border-zinc-200 px-2 text-sm outline-none focus:border-amber-400 focus:bg-amber-50"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={rateToPercentInput(cat.takeoutRate)}
                        onChange={(e) =>
                          patchCategory(cat.id, {
                            takeoutRate: percentInputToRate(e.target.value),
                          })
                        }
                        className="h-8 w-20 rounded border border-zinc-200 px-2 text-sm outline-none focus:border-amber-400 focus:bg-amber-50"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-800">
          {LABELS.settings.calcRules}
        </h3>
        <div className="grid gap-4 rounded border border-zinc-200 bg-white p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-zinc-600">
              {LABELS.settings.businessDayCutoff}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={draft.businessDayCutoffHour}
                onChange={(e) => {
                  setDirty(true);
                  const n = Number(e.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    businessDayCutoffHour: Number.isFinite(n)
                      ? Math.min(23, Math.max(0, Math.floor(n)))
                      : 5,
                  }));
                }}
                className="h-9 w-20 rounded border border-zinc-200 px-2 outline-none focus:border-amber-400"
              />
              <span className="text-xs text-zinc-500">時</span>
            </div>
            <span className="text-[11px] text-zinc-400">
              {LABELS.settings.businessDayCutoffHint}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-zinc-600">
              {LABELS.settings.rounding}
            </span>
            <select
              value={draft.rounding}
              onChange={(e) => {
                setDirty(true);
                setDraft((prev) => ({
                  ...prev,
                  rounding: e.target.value as RoundingMode,
                }));
              }}
              className="h-9 rounded border border-zinc-200 px-2 outline-none focus:border-amber-400"
            >
              <option value="floor">{LABELS.settings.roundingFloor}</option>
              <option value="round">{LABELS.settings.roundingRound}</option>
              <option value="ceil">{LABELS.settings.roundingCeil}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-zinc-600">
              {LABELS.settings.orderMenuLayout}
            </span>
            <select
              value={draft.orderMenuLayout ?? "tabs"}
              onChange={(e) => {
                setDirty(true);
                setDraft((prev) => ({
                  ...prev,
                  orderMenuLayout: e.target.value as OrderMenuLayout,
                }));
              }}
              className="h-9 rounded border border-zinc-200 px-2 outline-none focus:border-amber-400"
            >
              <option value="tabs">
                {LABELS.settings.orderMenuLayoutTabs}
              </option>
              <option value="tree">
                {LABELS.settings.orderMenuLayoutTree}
              </option>
            </select>
            <span className="text-[11px] text-zinc-400">
              {LABELS.settings.orderMenuLayoutHint}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-zinc-600">
              {LABELS.settings.policyVersion}
            </span>
            <input
              type="text"
              value={draft.version}
              onChange={(e) => {
                setDirty(true);
                setDraft((prev) => ({ ...prev, version: e.target.value }));
              }}
              className="h-9 rounded border border-zinc-200 px-2 outline-none focus:border-amber-400"
            />
            <span className="text-[11px] text-zinc-400">
              {LABELS.settings.policyVersionHint}
            </span>
          </label>
        </div>
        <p className="text-[11px] text-zinc-400">{LABELS.settings.legalNote}</p>
      </section>
    </div>
  );
}
