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
        "rounded-2xl border border-border bg-card p-6 transition-colors hover:border-border/80",
        className
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
