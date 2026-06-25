"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyOrdersPurchasesPoint } from "@/types/database";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type OrdersPurchasesChartProps = {
  data: DailyOrdersPurchasesPoint[];
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: DailyOrdersPurchasesPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
      <p className="mb-2 text-xs text-muted-foreground">{label ? formatDate(label) : ""}</p>
      {point && (
        <>
          <p className="text-sm font-medium text-primary">
            Orders: {formatNumber(point.ordersCount)} · {formatCurrency(point.ordersAmount)}
          </p>
          <p className="text-sm font-medium text-success">
            Purchases: {formatNumber(point.purchasesCount)} · {formatCurrency(point.purchasesAmount)}
          </p>
        </>
      )}
    </div>
  );
}

export function OrdersPurchasesChart({ data }: OrdersPurchasesChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272f" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) =>
            new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
          }
          stroke="#71717a"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="count"
          tickFormatter={(v) => formatNumber(v)}
          stroke="#71717a"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <YAxis
          yAxisId="amount"
          orientation="right"
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          stroke="#71717a"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(value) =>
            value === "ordersCount"
              ? "Orders (qty)"
              : value === "purchasesCount"
                ? "Purchases (qty)"
                : value === "ordersAmount"
                  ? "Orders (₽)"
                  : "Purchases (₽)"
          }
        />
        <Bar yAxisId="count" dataKey="ordersCount" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={12} />
        <Bar yAxisId="count" dataKey="purchasesCount" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={12} />
        <Line
          yAxisId="amount"
          type="monotone"
          dataKey="ordersAmount"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="amount"
          type="monotone"
          dataKey="purchasesAmount"
          stroke="#16a34a"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
