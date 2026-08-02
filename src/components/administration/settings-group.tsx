import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsGroupProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** Groups related fields inside a settings section. */
export function SettingsGroup({
  title,
  description,
  children,
  className,
}: SettingsGroupProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {title || description ? (
        <div>
          {title ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
