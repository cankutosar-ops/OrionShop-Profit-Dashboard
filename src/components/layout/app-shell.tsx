"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

const AUTH_SHELL_PREFIXES = ["/login", "/auth"];

function isAuthShellPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdminShellPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/administration" || pathname.startsWith("/administration/");
}

/**
 * Dashboard chrome for app pages; bare passthrough for auth and Administration
 * (Administration uses its own layout + auth gate under app/administration).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAuthShellPath(pathname) || isAdminShellPath(pathname)) {
    return <>{children}</>;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
}
