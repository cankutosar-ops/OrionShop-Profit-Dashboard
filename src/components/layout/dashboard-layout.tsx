import { Suspense } from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { Sidebar } from "@/components/layout/sidebar";

function SidebarFallback() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-card" />
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <div className="min-h-screen bg-background">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar />
        </Suspense>
        <main className="pl-64">
          <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
        </main>
      </div>
    </QueryProvider>
  );
}
