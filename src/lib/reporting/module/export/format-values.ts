/**
 * Locale-safe display formatting for CSV / PDF (presentation only).
 */

import type { ReportExportValueType } from "@/lib/reporting/module/export/export-document";

const numberFmt = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const currencyFmtCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  const key = currency || "RUB";
  let fmt = currencyFmtCache.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: key,
        maximumFractionDigits: 2,
      });
    } catch {
      fmt = new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });
    }
    currencyFmtCache.set(key, fmt);
  }
  return fmt;
}

export function formatExportCell(
  value: string | number | null | undefined,
  type: ReportExportValueType,
  currency = "RUB"
): string {
  if (value == null || value === "") return "—";
  if (type === "text") return String(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  switch (type) {
    case "currency":
      return currencyFormatter(currency).format(value);
    case "percent":
      return `${numberFmt.format(value)} %`;
    case "integer":
      return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
    case "number":
      return numberFmt.format(value);
    default:
      return String(value);
  }
}

/** Excel number format codes — values stay numeric (percent already on 0–100 scale). */
export function excelNumFmt(
  type: ReportExportValueType,
  currency = "RUB"
): string | undefined {
  switch (type) {
    case "currency":
      return currency === "RUB" ? '#,##0.00 "₽"' : `#,##0.00 "${currency}"`;
    case "percent":
      return '0.00" %"';
    case "integer":
      return "#,##0";
    case "number":
      return "#,##0.00";
    default:
      return undefined;
  }
}
