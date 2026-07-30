/**
 * Next.js server startup hook (Sprint 9.3).
 * Read-only schema compatibility diagnostic — never mutates the database.
 */
export async function register() {
  // Edge runtime has no Supabase service tooling here; skip.
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { checkSchemaCompatibility, logSchemaCompatibilityReport } = await import(
      "@/lib/schema-compatibility-check"
    );
    const report = await checkSchemaCompatibility();
    if (!report) {
      console.warn(
        "[schema-compatibility] Skipped — Supabase env not configured for read-only probe."
      );
      return;
    }

    logSchemaCompatibilityReport(report);

    // Never stop development mode. Production/CI get a loud diagnostic only.
    // Hard failure belongs to scripts/validate-schema-compatibility.mjs in CI.
    if (!report.compatible && process.env.NODE_ENV === "production") {
      console.error(
        "[schema-compatibility] Production deploy is running against an incompatible database schema."
      );
    }
  } catch (err) {
    console.error(
      "[schema-compatibility] Probe failed:",
      err instanceof Error ? err.message : err
    );
  }
}
