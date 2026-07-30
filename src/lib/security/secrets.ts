/**
 * Sprint 7.1.E — Shared secret-env helpers (no business logic).
 */

const PLACEHOLDER_RE = /^(your-|changeme|todo|xxx)/i;

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.ORION_FORCE_PRODUCTION_SECRETS === "1"
  );
}

export function isPlaceholderSecret(value: string | undefined | null): boolean {
  const v = value?.trim() ?? "";
  if (!v) return true;
  return PLACEHOLDER_RE.test(v) || v === "your-service-role-key" || v === "your-anon-key";
}

/**
 * Dedicated internal API secret for Bearer / containment signing.
 * Production: INTERNAL_API_SECRET required (never the service_role key as the API password).
 * Non-production: may fall back to SUPABASE_SERVICE_ROLE_KEY for local DX.
 */
export function resolveInternalApiSecret(): string {
  const dedicated = process.env.INTERNAL_API_SECRET?.trim() ?? "";
  if (dedicated && !isPlaceholderSecret(dedicated)) return dedicated;

  if (isProductionRuntime()) {
    throw new Error(
      "INTERNAL_API_SECRET is required in production (do not use SUPABASE_SERVICE_ROLE_KEY as the API Bearer)"
    );
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (fallback && !isPlaceholderSecret(fallback)) return fallback;

  throw new Error("INTERNAL_API_SECRET or SUPABASE_SERVICE_ROLE_KEY required for internal API auth");
}

/** Try resolve without throwing (middleware / soft paths). */
export function tryResolveInternalApiSecret(): string | null {
  try {
    return resolveInternalApiSecret();
  } catch {
    return null;
  }
}

/**
 * Redact common secret patterns from log/error strings.
 * Does not claim to catch every format — prefer never logging secrets.
 */
export function redactSecrets(input: string): string {
  let out = input;
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
  out = out.replace(
    /(api[_-]?key|password|secret|token|authorization)\s*[:=]\s*["']?[^"'\s,;]+/gi,
    "$1=[REDACTED]"
  );
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
  return out;
}
