/**
 * Trend Analysis — structured daily / weekly / monthly datasets from overview series.
 * Calendar bucketing only — no new business formulas.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";

export type TrendPoint = {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  ordersCount: number;
  purchasesCount: number;
};

export type TrendsData = {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  monthly: TrendPoint[];
};

function isoWeekKey(dateStr: string): { key: string; label: string } {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  const year = thursday.getUTCFullYear();
  const key = `${year}-W${String(week).padStart(2, "0")}`;
  return { key, label: key };
}

function monthKey(dateStr: string): { key: string; label: string } {
  const key = dateStr.slice(0, 7);
  return { key, label: key };
}

function rollup(
  points: Array<{
    date: string;
    revenue: number;
    profit: number;
    ordersCount: number;
    purchasesCount: number;
  }>,
  bucket: (date: string) => { key: string; label: string }
): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const point of points) {
    const { key, label } = bucket(point.date);
    const acc = map.get(key) ?? {
      key,
      label,
      revenue: 0,
      profit: 0,
      ordersCount: 0,
      purchasesCount: 0,
    };
    acc.revenue += point.revenue;
    acc.profit += point.profit;
    acc.ordersCount += point.ordersCount;
    acc.purchasesCount += point.purchasesCount;
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildTrendsSection(ctx: ReportContext): ReportSection<TrendsData> {
  const ordersByDate = new Map(
    ctx.overview.ordersPurchases.dailyOrdersPurchases.map((d) => [d.date, d])
  );

  const dailyMerged = ctx.overview.dailyRevenue.map((d) => {
    const op = ordersByDate.get(d.date);
    return {
      date: d.date,
      revenue: d.revenue,
      profit: d.profit,
      ordersCount: op?.ordersCount ?? 0,
      purchasesCount: op?.purchasesCount ?? 0,
    };
  });

  const daily: TrendPoint[] = dailyMerged.map((d) => ({
    key: d.date,
    label: d.date,
    revenue: d.revenue,
    profit: d.profit,
    ordersCount: d.ordersCount,
    purchasesCount: d.purchasesCount,
  }));

  return {
    id: "trends",
    kind: "trends",
    title: "Trend Analysis",
    description: "Daily, weekly, and monthly structured trend datasets (no charts)",
    data: {
      daily,
      weekly: rollup(dailyMerged, isoWeekKey),
      monthly: rollup(dailyMerged, monthKey),
    },
  };
}
