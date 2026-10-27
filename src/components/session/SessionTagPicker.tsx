"use client";

import { LABELS } from "@/constants";
import {
  enabledSessionTags,
  toggleTagId,
  type SessionTagCatalog,
} from "@/domain/session-tags";

export function SessionTagPicker({
  catalog,
  selectedIds,
  onChange,
  defaultOpen = false,
}: {
  catalog: SessionTagCatalog;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  defaultOpen?: boolean;
}) {
  const tags = enabledSessionTags(catalog);
  if (tags.length === 0) return null;

  const selected = new Set(selectedIds);

  return (
    <details
      className="rounded-lg border border-zinc-200 bg-zinc-50/80 open:bg-white"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{LABELS.sessionTags.pickerTitle}</span>
          <span className="text-xs font-normal text-zinc-500 tabular-nums">
            {selectedIds.length > 0
              ? `${selectedIds.length}${LABELS.sessionTags.selectedCount}`
              : LABELS.sessionTags.noneSelected}
          </span>
        </span>
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-3 py-3">
        {tags.map((tag) => {
          const on = selected.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={on}
              className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-800 active:bg-zinc-100"
              }`}
              onClick={() => onChange(toggleTagId(selectedIds, tag.id))}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}
