import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminMetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  /** Visual tone for placeholder status — no live health logic. */
  tone?: "default" | "success" | "warning" | "danger";
  icon?: ReactNode;
};

const TONE_CLASS: Record<NonNullable<AdminMetricCardProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

/** Operational metric card for Administration Overview (placeholder data OK). */
export function AdminMetricCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: AdminMetricCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", TONE_CLASS[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </article>
  );
}
