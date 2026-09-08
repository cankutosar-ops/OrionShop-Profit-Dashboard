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
    } else {
      logSchemaCompatibilityReport(report);

      // Never stop development mode. Production/CI get a loud diagnostic only.
      // Hard failure belongs to scripts/validate-schema-compatibility.mjs in CI.
      if (!report.compatible && process.env.NODE_ENV === "production") {
        console.error(
          "[schema-compatibility] Production deploy is running against an incompatible database schema."
        );
      }
    }
  } catch (err) {
    console.error(
      "[schema-compatibility] Probe failed:",
      err instanceof Error ? err.message : err
    );
  }

  // Sprint 10.7 — durable inventory snapshot continuity (independent of Dashboard Sync).
  // Thin Node-only bootstrap: must NOT statically pull credentials/encryption/crypto.
  // Guard with NEXT_RUNTIME === "nodejs" so Edge instrumentation never resolves crypto.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startInventorySnapshotContinuityScheduler } = await import(
        "@/services/inventory-snapshot-continuity-scheduler"
      );
      startInventorySnapshotContinuityScheduler();
    } catch (err) {
      console.error(
        "[inventory-continuity] Scheduler start failed:",
        err instanceof Error ? err.message : err
      );
    }
  }
}
