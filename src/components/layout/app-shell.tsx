"use client";

import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

const AUTH_SHELL_PREFIXES = ["/login", "/auth"];

function isAuthShellPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Uses dashboard chrome for app pages; bare shell for login/auth routes.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAuthShellPath(pathname)) {
    return <>{children}</>;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
}
