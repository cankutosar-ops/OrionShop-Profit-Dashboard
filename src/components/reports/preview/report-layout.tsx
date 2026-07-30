import { cn } from "@/lib/utils";

type ReportSubsectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Extra actions (filters, counts) aligned to the right of the title row */
  actions?: React.ReactNode;
};

/**
 * Standard mid-section block: Title → optional description → content.
 * Used under ReportSectionFrame for charts, tables, and notes.
 */
export function ReportSubsection({
  title,
  description,
  children,
  className,
  actions,
}: ReportSubsectionProps) {
  return (
    <div className={cn("mt-6 first:mt-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type ReportFilterBarProps = {
  children: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
};

/** Shared filter strip — search / selects / counts. */
export function ReportFilterBar({
  children,
  meta,
  className,
}: ReportFilterBarProps) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-end gap-3 print:hidden",
        className
      )}
    >
      {children}
      {meta ? (
        <p className="pb-2 text-xs text-muted-foreground">{meta}</p>
      ) : null}
    </div>
  );
}

type ReportFilterFieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export function ReportFilterField({
  label,
  children,
  className,
}: ReportFilterFieldProps) {
  return (
    <label
      className={cn(
        "flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {label}
      {children}
    </label>
  );
}

/** Shared control chrome for workspace filters. */
export const reportFilterControlClassName =
  "rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition-colors hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

type ReportInsightGridProps = {
  items: Array<{ label: string; value: string }>;
  className?: string;
};

/** Compact highlight cards under primary KPIs (e.g. best brand / product). */
export function ReportInsightGrid({ items, className }: ReportInsightGridProps) {
  return (
    <div
      className={cn(
        "mt-4 grid gap-3 text-sm sm:grid-cols-3",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 print:border-black/15"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 font-medium leading-snug text-foreground">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
