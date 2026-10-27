/** Business date + daily sequence → e.g. 20260914001 */
import { getTaxPolicy } from "@/domain/tax-policy";

/**
 * 営業日キー（YYYYMMDD）。カットオフ未満は前日扱い。
 * EN: Business date key; hours before cutoff belong to the previous day.
 */
export function businessDateKey(
  date = new Date(),
  timeZone = "Asia/Tokyo",
  cutoffHour: number = getTaxPolicy().businessDayCutoffHour,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  let y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  let m = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  let d = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (hour < cutoffHour) {
    const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
    y = prev.getUTCFullYear();
    m = prev.getUTCMonth() + 1;
    d = prev.getUTCDate();
  }

  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** Display helper: 20260914 → 2026-09-14 */
export function formatBusinessDateLabel(businessDate: string): string {
  if (businessDate.length !== 8) return businessDate;
  return `${businessDate.slice(0, 4)}-${businessDate.slice(4, 6)}-${businessDate.slice(6, 8)}`;
}

export function formatSessionNo(businessDate: string, seq: number): string {
  return `${businessDate}${String(seq).padStart(3, "0")}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
