/**
 * Display-only formatters for report preview.
 * Never compute business metrics — only format ReportDocument values.
 */
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export function reportMoney(
  value: number | null | undefined,
  currency: string
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatCurrency(value, currency);
}

export function reportNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value);
}

export function reportPercent(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPercent(value, decimals);
}

export function reportText(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "—";
  return value;
}
