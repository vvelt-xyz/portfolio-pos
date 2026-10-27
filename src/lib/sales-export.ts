/**
 * Excel-openable CSV export for settled sales (immutable snapshots).
 * MUST: Export from Sale snapshots only — never reprice from current catalog.
 * EN: Export frozen sale rows only; never recompute from live menu.
 */
import type { Guests, Sale } from "@/domain/types";
import { guestTotal } from "@/domain/guests";
import { PAYMENT_METHODS, SESSION_CHANNEL } from "@/constants";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: Array<string | number>): string {
  return cells.map(csvEscape).join(",");
}

/** Compact party list for a single CSV cell: male/20s:2;female/preschool:1 */
function formatGuestsParties(g: Guests | undefined): string {
  if (!g?.parties?.length) return "";
  return g.parties
    .map((p) => `${p.gender}/${p.ageBand}:${p.count}`)
    .join(";");
}

function formatSaleTags(
  tags: { id: string; label: string }[] | undefined,
): string {
  if (!tags?.length) return "";
  return tags.map((t) => t.label).join(";");
}

/** UTF-8 BOM so Excel on Windows opens Japanese correctly. */
const BOM = "\uFEFF";

export function buildSalesLinesCsv(sales: Sale[]): string {
  const header = row([
    "businessDate",
    "paidAt",
    "openedAt",
    "sessionNo",
    "channel",
    "seatLabel",
    "guestsTotal",
    "guestsParties",
    "tags",
    "method",
    "kind",
    "reversesSaleId",
    "reverseMode",
    "reversePercent",
    "saleId",
    "productId",
    "productName",
    "taxType",
    "taxRate",
    "qty",
    "unitPriceTaxIncluded",
    "unitPriceTaxExcluded",
    "unitCostTaxIncluded",
    "lineTaxIncluded",
    "lineTaxExcluded",
    "lineTaxAmount",
    "memo",
    "taxPolicyVersion",
    "complimentary",
    "listUnitPriceTaxIncluded",
  ]);
  const lines: string[] = [header];
  const sorted = sales.slice().sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  for (const sale of sorted) {
    const kind = sale.kind ?? "sale";
    if (sale.lines.length === 0 && kind === "reverse") {
      lines.push(
        row([
          sale.businessDate,
          sale.paidAt,
          sale.openedAt ?? "",
          sale.sessionNo,
          SESSION_CHANNEL[sale.channel],
          sale.seatLabel ?? "",
          guestTotal(sale.guests),
          formatGuestsParties(sale.guests),
          formatSaleTags(sale.tags),
          PAYMENT_METHODS[sale.method],
          kind,
          sale.reversesSaleId ?? "",
          sale.reverseMode ?? "",
          sale.reversePercent ?? "",
          sale.id,
          "",
          sale.reverseMode === "percent" || sale.reverseMode === "amount"
            ? `赤伝(${sale.reverseMode})`
            : "赤伝",
          "",
          "",
          "",
          "",
          "",
          "",
          sale.totalTaxIncluded,
          sale.totalTaxExcluded,
          sale.totalTaxAmount,
          sale.reason ?? "",
          sale.taxPolicyVersion ?? "",
          "",
          "",
        ]),
      );
      continue;
    }
    for (const line of sale.lines) {
      lines.push(
        row([
          sale.businessDate,
          sale.paidAt,
          sale.openedAt ?? "",
          sale.sessionNo,
          SESSION_CHANNEL[sale.channel],
          sale.seatLabel ?? "",
          guestTotal(sale.guests),
          formatGuestsParties(sale.guests),
          formatSaleTags(sale.tags),
          PAYMENT_METHODS[sale.method],
          kind,
          sale.reversesSaleId ?? "",
          sale.reverseMode ?? "",
          sale.reversePercent ?? "",
          sale.id,
          line.productId,
          line.productName,
          line.taxType,
          line.taxRate,
          sale.kind === "reverse" ? -line.qty : line.qty,
          line.unitPriceTaxIncluded,
          line.unitPriceTaxExcluded,
          line.unitCostTaxIncluded ?? "",
          line.lineTaxIncluded,
          line.lineTaxExcluded,
          line.lineTaxAmount,
          line.memo ?? sale.reason ?? "",
          sale.taxPolicyVersion ?? "",
          line.complimentary ? "1" : "",
          line.listUnitPriceTaxIncluded ?? "",
        ]),
      );
    }
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

export function buildSalesSummaryCsv(sales: Sale[]): string {
  const header = row([
    "businessDate",
    "paidAt",
    "sessionNo",
    "channel",
    "seatLabel",
    "method",
    "kind",
    "reversesSaleId",
    "reverseMode",
    "reversePercent",
    "reason",
    "saleId",
    "subtotalTaxIncluded",
    "serviceDiscountTaxIncluded",
    "totalTaxIncluded",
    "totalTaxExcluded",
    "totalTaxAmount",
    "writeOffLossTaxIncluded",
    "taxBreakdown",
    "taxPolicyVersion",
  ]);
  const lines: string[] = [header];
  const sorted = sales.slice().sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  for (const sale of sorted) {
    const breakdown = (sale.taxBreakdown ?? [])
      .map(
        (b) =>
          `${Math.round(b.taxRate * 100)}%:込${b.taxIncluded}/抜${b.taxExcluded}/税${b.taxAmount}`,
      )
      .join(" | ");
    lines.push(
      row([
        sale.businessDate,
        sale.paidAt,
        sale.sessionNo,
        SESSION_CHANNEL[sale.channel],
        sale.seatLabel ?? "",
        PAYMENT_METHODS[sale.method],
        sale.kind ?? "sale",
        sale.reversesSaleId ?? "",
        sale.reverseMode ?? "",
        sale.reversePercent ?? "",
        sale.reason ?? "",
        sale.id,
        sale.subtotalTaxIncluded,
        sale.serviceDiscount?.amountTaxIncluded ?? 0,
        sale.totalTaxIncluded,
        sale.totalTaxExcluded,
        sale.totalTaxAmount,
        sale.writeOffTotalTaxIncluded ?? 0,
        breakdown,
        sale.taxPolicyVersion ?? "",
      ]),
    );
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
