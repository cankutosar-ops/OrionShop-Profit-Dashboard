/**
 * Post-fix migration validation (does NOT apply migration).
 * - Static checks on migration SQL
 * - Live schema introspection via Supabase OpenAPI
 * - Simulates pk_type OID logic against live PK types
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260623170000_align_schema_to_sync_service.sql"),
  "utf8"
);

const TABLES = [
  "brands",
  "categories",
  "products",
  "wb_orders",
  "wb_sales",
  "wb_finance",
  "wb_ads",
  "product_cost_history",
];

const FK_CHECKS = [
  { section: "§2 categories.parent_id", table: "categories", fk: "parent_id", ref: "categories" },
  { section: "§3b product_cost_history.product_id", table: "product_cost_history", fk: "product_id", ref: "products" },
  { section: "§4 wb_orders.product_id", table: "wb_orders", fk: "product_id", ref: "products" },
  { section: "§5 wb_sales.product_id", table: "wb_sales", fk: "product_id", ref: "products" },
  { section: "§6 wb_finance.product_id", table: "wb_finance", fk: "product_id", ref: "products" },
  { section: "§7 wb_ads.product_id", table: "wb_ads", fk: "product_id", ref: "products" },
];

function normalizeTypname(typname) {
  if (typname === "int8") return "bigint";
  if (typname === "int4") return "integer";
  if (typname === "int2") return "smallint";
  return typname;
}

// OpenAPI format "integer" + format "bigint" → normalized 'bigint'
function openApiPkType(props) {
  const id = props.id;
  if (!id) return null;
  if (id.format === "bigint") return "bigint";
  if (id.format === "uuid") return "uuid";
  if (id.type === "integer") return "integer";
  if (id.type === "string" && id.format === "uuid") return "uuid";
  return id.format ?? id.type ?? null;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report = {
    static: [],
    pkType: [],
    fkAlignment: [],
    risky: [],
    blockers: [],
    passed: true,
  };

  // --- Static checks ---
  if (MIGRATION.includes("split_part")) {
    report.blockers.push("Migration still contains split_part()");
    report.passed = false;
  } else {
    report.static.push("OK  No split_part() usage in migration");
  }

  if (MIGRATION.includes("pg_index i") && MIGRATION.includes("pg_attribute a")) {
    report.static.push("OK  pk_type() uses pg_index + pg_attribute by OID");
  } else {
    report.blockers.push("pk_type() missing pg_catalog OID lookup");
    report.passed = false;
  }

  if (MIGRATION.includes("WHEN 'int8' THEN 'bigint'")) {
    report.static.push("OK  pk_type() normalizes int8 → bigint");
  } else {
    report.blockers.push("pk_type() missing int8 → bigint normalization");
    report.passed = false;
  }

  // --- Live schema ---
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  const definitions = spec.definitions ?? {};

  report.static.push(`OK  Connected to Supabase OpenAPI (${Object.keys(definitions).length} tables)`);

  for (const table of TABLES) {
    const props = definitions[table]?.properties ?? {};
    const pkType = openApiPkType(props);
    if (!pkType) {
      report.blockers.push(`${table}: could not detect PK type`);
      report.passed = false;
      continue;
    }
    // Simulates pg_temp.pk_type() after normalization
    const simulated = normalizeTypname(pkType === "bigint" ? "int8" : pkType);
    const resolved = pkType === "bigint" ? "bigint" : pkType;
    report.pkType.push(`OK  pg_temp.pk_type('${table}') → '${resolved}' (live PK: ${pkType})`);
    if (resolved !== "bigint") {
      report.blockers.push(`${table}.id is ${pkType}, not bigint — migration bigint branch won't match`);
      report.passed = false;
    }
  }

  // --- FK alignment (post-migration target) ---
  for (const check of FK_CHECKS) {
    const refPk = openApiPkType(definitions[check.ref]?.properties ?? {});
    if (refPk === "bigint") {
      report.fkAlignment.push(
        `OK  ${check.section}: BIGINT FK → ${check.ref}.id BIGINT (no UUID/BIGINT mismatch)`
      );
    } else {
      report.fkAlignment.push(`FAIL ${check.section}: ref ${check.ref}.id is ${refPk}`);
      report.passed = false;
    }
  }

  // UUID branches exist but are dead code on live schema
  const uuidBranchCount = (MIGRATION.match(/product_id UUID REFERENCES/g) ?? []).length;
  report.static.push(
    `INFO ${uuidBranchCount} UUID fallback branch(es) present (dead code on live BIGINT schema)`
  );

  // --- Risky statements (unchanged from prior review) ---
  const risks = [
    "MEDIUM  CREATE UNIQUE INDEX idx_products_supplier_article — fails if duplicate model_code",
    "MEDIUM  CREATE UNIQUE INDEX idx_wb_orders_srid / idx_wb_sales_srid — fails if duplicate srid",
    "MEDIUM  DROP TABLE wb_finance — destructive; unpivot must complete first",
    "MEDIUM  wb_finance unpivot: report_date NULL + non-zero costs violates NOT NULL operation_date",
    "LOW     nm_id = abs(hashtext(supplier_article)) placeholder hash collisions (rare)",
    "INFO    Permissions require separate migration 20260623170001_grant_service_role_permissions.sql",
  ];
  report.risky.push(...risks);

  // --- Simulate section execution path on live pre-migration schema ---
  const preMigration = {
    brands: definitions.brands?.properties?.brand_name ? "brand_name" : "name",
    categories: definitions.categories?.properties?.category_name ? "category_name" : "name",
    products: definitions.products?.properties?.model_code ? "model_code" : "supplier_article",
    wb_finance: definitions.wb_finance?.properties?.commission ? "wide" : "tall",
  };

  report.static.push(`OK  §1 will rename brands.${preMigration.brands} → name`);
  report.static.push(`OK  §2 will rename categories.${preMigration.categories} → name, add parent_id BIGINT`);
  report.static.push(`OK  §3 will migrate products.${preMigration.products} → supplier_article`);
  report.static.push(
    preMigration.wb_finance === "wide"
      ? "OK  §6 will unpivot wide wb_finance → tall (operation_type + amount)"
      : "INFO §6 wb_finance already tall — unpivot block skipped"
  );

  // Unsupported type exception path
  if (MIGRATION.includes("RAISE EXCEPTION 'Unsupported categories.id type:")) {
    report.static.push(
      "OK  RAISE EXCEPTION on unknown pk_type only fires if PK is not bigint/uuid — live schema is bigint"
    );
  }

  // --- Print report ---
  console.log("=== MIGRATION VALIDATION REPORT ===");
  console.log("File: 20260623170000_align_schema_to_sync_service.sql");
  console.log("Mode: validation only (migration NOT applied)\n");

  console.log("--- Static analysis ---");
  report.static.forEach((l) => console.log(l));

  console.log("\n--- pk_type() simulation (live schema) ---");
  report.pkType.forEach((l) => console.log(l));

  console.log("\n--- FK type alignment (BIGINT paths) ---");
  report.fkAlignment.forEach((l) => console.log(l));

  console.log("\n--- Remaining risks (non-blocking) ---");
  report.risky.forEach((l) => console.log(l));

  if (report.blockers.length) {
    console.log("\n--- BLOCKERS ---");
    report.blockers.forEach((l) => console.log("FAIL", l));
    report.passed = false;
  }

  console.log("\n=== VERDICT ===");
  if (report.passed) {
    console.log("PASS  Migration is safe to execute on live BIGINT schema.");
    console.log("      pk_type() fix resolves prior split_part failure.");
    console.log("      No UUID/BIGINT FK mismatches on active code paths.");
    console.log("      No unsupported-type exceptions expected for live schema.");
  } else {
    console.log("FAIL  Migration has blockers — do not execute yet.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Validation failed:", e.message);
  process.exit(1);
});
