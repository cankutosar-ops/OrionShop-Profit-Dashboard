"use client";

import { cn } from "@/lib/utils";
import type { UserStatus } from "@/services/administration-user-service";

const LABEL: Record<UserStatus, string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

const TONE: Record<UserStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  invited: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  disabled: "bg-muted text-muted-foreground",
};

type UserStatusBadgeProps = {
  status: UserStatus;
  className?: string;
};

export function UserStatusBadge({ status, className }: UserStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE[status],
        className
      )}
    >
      {LABEL[status]}
    </span>
  );
}
