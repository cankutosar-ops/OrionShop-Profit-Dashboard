"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { copyScopeQueryParams } from "@/lib/filter-params";
import { cn } from "@/lib/utils";

const MODULE_TABS = [
  { id: "stock", label: "Stock", href: "/inventory" },
  {
    id: "warehouse-sales",
    label: "Warehouse Sales",
    href: "/inventory/warehouse-sales",
  },
  {
    id: "intelligence",
    label: "Inventory Intelligence",
    href: "/inventory/intelligence",
  },
] as const;

/**
 * Inventory module entry points: Stock | Warehouse Sales | Inventory Intelligence.
 */
export function InventoryModuleNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefWithScope = (base: string) => {
    const params = new URLSearchParams();
    copyScopeQueryParams(params, searchParams);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  return (
    <nav
      className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-1"
      aria-label="Inventory module"
    >
      {MODULE_TABS.map((tab) => {
        const active =
          tab.href === "/inventory"
            ? pathname === "/inventory"
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.id}
            href={hrefWithScope(tab.href)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
