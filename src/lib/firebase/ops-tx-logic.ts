/**
 * Pure decisions for multi-device ops. Firestore transactions call these.
 * EN: No I/O. Tests can lock the rules without an emulator.
 */

export function saleDocIdForSession(sessionId: string): string {
  return sessionId;
}

/** Keep other dates. Advance only today's counter from the cloud map just read. */
export function nextDailySeq(
  dailySeqByDate: Record<string, number> | undefined,
  businessDate: string,
): { dailySeqByDate: Record<string, number>; nextSeq: number } {
  const base = { ...(dailySeqByDate ?? {}) };
  const nextSeq = (base[businessDate] ?? 0) + 1;
  base[businessDate] = nextSeq;
  return { dailySeqByDate: base, nextSeq };
}

/**
 * A seat is taken only while its active session document is still open.
 * A missing or closed session does not block (stale seat pointer).
 */
export function seatIsOccupied(input: {
  activeSessionId: string | null | undefined;
  sessionStatus: "open" | "closed" | "missing";
}): boolean {
  if (!input.activeSessionId) return false;
  return input.sessionStatus === "open";
}

export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

/** Serving a line does not change the bill. Qty and cancel do. */
export function patchBumpsLineRevision(
  patches: readonly { qty?: number; status?: string }[],
): boolean {
  return patches.some(
    (p) =>
      p.qty !== undefined ||
      (p.status !== undefined && p.status !== "served"),
  );
}

export type ChargeRow = {
  lineId: string;
  qty: number;
  unitPriceTaxIncluded: number;
};

/** Same bill means the same lines, quantities, and charged unit prices. */
export function sameCharge(
  a: readonly ChargeRow[],
  b: readonly ChargeRow[],
): boolean {
  if (a.length !== b.length) return false;
  const key = (rows: readonly ChargeRow[]) =>
    [...rows]
      .map((r) => `${r.lineId}:${r.qty}:${r.unitPriceTaxIncluded}`)
      .sort();
  const left = key(a);
  const right = key(b);
  return left.every((item, i) => item === right[i]);
}

export function checkoutRevisionMatches(input: {
  serverRevision: number | undefined;
  serverLineIds: readonly string[] | undefined;
  serverWriteOffIds: readonly string[] | undefined;
  seenRevision: number;
  seenLineIds: readonly string[];
  seenWriteOffIds: readonly string[];
}): boolean {
  const revision = input.serverRevision ?? 0;
  if (revision !== input.seenRevision) return false;
  if (!sameIdSet(input.serverLineIds ?? [], input.seenLineIds)) return false;
  if (!sameIdSet(input.serverWriteOffIds ?? [], input.seenWriteOffIds))
    return false;
  return true;
}

/** Overlay only the fields the operator changed. Cloud keeps qty when marking served. */
export function mergeLinePatch(
  current: { qty: number; status: string },
  patch: { qty?: number; status?: string },
): { qty: number; status: string } {
  return {
    qty: patch.qty ?? current.qty,
    status: patch.status ?? current.status,
  };
}

export function reverseQtyFits(
  originalQtyByLine: readonly number[],
  applied: Readonly<Record<string, number>>,
  next: readonly { index: number; qty: number }[],
): boolean {
  const used = { ...applied };
  for (const row of next) {
    const max = originalQtyByLine[row.index] ?? 0;
    const sum = (used[String(row.index)] ?? 0) + row.qty;
    if (row.qty < 1 || sum > max) return false;
    used[String(row.index)] = sum;
  }
  return true;
}

export function addReverseQty(
  applied: Readonly<Record<string, number>>,
  next: readonly { index: number; qty: number }[],
): Record<string, number> {
  const used = { ...applied };
  for (const row of next) {
    const key = String(row.index);
    used[key] = (used[key] ?? 0) + row.qty;
  }
  return used;
}
