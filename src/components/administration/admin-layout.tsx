"use client";

import type { ReactNode } from "react";
import { AdminHeader } from "@/components/administration/admin-header";
import { AdminSidebar } from "@/components/administration/admin-sidebar";

type AdminLayoutProps = {
  children: ReactNode;
  /** Optional override for Overview (custom header). */
  title?: string;
  description?: string;
  showHeader?: boolean;
};

/**
 * Shared Administration chrome — sidebar + header + content container.
 * Reuses app design tokens; separate from DashboardLayout to avoid double sidebars.
 */
export function AdminLayout({
  children,
  title,
  description,
  showHeader = true,
}: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <main className="min-h-screen pl-64">
        <div className="w-full max-w-none px-3 py-4 sm:px-4 lg:px-5 xl:px-6 2xl:px-8">
          {showHeader ? <AdminHeader title={title} description={description} /> : null}
          <div className="pb-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
