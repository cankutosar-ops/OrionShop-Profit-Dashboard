import { cn } from "@/lib/utils";

export type DisplayHealthState = "healthy" | "warning" | "degraded" | "failed" | "unknown";

const TONE: Record<DisplayHealthState, string> = {
  healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  degraded: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
  unknown: "bg-muted text-muted-foreground",
};

const LABEL: Record<DisplayHealthState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  degraded: "Degraded",
  failed: "Failed",
  unknown: "Unknown",
};

export function mapOpsHealthState(state: string): DisplayHealthState {
  switch (state) {
    case "healthy":
      return "healthy";
    case "sync_delayed":
      return "warning";
    case "degraded":
      return "degraded";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

export function HealthStateBadge({ state }: { state: DisplayHealthState | string }) {
  const normalized = (
    ["healthy", "warning", "degraded", "failed", "unknown"].includes(state)
      ? state
      : mapOpsHealthState(state)
  ) as DisplayHealthState;

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE[normalized]
      )}
    >
      {LABEL[normalized]}
    </span>
  );
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

export function formatInterval(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

export function nextRunAt(lastEnqueuedAt: string | null, intervalMs: number): string {
  const last = lastEnqueuedAt ? new Date(lastEnqueuedAt).getTime() : 0;
  return formatWhen(new Date(last + intervalMs).toISOString());
}
