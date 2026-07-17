import { formatAppDate } from "@/lib/app-locale";
import type { SettlementDataAvailability } from "@/types/database";

type SettlementUnavailableNoticeProps = {
  availability: SettlementDataAvailability;
};

/**
 * Informational notice when Model C / WB Settlement cannot be shown yet.
 * Not an application error — Wildberries realization report lag.
 */
export function SettlementUnavailableNotice({
  availability,
}: SettlementUnavailableNoticeProps) {
  const latest = availability.latestRealizationReportDate
    ? formatAppDate(availability.latestRealizationReportDate)
    : "—";
  const selected = `${formatAppDate(availability.selectedFrom)} → ${formatAppDate(availability.selectedTo)}`;

  return (
    <div
      role="status"
      className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground">
        Settlement data is not yet available for the selected period.
      </p>
      <dl className="mt-3 space-y-1.5">
        <div className="flex flex-wrap gap-x-2">
          <dt>Latest available realization report:</dt>
          <dd className="font-medium text-foreground">{latest}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Selected period:</dt>
          <dd className="font-medium text-foreground">{selected}</dd>
        </div>
      </dl>
      <p className="mt-3">
        Commercial Dashboard is available. Accounting and WB Settlement will become available
        after Wildberries publishes the realization report.
      </p>
    </div>
  );
}
