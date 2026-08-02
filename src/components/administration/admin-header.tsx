"use client";

import { usePathname } from "next/navigation";
import { AdminBreadcrumb } from "@/components/administration/admin-breadcrumb";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { findAdminNavItem } from "@/lib/administration/nav";

type AdminHeaderProps = {
  title?: string;
  description?: string;
};

export function AdminHeader({ title, description }: AdminHeaderProps) {
  const pathname = usePathname() ?? "/administration";
  const item = findAdminNavItem(pathname);
  const resolvedTitle = title ?? item?.name ?? "Administration";
  const resolvedDescription = description ?? item?.description;

  return (
    <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-border/80 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5 xl:-mx-6 xl:px-6 2xl:-mx-8 2xl:px-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <AdminBreadcrumb pathname={pathname} />
        <ThemeSelector />
      </div>
      <div className="min-w-0">
        <h1 className="text-page-title">{resolvedTitle}</h1>
        {resolvedDescription ? (
          <p className="text-kpi-label mt-0.5 max-w-3xl">{resolvedDescription}</p>
        ) : null}
      </div>
    </header>
  );
}
