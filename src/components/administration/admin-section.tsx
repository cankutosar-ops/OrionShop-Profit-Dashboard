import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** Content section wrapper for Administration pages. */
export function AdminSection({
  title,
  description,
  children,
  className,
}: AdminSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || description) && (
        <div className="min-w-0">
          {title ? (
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}
