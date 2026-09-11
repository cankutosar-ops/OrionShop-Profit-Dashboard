"use client";

import { cn } from "@/lib/utils";
import type { SecurityHealthTone } from "@/lib/administration/security-types";

const TONE: Record<SecurityHealthTone, string> = {
  healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  missing: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const LABEL: Record<SecurityHealthTone, string> = {
  healthy: "Healthy",
  warning: "Warning",
  expired: "Expired",
  missing: "Missing",
};

type SecurityStatusCardProps = {
  label: string;
  status: SecurityHealthTone;
  detail?: string;
  value?: string | number;
  className?: string;
};

export function SecurityStatusCard({
  label,
  status,
  detail,
  value,
  className,
}: SecurityStatusCardProps) {
  return (
    <article className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            TONE[status]
          )}
        >
          {LABEL[status]}
        </span>
      </div>
      {value !== undefined ? (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      ) : null}
      {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
    </article>
  );
}
