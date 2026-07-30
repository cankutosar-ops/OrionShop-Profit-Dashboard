/**
 * Sprint 9.3 — read-only schema compatibility checks.
 * Never ALTERs, never repairs, never syncs.
 */

export type RequiredColumnCheck = {
  table: "wb_orders" | "wb_sales";
  column: string;
  expectedMigration: string;
};

export const REQUIRED_SCHEMA_COLUMNS: RequiredColumnCheck[] = [
  {
    table: "wb_orders",
    column: "price_with_disc",
    expectedMigration: "20260712200000",
  },
  {
    table: "wb_orders",
    column: "last_change_date",
    expectedMigration: "20260712200000",
  },
  {
    table: "wb_sales",
    column: "price_with_disc",
    expectedMigration: "20260712180000",
  },
  {
    table: "wb_sales",
    column: "for_pay",
    expectedMigration: "20260712180000",
  },
];

export type SchemaColumnResult = RequiredColumnCheck & {
  exists: boolean;
  error: string | null;
};

export type SchemaCompatibilityReport = {
  checkedAt: string;
  compatible: boolean;
  results: SchemaColumnResult[];
  missing: SchemaColumnResult[];
};

export function formatSchemaIncompatibilityMessage(missing: SchemaColumnResult[]): string {
  const lines = [
    "Database schema is incompatible with the running application.",
    "",
  ];
  for (const row of missing) {
    lines.push("Missing column:");
    lines.push(`${row.table}.${row.column}`);
    lines.push("");
    lines.push("Expected migration:");
    lines.push(row.expectedMigration);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
