/** Last calendar day with synchronized data (UTC date portion of last_successful_sync_at). */
export function lastSyncDateKey(lastSyncAt: string | null | undefined): string | null {
  if (!lastSyncAt) return null;
  return lastSyncAt.slice(0, 10);
}

/** True when the selected end date is after the last successful sync day. */
export function isEndDateNewerThanLastSync(
  to: string,
  lastSyncAt: string | null | undefined
): boolean {
  const lastSyncDay = lastSyncDateKey(lastSyncAt);
  if (!lastSyncDay) return true;
  return to > lastSyncDay;
}

/** True when any part of the selected range is after the last successful sync day. */
export function rangeExtendsBeyondLastSync(
  from: string,
  to: string,
  lastSyncAt: string | null | undefined
): boolean {
  const lastSyncDay = lastSyncDateKey(lastSyncAt);
  if (!lastSyncDay) return false;
  return from > lastSyncDay || to > lastSyncDay;
}

export function formatLastSyncTimestamp(lastSyncAt: string): string {
  const parsed = new Date(lastSyncAt);
  if (Number.isNaN(parsed.getTime())) {
    return lastSyncAt.slice(0, 10);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(parsed);
}

export function formatLastSyncDayLabel(lastSyncAt: string | null | undefined): string {
  const day = lastSyncDateKey(lastSyncAt);
  if (!day) return "Never";

  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export const SYNC_DATE_PARAM = {
  manual: "dateManual",
  adjusted: "syncAdjusted",
  accountSwitched: "accountSwitched",
} as const;
