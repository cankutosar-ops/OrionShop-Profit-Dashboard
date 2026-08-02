import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsCardProps = {
  children: ReactNode;
  className?: string;
};

/** Card container for a settings section body. */
export function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}
