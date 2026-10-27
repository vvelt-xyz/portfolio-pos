/**
 * Guest mix: gender × age band (+ optional new-visit flag).
 * MUST: Live on session/sale header only — never on order lines.
 * EN: Guest demographics are header-level only.
 */
import { z } from "zod";

export const GuestGenderSchema = z.enum(["male", "female"]);
export type GuestGender = z.infer<typeof GuestGenderSchema>;

/** Age bands; minors are UI-grouped under 未成年 accordion. */
export const GuestAgeBandSchema = z.enum([
  "preschool",
  "elementary",
  "junior_high",
  "high_school",
  "teens",
  "20s",
  "30s",
  "40s",
  "50s",
  "60s",
  "70s",
  "80plus",
]);
export type GuestAgeBand = z.infer<typeof GuestAgeBandSchema>;

export const GuestPartySchema = z.object({
  gender: GuestGenderSchema,
  ageBand: GuestAgeBandSchema,
  count: z.number().int().positive(),
});
export type GuestParty = z.infer<typeof GuestPartySchema>;

export const GuestsSchema = z.object({
  parties: z.array(GuestPartySchema).default([]),
  /** Declared first visit for this party (session-level). */
  isNewVisit: z.boolean().optional(),
});
export type Guests = z.infer<typeof GuestsSchema>;

/** Legacy male/female/child counters (pre guest-mix v2). */
const LegacyGuestsSchema = z.object({
  male: z.number().int().min(0),
  female: z.number().int().min(0),
  child: z.number().int().min(0),
});

export const MINOR_AGE_BANDS: GuestAgeBand[] = [
  "preschool",
  "elementary",
  "junior_high",
  "high_school",
  "teens",
];

export const ADULT_AGE_BANDS: GuestAgeBand[] = [
  "20s",
  "30s",
  "40s",
  "50s",
  "60s",
  "70s",
  "80plus",
];

export function emptyGuests(): Guests {
  return { parties: [], isNewVisit: false };
}

export function guestTotal(g: Guests | undefined | null): number {
  if (!g?.parties) return 0;
  return g.parties.reduce((s, p) => s + p.count, 0);
}

export function partyCount(
  g: Guests,
  gender: GuestGender,
  ageBand: GuestAgeBand,
): number {
  return (
    g.parties.find((p) => p.gender === gender && p.ageBand === ageBand)
      ?.count ?? 0
  );
}

/** Set absolute count for a gender×age cell (0 removes the party). */
export function setPartyCount(
  g: Guests,
  gender: GuestGender,
  ageBand: GuestAgeBand,
  count: number,
): Guests {
  const next = Math.max(0, Math.floor(count));
  const others = g.parties.filter(
    (p) => !(p.gender === gender && p.ageBand === ageBand),
  );
  if (next <= 0) return { ...g, parties: others };
  return {
    ...g,
    parties: [...others, { gender, ageBand, count: next }],
  };
}

export function migrateLegacyGuests(raw: unknown): Guests {
  const legacy = LegacyGuestsSchema.safeParse(raw);
  if (legacy.success) {
    const parties: GuestParty[] = [];
    if (legacy.data.male > 0) {
      parties.push({
        gender: "male",
        ageBand: "20s",
        count: legacy.data.male,
      });
    }
    if (legacy.data.female > 0) {
      parties.push({
        gender: "female",
        ageBand: "20s",
        count: legacy.data.female,
      });
    }
    if (legacy.data.child > 0) {
      parties.push({
        gender: "male",
        ageBand: "elementary",
        count: legacy.data.child,
      });
    }
    return { parties, isNewVisit: false };
  }
  const parsed = GuestsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return emptyGuests();
}

/** Zod input that accepts legacy or v2 and always outputs Guests. */
export const GuestsInputSchema = z.preprocess(
  (raw) => {
    if (raw == null || typeof raw !== "object") return emptyGuests();
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.parties)) return o;
    if ("male" in o || "female" in o || "child" in o) {
      return migrateLegacyGuests(raw);
    }
    return emptyGuests();
  },
  GuestsSchema,
);
