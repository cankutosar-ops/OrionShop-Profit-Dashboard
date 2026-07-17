import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatAppDate } from "@/lib/app-locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(date: string): string {
  return formatAppDate(date);
}

export function getDefaultDateRange(): { from: string; to: string } {
  return buildInclusiveDateRange(30);
}

/** Last N calendar days inclusive of today (N=30 → today and the prior 29 days). */
export function buildInclusiveDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export function parseDateRange(
  from?: string | null,
  to?: string | null
): { from: string; to: string } {
  const defaults = getDefaultDateRange();
  return {
    from: from ?? defaults.from,
    to: to ?? defaults.to,
  };
}
