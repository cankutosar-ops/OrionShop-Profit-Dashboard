/**
 * Platform roles — display / claim metadata for Administration (Sprint 11.4).
 * Does not replace AuthZ 7.1.C tenant membership. Not a new permission engine.
 */

export const PLATFORM_ROLES = [
  "administrator",
  "manager",
  "operator",
  "viewer",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  administrator: "Administrator",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer",
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return PLATFORM_ROLES.includes(String(value ?? "").toLowerCase() as PlatformRole);
}

export function normalizePlatformRole(value: unknown): PlatformRole | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "admin") return "administrator";
  if (isPlatformRole(raw)) return raw;
  return null;
}

export function platformRoleLabel(role: PlatformRole | null | undefined): string {
  if (!role) return "—";
  return PLATFORM_ROLE_LABEL[role] ?? role;
}
