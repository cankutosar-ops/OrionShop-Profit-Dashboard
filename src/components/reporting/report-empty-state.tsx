type ReportEmptyStateProps = {
  title?: string;
  description?: string;
};

export function ReportEmptyState({
  title = "No data for this period",
  description = "Adjust date range, company, marketplace, or brand filters and try again.",
}: ReportEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
