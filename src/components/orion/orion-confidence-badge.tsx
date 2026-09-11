"use client";

import { cn } from "@/lib/utils";
import type { OrionConfidence } from "@/lib/orion/types";

const STYLES: Record<OrionConfidence, string> = {
  Verified: "bg-success/15 text-success border-success/30",
  Derived: "bg-primary/10 text-primary border-primary/30",
  Implementation: "bg-muted text-muted-foreground border-border",
  Unknown: "bg-warning/15 text-warning border-warning/30",
};

export function OrionConfidenceBadge({
  confidence,
  className,
}: {
  confidence: OrionConfidence;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STYLES[confidence],
        className
      )}
    >
      {confidence}
    </span>
  );
}
