"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";

type CostBreakdownChartProps = {
  data: { name: string; value: number; color: string }[];
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { color: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
      <p className="text-sm font-medium" style={{ color: item.payload.color }}>
        {item.name}
      </p>
      <p className="text-sm text-foreground">{formatCurrency(item.value)}</p>
    </div>
  );
}

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-muted-foreground">
        No cost data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex-1 space-y-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatCurrency(item.value)}</span>
              <span className="w-10 text-right text-xs text-muted">
                {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
