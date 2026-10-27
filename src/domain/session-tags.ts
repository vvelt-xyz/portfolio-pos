/**
 * Session tags (L1 master): store-defined flags for analytics axes.
 * MUST: Freeze selected tags onto Sale at checkout (id + label).
 * EN: Session tags are a configurable master; Sale stores a frozen snapshot.
 */
import { z } from "zod";

/** Built-in id for “新規” — seeded by default; stores may rename/disable. */
export const NEW_VISIT_TAG_ID = "new_visit";

export const SessionTagDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
});
export type SessionTagDef = z.infer<typeof SessionTagDefSchema>;

export const SessionTagCatalogSchema = z.object({
  version: z.number().int().min(1),
  tags: z.array(SessionTagDefSchema),
});
export type SessionTagCatalog = z.infer<typeof SessionTagCatalogSchema>;

/** Frozen on Sale header at checkout. */
export const FrozenSessionTagSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type FrozenSessionTag = z.infer<typeof FrozenSessionTagSchema>;

export const DEFAULT_SESSION_TAGS: SessionTagDef[] = [
  { id: NEW_VISIT_TAG_ID, label: "新規", sortOrder: 10, enabled: true },
  { id: "coupon", label: "クーポン利用", sortOrder: 20, enabled: true },
  { id: "flyer", label: "チラシ持参", sortOrder: 30, enabled: true },
  { id: "nearby", label: "近所", sortOrder: 40, enabled: true },
  { id: "far", label: "遠方", sortOrder: 50, enabled: true },
  { id: "pickup", label: "送迎あり", sortOrder: 60, enabled: true },
];

export const DEFAULT_SESSION_TAG_CATALOG: SessionTagCatalog = {
  version: 1,
  tags: DEFAULT_SESSION_TAGS,
};

export function migrateSessionTagCatalog(raw: unknown): SessionTagCatalog {
  const parsed = SessionTagCatalogSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ...parsed.data,
      tags: [...parsed.data.tags].sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }
  return structuredClone(DEFAULT_SESSION_TAG_CATALOG);
}

export function enabledSessionTags(
  catalog: SessionTagCatalog,
): SessionTagDef[] {
  return catalog.tags
    .filter((t) => t.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveFrozenSessionTags(
  tagIds: string[] | undefined,
  catalog: SessionTagCatalog,
): FrozenSessionTag[] {
  if (!tagIds?.length) return [];
  const byId = new Map(catalog.tags.map((t) => [t.id, t]));
  const out: FrozenSessionTag[] = [];
  for (const id of tagIds) {
    const def = byId.get(id);
    if (def) {
      out.push({ id: def.id, label: def.label });
    } else {
      out.push({ id, label: id });
    }
  }
  return out;
}

/** Lift legacy guests.isNewVisit into tagIds (idempotent). */
export function mergeNewVisitTagIds(
  tagIds: string[] | undefined,
  isNewVisit: boolean | undefined,
): string[] {
  const ids = [...(tagIds ?? [])];
  if (isNewVisit && !ids.includes(NEW_VISIT_TAG_ID)) {
    ids.push(NEW_VISIT_TAG_ID);
  }
  return ids;
}

export function toggleTagId(tagIds: string[], id: string): string[] {
  return tagIds.includes(id)
    ? tagIds.filter((x) => x !== id)
    : [...tagIds, id];
}
