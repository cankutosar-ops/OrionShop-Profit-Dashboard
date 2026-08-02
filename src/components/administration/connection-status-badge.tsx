"use client";

import { cn } from "@/lib/utils";
import {
  CONNECTION_STATUS_LABEL,
  type ConnectionDisplayStatus,
} from "@/lib/administration/connection-status";

const TONE: Record<ConnectionDisplayStatus, string> = {
  connected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  connecting: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  synchronizing: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  historical_backfill: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  incremental: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  disconnected: "bg-muted text-muted-foreground",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
};

type ConnectionStatusBadgeProps = {
  status: ConnectionDisplayStatus;
  className?: string;
};

export function ConnectionStatusBadge({ status, className }: ConnectionStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE[status],
        className
      )}
    >
      {CONNECTION_STATUS_LABEL[status]}
    </span>
  );
}
