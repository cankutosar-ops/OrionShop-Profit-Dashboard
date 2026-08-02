"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { buildAdminBreadcrumbs } from "@/lib/administration/nav";

type AdminBreadcrumbProps = {
  pathname: string;
};

export function AdminBreadcrumb({ pathname }: AdminBreadcrumbProps) {
  const crumbs = buildAdminBreadcrumbs(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.href}-${index}`}>
            {index > 0 ? (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
            ) : null}
            {isLast ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate transition-ui hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
