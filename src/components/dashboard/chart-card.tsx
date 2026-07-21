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
    <div className={cn("mb-6 flex items-start justify-between gap-3", className)}>
      <div>
        <h3 className="text-card-title">{title}</h3>
        {description ? <p className="text-kpi-label mt-1">{description}</p> : null}
      </div>
      {action}
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
        "border border-border bg-card p-6 transition-ui hover:border-border/80",
        "rounded-[var(--radius-card)] shadow-[var(--shadow-card)]",
        className
      )}
    >
      <ChartHeader title={title} description={description} action={action} />
      {children}
    </div>
  );
}
