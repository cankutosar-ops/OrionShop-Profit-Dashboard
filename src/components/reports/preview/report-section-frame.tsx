import { cn } from "@/lib/utils";
import type { ReportSection } from "@/lib/reporting/types";

export function findReportSection<T>(
  sections: ReportSection[],
  id: string
): ReportSection<T> | undefined {
  return sections.find((s) => s.id === id) as ReportSection<T> | undefined;
}

type ReportSectionFrameProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Stable id for print / anchor navigation */
  sectionId?: string;
};

/**
 * Canonical BI Workspace section chrome.
 * Hierarchy: Title → Description → (children: KPIs → viz → table → notes)
 */
export function ReportSectionFrame({
  title,
  description,
  children,
  className,
  sectionId,
}: ReportSectionFrameProps) {
  return (
    <section
      id={sectionId}
      className={cn(
        "report-workspace-section break-inside-avoid rounded-2xl border border-border bg-card p-5 sm:p-6 print:rounded-none print:border print:border-black/20 print:bg-white print:p-4 print:shadow-none",
        className
      )}
    >
      <header className="mb-5 border-b border-border/60 pb-3.5 print:border-black/15">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="space-y-0">{children}</div>
    </section>
  );
}

type ReportKpiItem = {
  label: string;
  value: string;
  hint?: string;
  /** Emphasize primary management KPIs (e.g. Executive strip). */
  emphasis?: "primary" | "default";
};

type ReportKpiGridProps = {
  items: ReportKpiItem[];
  /** Force column count on large screens */
  columns?: 2 | 3 | 4;
  className?: string;
};

export function ReportKpiGrid({
  items,
  columns = 4,
  className,
}: ReportKpiGridProps) {
  const lgCols =
    columns === 2
      ? "lg:grid-cols-2"
      : columns === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-4";

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-2",
        lgCols,
        "print:grid-cols-4",
        className
      )}
    >
      {items.map((item) => {
        const primary = item.emphasis === "primary";
        return (
          <div
            key={item.label}
            className={cn(
              "rounded-xl border px-3.5 py-3 print:border-black/15 print:bg-white",
              primary
                ? "border-primary/25 bg-primary/5"
                : "border-border/70 bg-background/60"
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <p
              className={cn(
                "mt-1.5 font-semibold tabular-nums tracking-tight text-foreground",
                primary ? "text-lg sm:text-xl" : "text-base sm:text-[1.05rem]"
              )}
            >
              {item.value}
            </p>
            {item.hint ? (
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {item.hint}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ReportCallout({
  title,
  children,
  tone = "neutral",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: "neutral" | "info" | "warning";
}) {
  return (
    <div
      className={cn(
        "mt-5 rounded-xl border px-3.5 py-3 text-sm text-muted-foreground print:border-black/15 print:bg-transparent",
        tone === "info" && "border-primary/25 bg-primary/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5",
        tone === "neutral" && "border-border/80 bg-muted/30"
      )}
    >
      {title ? (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </p>
      ) : null}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
