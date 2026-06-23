"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

type BarChartData = {
  label: string;
  value: number;
  secondary?: number;
};

type ProfitBarChartProps = {
  data: BarChartData[];
  valueLabel?: string;
  secondaryLabel?: string;
  color?: string;
  secondaryColor?: string;
  formatValue?: (value: number) => string;
};

function CustomTooltip({
  active,
  payload,
  label,
  valueLabel,
  secondaryLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; fill: string }[];
  label?: string;
  valueLabel: string;
  secondaryLabel?: string;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-sm font-medium" style={{ color: entry.fill }}>
          {entry.dataKey === "value" ? valueLabel : secondaryLabel}:{" "}
          {formatValue(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ProfitBarChart({
  data,
  valueLabel = "Profit",
  secondaryLabel,
  color = "#8b5cf6",
  secondaryColor = "#6366f1",
  formatValue = formatCurrency,
}: ProfitBarChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272f" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          stroke="#71717a"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip
          content={
            <CustomTooltip
              valueLabel={valueLabel}
              secondaryLabel={secondaryLabel}
              formatValue={formatValue}
            />
          }
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
        {secondaryLabel && (
          <Bar dataKey="secondary" fill={secondaryColor} radius={[6, 6, 0, 0]} maxBarSize={48} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
