"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Coins,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShoppingBag,
  Tag,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSidebar } from "@/components/layout/sidebar-context";
import { copyScopeQueryParams } from "@/lib/filter-params";
import { markNavigationStart } from "@/lib/perf/perf-client";
import { cn } from "@/lib/utils";

function navKindForHref(href: string): string | null {
  if (href === "/analytics/pricing") return "smart_pricing_open";
  if (href === "/costs") return "costs_open";
  if (href === "/reports" || href.startsWith("/reports/")) return "reports_open";
  if (href === "/") return "dashboard_open";
  return null;
}

function markSidebarNav(href: string) {
  const kind = navKindForHref(href);
  if (kind) markNavigationStart(kind);
}

export type SidebarNavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

export const SIDEBAR_NAVIGATION: SidebarNavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Product Analytics", href: "/analytics/products", icon: LineChart },
  { name: "Cost Management", href: "/costs", icon: Coins },
  { name: "Inventory", href: "/inventory", icon: Warehouse },
  { name: "Smart Pricing", href: "/analytics/pricing", icon: Tag },
  { name: "Purchases", href: "/purchases", icon: Receipt },
  { name: "Settings", href: "/settings/companies", icon: Settings },
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/settings/companies") return pathname.startsWith("/settings");
  return pathname.startsWith(href);
}

function hrefWithScopeParams(base: string, searchParams: Pick<URLSearchParams, "get">): string {
  const params = new URLSearchParams();
  copyScopeQueryParams(params, searchParams);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function SidebarNavLinks({
  pathname,
  hrefForItem,
  collapsed,
}: {
  pathname: string;
  hrefForItem: (base: string) => string;
  collapsed: boolean;
}) {
  return (
    <>
      {SIDEBAR_NAVIGATION.map((item) => {
        const isActive = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.name}
            href={hrefForItem(item.href)}
            prefetch
            title={collapsed ? item.name : undefined}
            onClick={() => markSidebarNav(item.href)}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium transition-all",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.name}</span>}
          </Link>
        );
      })}
    </>
  );
}

function SidebarNavFallback({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <SidebarNavLinks
      pathname={pathname}
      hrefForItem={(base) => base}
      collapsed={collapsed}
    />
  );
}

function SidebarNavWithScope({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  const searchParams = useSearchParams();

  return (
    <SidebarNavLinks
      pathname={pathname}
      hrefForItem={(base) => hrefWithScopeParams(base, searchParams)}
      collapsed={collapsed}
    />
  );
}

function SidebarFooterLink({ href, collapsed }: { href: string; collapsed: boolean }) {
  return (
    <Link
      href={href}
      prefetch
      title={collapsed ? "Marketplaces" : undefined}
      className={cn(
        "flex items-center rounded-xl bg-card-hover transition-colors hover:bg-card-hover/80",
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
        <TrendingUp className="h-4 w-4 text-success" />
      </div>
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Marketplaces</p>
            <p className="text-[10px] text-muted-foreground">Company & account sync</p>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </Link>
  );
}

function SidebarFooterWithScope({ collapsed }: { collapsed: boolean }) {
  const searchParams = useSearchParams();
  return (
    <SidebarFooterLink
      href={hrefWithScopeParams("/settings/companies", searchParams)}
      collapsed={collapsed}
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, hydrated } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-64",
        !hydrated && "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "gap-2 px-3"
        )}
      >
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <ShoppingBag className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight">OrionShop</h1>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Dashboard
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-card-hover hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1 py-3", collapsed ? "px-2" : "px-3")}>
        <Suspense fallback={<SidebarNavFallback pathname={pathname} collapsed={collapsed} />}>
          <SidebarNavWithScope pathname={pathname} collapsed={collapsed} />
        </Suspense>
      </nav>

      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
        <Suspense fallback={<SidebarFooterLink href="/settings/companies" collapsed={collapsed} />}>
          <SidebarFooterWithScope collapsed={collapsed} />
        </Suspense>
      </div>
    </aside>
  );
}

/** Mobile / floating hamburger when sidebar is collapsed (extra affordance). */
export function SidebarMenuButton({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-card-hover hover:text-foreground",
        className
      )}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
