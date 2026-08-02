"use client";

import { cn } from "@/lib/utils";
import type { PlatformRole } from "@/lib/security/roles";
import { platformRoleLabel } from "@/lib/security/roles";

const TONE: Record<PlatformRole, string> = {
  administrator: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  manager: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  operator: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  viewer: "bg-muted text-muted-foreground",
};

type RoleBadgeProps = {
  role: PlatformRole | null | undefined;
  className?: string;
};

export function RoleBadge({ role, className }: RoleBadgeProps) {
  if (!role) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground",
          className
        )}
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE[role],
        className
      )}
    >
      {platformRoleLabel(role)}
    </span>
  );
}
