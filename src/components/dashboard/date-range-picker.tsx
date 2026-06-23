"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getDefaultDateRange } from "@/lib/utils";

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaults = getDefaultDateRange();

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;

  function handleChange(field: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(field, value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <input
        type="date"
        value={from}
        onChange={(e) => handleChange("from", e.target.value)}
        className="bg-transparent text-sm text-foreground outline-none"
      />
      <span className="text-muted-foreground">—</span>
      <input
        type="date"
        value={to}
        onChange={(e) => handleChange("to", e.target.value)}
        className="bg-transparent text-sm text-foreground outline-none"
      />
    </div>
  );
}
