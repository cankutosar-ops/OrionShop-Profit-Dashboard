import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceSummaryCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

export function WorkspaceSummaryCard({
  title,
  children,
  className,
  actions,
}: WorkspaceSummaryCardProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
