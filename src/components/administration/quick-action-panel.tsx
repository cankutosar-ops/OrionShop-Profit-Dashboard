"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
};

type QuickActionPanelProps = {
  actions: QuickAction[];
  className?: string;
};

export function QuickActionPanel({ actions, className }: QuickActionPanelProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        const content = (
          <>
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span>{action.label}</span>
          </>
        );
        const classNameBtn = cn(
          "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-ui",
          "hover:bg-card-hover disabled:pointer-events-none disabled:opacity-50"
        );

        if (action.href && !action.disabled) {
          return (
            <Link key={action.label} href={action.href} className={classNameBtn}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            className={classNameBtn}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
