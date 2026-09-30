"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminBreadcrumb } from "@/components/administration/admin-breadcrumb";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { ADMIN_NAV_SECTIONS, findAdminNavItem } from "@/lib/administration/nav";

type AdminHeaderProps = {
  title?: string;
  description?: string;
};

export function AdminHeader({ title, description }: AdminHeaderProps) {
  const pathname = usePathname() ?? "/administration";
  const router = useRouter();
  const item = findAdminNavItem(pathname);
  const mobileNavValue = ADMIN_NAV_SECTIONS.flatMap((section) => section.items)
    .filter((navItem) => pathname === navItem.href || pathname.startsWith(`${navItem.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "/administration";
  const resolvedTitle = title ?? item?.name ?? "Administration";
  const resolvedDescription = description ?? item?.description;

  return (
    <header className="app-header-surface sticky top-0 z-30 -mx-3 mb-5 border-b border-border/70 px-3 py-3 backdrop-blur-xl sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5 xl:-mx-6 xl:px-6 2xl:-mx-8 2xl:px-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <AdminBreadcrumb pathname={pathname} />
        <ThemeSelector />
      </div>
      <label className="mb-3 block lg:hidden">
        <span className="sr-only">Administration page</span>
        <select
          value={mobileNavValue}
          onChange={(event) => router.push(event.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-[var(--shadow-card)]"
          aria-label="Administration page"
        >
          <option value="/">← Back to Dashboard</option>
          {ADMIN_NAV_SECTIONS.map((section) => (
            <optgroup key={section.id} label={section.label ?? "Administration"}>
              {section.items.map((navItem) => (
                <option key={navItem.href} value={navItem.href}>{navItem.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="min-w-0">
        <h1 className="text-page-title">{resolvedTitle}</h1>
        {resolvedDescription ? (
          <p className="text-kpi-label mt-0.5 max-w-3xl">{resolvedDescription}</p>
        ) : null}
      </div>
    </header>
  );
}
