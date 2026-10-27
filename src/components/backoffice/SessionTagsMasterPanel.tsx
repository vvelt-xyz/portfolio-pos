"use client";

import { useEffect, useState } from "react";
import { LABELS } from "@/constants";
import {
  DEFAULT_SESSION_TAG_CATALOG,
  type SessionTagCatalog,
  type SessionTagDef,
} from "@/domain/session-tags";
import { newId } from "@/lib/ids";
import { useSessionTags } from "@/store/session-tags-store";

export function SessionTagsMasterPanel() {
  const {
    ready,
    catalog,
    saveError,
    saveCatalog,
    resetCatalog,
    clearSaveError,
  } = useSessionTags();

  const [draft, setDraft] = useState<SessionTagCatalog>(catalog);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (!dirty) setDraft(catalog);
  }, [catalog, dirty]);

  if (!ready) {
    return (
      <p className="p-6 text-sm text-zinc-500">{LABELS.common.loading}</p>
    );
  }

  const sorted = [...draft.tags].sort((a, b) => a.sortOrder - b.sortOrder);

  function patchTag(id: string, patch: Partial<SessionTagDef>) {
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function moveTag(id: string, dir: -1 | 1) {
    setDirty(true);
    setDraft((prev) => {
      const tags = [...prev.tags].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = tags.findIndex((t) => t.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= tags.length) return prev;
      const a = tags[idx]!;
      const b = tags[swap]!;
      const next = tags.map((t) => {
        if (t.id === a.id) return { ...t, sortOrder: b.sortOrder };
        if (t.id === b.id) return { ...t, sortOrder: a.sortOrder };
        return t;
      });
      return { ...prev, tags: next };
    });
  }

  function addTag() {
    const label = newLabel.trim();
    if (!label) return;
    const maxOrder = draft.tags.reduce(
      (m, t) => Math.max(m, t.sortOrder),
      0,
    );
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      tags: [
        ...prev.tags,
        {
          id: newId("tag"),
          label,
          sortOrder: maxOrder + 10,
          enabled: true,
        },
      ],
    }));
    setNewLabel("");
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
    if (!window.confirm(LABELS.sessionTags.resetConfirm)) return;
    setSaving(true);
    clearSaveError();
    await resetCatalog();
    setDraft(structuredClone(DEFAULT_SESSION_TAG_CATALOG));
    setDirty(false);
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          {LABELS.sessionTags.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {LABELS.sessionTags.subtitle}
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {sorted.map((tag, index) => (
          <li
            key={tag.id}
            className="flex flex-wrap items-center gap-2 px-3 py-3"
          >
            <input
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900"
              value={tag.label}
              aria-label={LABELS.sessionTags.label}
              onChange={(e) => patchTag(tag.id, { label: e.target.value })}
            />
            <label className="flex items-center gap-1.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={tag.enabled}
                onChange={(e) =>
                  patchTag(tag.id, { enabled: e.target.checked })
                }
              />
              {LABELS.sessionTags.enabled}
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                className="min-h-10 rounded-lg border border-zinc-300 px-2 text-sm text-zinc-700 disabled:opacity-40"
                disabled={index === 0}
                aria-label={LABELS.sessionTags.moveUp}
                onClick={() => moveTag(tag.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="min-h-10 rounded-lg border border-zinc-300 px-2 text-sm text-zinc-700 disabled:opacity-40"
                disabled={index === sorted.length - 1}
                aria-label={LABELS.sessionTags.moveDown}
                onClick={() => moveTag(tag.id, 1)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-sm"
          value={newLabel}
          placeholder={LABELS.sessionTags.newPlaceholder}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <button
          type="button"
          className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
          disabled={!newLabel.trim()}
          onClick={addTag}
        >
          {LABELS.sessionTags.add}
        </button>
      </div>

      {saveError ? (
        <p className="text-sm text-red-600">{saveError}</p>
      ) : null}
      {savedFlash ? (
        <p className="text-sm text-emerald-700">{LABELS.sessionTags.saved}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? LABELS.sessionTags.saving : LABELS.sessionTags.save}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm text-zinc-700"
          disabled={saving}
          onClick={() => void handleReset()}
        >
          {LABELS.sessionTags.reset}
        </button>
      </div>
    </div>
  );
}
