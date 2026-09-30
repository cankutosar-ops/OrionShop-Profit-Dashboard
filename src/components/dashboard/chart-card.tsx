import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChartHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Shared chart header — typography and spacing for ChartCard family. */
export function ChartHeader({ title, description, action, className }: ChartHeaderProps) {
  return (
    <div className={cn("mb-5 flex flex-col items-start justify-between gap-3 sm:mb-6 sm:flex-row", className)}>
      <div className="min-w-0">
        <h3 className="text-card-title">{title}</h3>
        {description ? <p className="text-kpi-label mt-1">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type ChartCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

export function ChartCard({ title, description, children, className, action }: ChartCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden border border-border/90 bg-card p-4 transition-ui hover:border-primary/20 hover:shadow-[var(--shadow-elevated)] sm:p-6",
        "rounded-[var(--radius-card)] shadow-[var(--shadow-card)]",
        className
      )}
    >
      <ChartHeader title={title} description={description} action={action} />
      <div className="min-w-0 w-full">{children}</div>
    </div>
  );
}
