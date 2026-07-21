import { cn } from "@/lib/utils";

type ChartCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
};

export function ChartCard({ title, description, children, className, action }: ChartCardProps) {
  return (
    <div
      className={cn(
        "border border-border bg-card p-6 transition-ui hover:border-border/80",
        "rounded-[var(--radius-card)]",
        className
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-card-title">{title}</h3>
          {description && <p className="text-kpi-label mt-1">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
