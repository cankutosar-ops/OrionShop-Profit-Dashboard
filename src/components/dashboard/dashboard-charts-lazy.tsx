"use client";

import nextDynamic from "next/dynamic";

const skeleton = () => <div className="h-64 animate-pulse rounded-xl bg-muted/30" />;

export const RevenueChartLazy = nextDynamic(
  () => import("@/components/dashboard/revenue-chart").then((m) => m.RevenueChart),
  { ssr: false, loading: skeleton }
);

export const CostBreakdownChartLazy = nextDynamic(
  () =>
    import("@/components/dashboard/cost-breakdown-chart").then((m) => m.CostBreakdownChart),
  { ssr: false, loading: skeleton }
);

export const OrdersPurchasesChartLazy = nextDynamic(
  () =>
    import("@/components/dashboard/orders-purchases-chart").then(
      (m) => m.OrdersPurchasesChart
    ),
  { ssr: false, loading: skeleton }
);

export const ProfitBarChartLazy = nextDynamic(
  () =>
    import("@/components/dashboard/profit-bar-chart").then((m) => m.ProfitBarChart),
  { ssr: false, loading: skeleton }
);
