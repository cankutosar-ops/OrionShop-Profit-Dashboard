/**
 * Sprint 7.1.B — Public auth paths (no session required).
 */

export const AUTH_PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/logout",
] as const;

export const AUTH_PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/callback",
] as const;

export function isAuthPublicPath(pathname: string): boolean {
  if (AUTH_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (pathname === "/auth/logout" || pathname === "/api/auth/logout") return true;
  return AUTH_PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
