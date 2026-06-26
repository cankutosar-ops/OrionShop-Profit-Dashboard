"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  LineChart,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Product Analytics", href: "/analytics/products", icon: LineChart },
  { name: "Smart Pricing", href: "/analytics/pricing", icon: Tag },
  { name: "Decision Simulator", href: "/analytics/simulator", icon: Zap },
  { name: "Products", href: "/products", icon: Package },
  { name: "Costs", href: "/costs", icon: Coins },
  { name: "Categories", href: "/categories", icon: BarChart3 },
  { name: "Product Audit", href: "/audit/product-profitability", icon: ClipboardCheck },
  { name: "Settings", href: "/settings/companies", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefWithQueryParams(base: string) {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const company = searchParams.get("company");
    const account = searchParams.get("account");
    if (!from && !to && !company && !account) return base;

    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (company) params.set("company", company);
    if (account) params.set("account", account);
    return `${base}?${params.toString()}`;
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
          <ShoppingBag className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight">OrionShop</h1>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Profit Dashboard
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/settings/companies"
                ? pathname.startsWith("/settings")
                : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={hrefWithQueryParams(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <Link
          href={hrefWithQueryParams("/settings/companies")}
          className="flex items-center gap-3 rounded-xl bg-card-hover px-3 py-2.5 transition-colors hover:bg-card-hover/80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium">Marketplaces</p>
            <p className="text-[10px] text-muted-foreground">Company & account sync</p>
          </div>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </aside>
  );
}
