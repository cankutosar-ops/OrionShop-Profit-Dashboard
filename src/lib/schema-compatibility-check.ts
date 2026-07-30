import { createClient } from "@supabase/supabase-js";
import {
  REQUIRED_SCHEMA_COLUMNS,
  formatSchemaIncompatibilityMessage,
  type SchemaCompatibilityReport,
  type SchemaColumnResult,
} from "@/lib/schema-compatibility";
import { isPlaceholderSecret } from "@/lib/security/secrets";

function createProbeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Sprint 7.1.E — never fall back to anon for schema probes.
  if (!url || !key || isPlaceholderSecret(key)) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Read-only probe: SELECT column LIMIT 1 per required field.
 * Never writes. Never migrates.
 */
export async function checkSchemaCompatibility(): Promise<SchemaCompatibilityReport | null> {
  const client = createProbeClient();
  if (!client) return null;

  const results: SchemaColumnResult[] = [];

  for (const check of REQUIRED_SCHEMA_COLUMNS) {
    const { error } = await client.from(check.table).select(check.column).limit(1);
    const missingColumn =
      !!error &&
      (error.code === "42703" ||
        /column .* does not exist/i.test(error.message) ||
        /Could not find the '.+' column/i.test(error.message));

    results.push({
      ...check,
      exists: !missingColumn && !error,
      error: error && missingColumn ? error.message : error && !missingColumn ? error.message : null,
    });
  }

  const missing = results.filter((r) => !r.exists);

  return {
    checkedAt: new Date().toISOString(),
    compatible: missing.length === 0,
    results,
    missing,
  };
}

export function logSchemaCompatibilityReport(report: SchemaCompatibilityReport): void {
  if (report.compatible) {
    console.info("[schema-compatibility] OK — application schema requirements are present.");
    return;
  }

  console.error("[schema-compatibility]");
  console.error(formatSchemaIncompatibilityMessage(report.missing));
}
