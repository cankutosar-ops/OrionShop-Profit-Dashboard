import { cn } from "@/lib/utils";

export type ReportEmptyVariant =
  | "no-data"
  | "not-available"
  | "coming-soon"
  | "unavailable";

const VARIANT_COPY: Record<ReportEmptyVariant, { label: string; hint: string }> = {
  "no-data": {
    label: "No data",
    hint: "Nothing to show for the selected Report Scope.",
  },
  "not-available": {
    label: "Not available",
    hint: "This metric is not in the current ReportDocument.",
  },
  "coming-soon": {
    label: "Coming soon",
    hint: "Planned for a later release — not calculated yet.",
  },
  unavailable: {
    label: "Unavailable",
    hint: "Data exists elsewhere but is not available for this scope.",
  },
};

type ReportEmptyStateProps = {
  variant?: ReportEmptyVariant;
  /** Override default label */
  label?: string;
  /** Override default hint */
  hint?: string;
  /** Inline cell style vs block panel */
  density?: "inline" | "block";
  className?: string;
};

/**
 * Shared empty / unavailable presentation for the BI Workspace.
 * One design language for No data · Not available · Coming soon · Unavailable.
 */
export function ReportEmptyState({
  variant = "no-data",
  label,
  hint,
  density = "block",
  className,
}: ReportEmptyStateProps) {
  const copy = VARIANT_COPY[variant];
  const title = label ?? copy.label;
  const subtitle = hint ?? copy.hint;

  if (density === "inline") {
    return (
      <span
        className={cn("text-muted-foreground", className)}
        title={subtitle}
      >
        {title}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center print:border-black/15 print:bg-transparent",
        className
      )}
      role="status"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** Compact table-cell unavailable marker — always the same wording. */
export function ReportUnavailableCell({
  variant = "not-available",
}: {
  variant?: ReportEmptyVariant;
}) {
  return <ReportEmptyState variant={variant} density="inline" />;
}
