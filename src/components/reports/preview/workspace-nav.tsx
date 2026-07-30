"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceNavItem = {
  id: string;
  label: string;
};

type WorkspaceNavProps = {
  items: WorkspaceNavItem[];
};

/**
 * Sticky section navigation for the Business Intelligence Workspace.
 * Presentation only — hash links into ReportDocument section anchors.
 */
export function WorkspaceNav({ items }: WorkspaceNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id;
        if (top) setActiveId(top);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Workspace sections"
      className="print:hidden sticky top-0 z-30 -mx-1 overflow-x-auto rounded-2xl border border-border bg-card/95 px-2.5 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85"
    >
      <ul className="flex min-w-max gap-1 text-xs">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  "inline-flex rounded-lg px-2.5 py-1.5 font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-foreground ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
