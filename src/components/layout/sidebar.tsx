"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Coins,
  Activity,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  TrendingUp,
  Warehouse,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSidebar } from "@/components/layout/sidebar-context";
import { markNavigationStart } from "@/lib/perf/perf-client";
import { buildNavHrefWithContext } from "@/lib/product-context";
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

/** Primary nav — workflow order (UX Refresh v1.0). */
export const SIDEBAR_PRIMARY_NAVIGATION: SidebarNavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Product Analytics", href: "/analytics/products", icon: LineChart },
  { name: "Smart Pricing", href: "/analytics/pricing", icon: Tag },
  { name: "Inventory", href: "/inventory", icon: Warehouse },
  { name: "Purchases", href: "/purchases", icon: ShoppingBag },
  { name: "Cost Management", href: "/costs", icon: Coins },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Orion", href: "/orion", icon: Sparkles },
  { name: "Production Health", href: "/monitoring", icon: Activity },
];

/** Settings stays separated from operational workflow. */
export const SIDEBAR_SETTINGS_NAVIGATION: SidebarNavItem[] = [
  { name: "Administration", href: "/administration", icon: Shield },
  { name: "Settings", href: "/settings/companies", icon: Settings },
];

/** Flat list for consumers that need every item (tests / audits). */
export const SIDEBAR_NAVIGATION: SidebarNavItem[] = [
  ...SIDEBAR_PRIMARY_NAVIGATION,
  ...SIDEBAR_SETTINGS_NAVIGATION,
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/administration") return pathname.startsWith("/administration");
  if (href === "/settings/companies") return pathname.startsWith("/settings");
  if (href === "/inventory") return pathname.startsWith("/inventory");
  if (href === "/orion") return pathname.startsWith("/orion");
  return pathname.startsWith(href);
}

function hrefWithNavParams(base: string, searchParams: Pick<URLSearchParams, "get">): string {
  return buildNavHrefWithContext(base, searchParams);
}

function SidebarNavItemLink({
  item,
  pathname,
  hrefForItem,
  collapsed,
}: {
  item: SidebarNavItem;
  pathname: string;
  hrefForItem: (base: string) => string;
  collapsed: boolean;
}) {
  const isActive = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={hrefForItem(item.href)}
      prefetch
      title={collapsed ? item.name : undefined}
      onClick={() => markSidebarNav(item.href)}
      className={cn(
        "relative flex items-center text-sm font-medium transition-ui",
        "rounded-[var(--radius-control)]",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
        isActive
          ? "bg-primary/12 text-primary"
          : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
      )}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.name}</span>}
    </Link>
  );
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
      {SIDEBAR_PRIMARY_NAVIGATION.map((item) => (
        <SidebarNavItemLink
          key={item.name}
          item={item}
          pathname={pathname}
          hrefForItem={hrefForItem}
          collapsed={collapsed}
        />
      ))}

      <div
        role="separator"
        className={cn(
          "my-2 border-t border-border",
          collapsed ? "mx-1" : "mx-1"
        )}
      />

      {SIDEBAR_SETTINGS_NAVIGATION.map((item) => (
        <SidebarNavItemLink
          key={item.name}
          item={item}
          pathname={pathname}
          hrefForItem={hrefForItem}
          collapsed={collapsed}
        />
      ))}
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
      hrefForItem={(base) => hrefWithNavParams(base, searchParams)}
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
        "flex items-center transition-ui hover:bg-card-hover/80",
        "rounded-[var(--radius-control)] bg-card-hover",
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-success/10">
        <TrendingUp className="h-4 w-4 text-success" />
      </div>
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Marketplaces</p>
            <p className="text-secondary-label">Company & account sync</p>
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
      href={hrefWithNavParams("/settings/companies", searchParams)}
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
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card",
        "transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-standard)]",
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-gradient-to-br from-primary to-accent">
              <ShoppingBag className="h-4 w-4 text-primary-foreground" />
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
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground",
            "rounded-[var(--radius-control)] transition-ui hover:bg-card-hover hover:text-foreground"
          )}
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

      <div className={cn("space-y-1 border-t border-border", collapsed ? "p-2" : "p-3")}>
        <Suspense fallback={<SidebarFooterLink href="/settings/companies" collapsed={collapsed} />}>
          <SidebarFooterWithScope collapsed={collapsed} />
        </Suspense>
        <a
          href="/auth/logout"
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center text-muted-foreground transition-ui hover:bg-card-hover/80 hover:text-foreground",
            "rounded-[var(--radius-control)]",
            collapsed ? "justify-center p-2" : "gap-3 px-3 py-2 text-xs font-medium"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </a>
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
        "inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground",
        "rounded-[var(--radius-control)] transition-ui hover:bg-card-hover hover:text-foreground",
        className
      )}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
