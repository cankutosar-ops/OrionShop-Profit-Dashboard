"use client";

import { Suspense } from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { AccountSwitchProvider } from "@/components/layout/account-switch-context";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { PerfPageProbe } from "@/components/perf/perf-page-probe";
import { cn } from "@/lib/utils";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed, hydrated } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={cn(
          "min-h-screen transition-[padding] duration-200 ease-out",
          hydrated ? (collapsed ? "pl-16" : "pl-64") : "pl-64"
        )}
      >
        <div className="w-full max-w-none px-3 py-4 sm:px-4 lg:px-5 xl:px-6 2xl:px-8">
          <Suspense fallback={null}>
            <PerfPageProbe />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SidebarProvider>
        <Suspense fallback={null}>
          <AccountSwitchProvider>
            <DashboardShell>{children}</DashboardShell>
          </AccountSwitchProvider>
        </Suspense>
      </SidebarProvider>
    </QueryProvider>
  );
}
