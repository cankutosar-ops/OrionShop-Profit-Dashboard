import { formatAppDate } from "@/lib/app-locale";
import { formatLastSyncDayLabel, lastSyncDateKey } from "@/lib/marketplace-sync-date";

type DataBannerProps = {
  isSampleData: boolean;
  isEmptyPeriod?: boolean;
  lastSyncAt?: string | null;
  syncAdjusted?: boolean;
  dateManual?: boolean;
  message?: string;
};

function formatLastSyncDay(lastSyncAt: string | null | undefined): string {
  const day = lastSyncDateKey(lastSyncAt);
  if (!day) return "Never";
  return formatAppDate(day);
}

export function DataBanner({
  isSampleData,
  isEmptyPeriod,
  lastSyncAt,
  syncAdjusted,
  dateManual,
  message,
}: DataBannerProps) {
  if (syncAdjusted && !dateManual) {
    return (
      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <p>
          The selected marketplace has no synchronized data after{" "}
          <span className="font-medium text-foreground">{formatLastSyncDay(lastSyncAt)}</span>.
        </p>
        <p className="mt-1">Showing the latest synchronized data.</p>
      </div>
    );
  }

  if (isEmptyPeriod && dateManual) {
    return (
      <div className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          No synchronized data exists for the selected period.
        </p>
        <p className="mt-2">
          Last successful sync:
          <br />
          <span className="font-medium text-foreground">
            {formatLastSyncDayLabel(lastSyncAt)}
          </span>
        </p>
        <p className="mt-2">
          Please synchronize Wildberries or choose another date range.
        </p>
      </div>
    );
  }

  if (isEmptyPeriod) {
    return (
      <div className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No data found for the selected period.</p>
        <p className="mt-1">
          Last available sync:{" "}
          <span className="font-medium text-foreground">{formatLastSyncDay(lastSyncAt)}</span>
        </p>
        <p className="mt-1">
          Try changing the date range or synchronize Wildberries.
        </p>
      </div>
    );
  }

  if (!isSampleData && !message) return null;

  return (
    <div
      className={
        isSampleData
          ? "mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          : "mb-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      }
    >
      {isSampleData ? (
        <>
          <span className="font-medium">Sample data</span>
          {message && <> — {message}</>}
        </>
      ) : (
        <>
          <span className="font-medium">Live data</span> — connected to Supabase
        </>
      )}
    </div>
  );
}
