"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ADMIN_NAV_SECTIONS,
  isAdminNavActive,
} from "@/lib/administration/nav";
import { cn } from "@/lib/utils";

/** Main application landing — Dashboard (`/`). Client navigation only; session/theme preserved. */
const DASHBOARD_HREF = "/";

export function AdminSidebar() {
  const pathname = usePathname() ?? "/administration";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Link
          href="/administration"
          className="truncate text-sm font-semibold text-foreground transition-ui hover:text-primary"
        >
          Administration
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Administration">
        <div className="mb-3">
          <Link
            href={DASHBOARD_HREF}
            prefetch
            aria-label="Back to Dashboard"
            className={cn(
              "relative flex items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-ui",
              "text-muted-foreground hover:bg-card-hover hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <span className="truncate" aria-hidden>
              ←{" "}
            </span>
            <span className="truncate">Back to Dashboard</span>
          </Link>
          <div role="separator" className="mx-1 mt-3 border-t border-border" />
        </div>

        {ADMIN_NAV_SECTIONS.map((section, index) => (
          <div key={section.id} className={cn(index > 0 && "mt-3")}>
            {section.label ? (
              <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isAdminNavActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      className={cn(
                        "relative flex items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-ui",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary/12 text-primary"
                          : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                        />
                      ) : null}
                      <span className="truncate">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {index < ADMIN_NAV_SECTIONS.length - 1 ? (
              <div role="separator" className="mx-1 mt-3 border-t border-border" />
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
