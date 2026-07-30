/**
 * Fix getClient helpers broken by await-inside-sync-function.
 */
import fs from "fs";
import path from "path";

const files = [
  "src/services/marketplace-account-service.ts",
  "src/services/persisted-query-service.ts",
  "src/services/database-service.ts",
  "src/services/cost-service.ts",
  "src/services/purchase-service.ts",
  "src/services/stock-service.ts",
  "src/services/inventory-service.ts",
  "src/services/inventory-intelligence-service.ts",
  "src/services/inventory-validation-service.ts",
  "src/services/warehouse-sales-analytics-service.ts",
];

for (const rel of files) {
  const f = path.join(process.cwd(), rel);
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, "utf8");
  const before = s;

  // async getClient / getReadClient
  s = s.replace(
    /function getClient\(client\?: SupabaseClient\): SupabaseClient \{\s*return client \?\? await createServerClient\(\);\s*\}/g,
    "async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {\n  return client ?? (await createServerClient());\n}"
  );
  s = s.replace(
    /function getReadClient\(client\?: SupabaseClient\): SupabaseClient \{\s*return client \?\? await createServerClient\(\);\s*\}/g,
    "async function getReadClient(client?: SupabaseClient): Promise<SupabaseClient> {\n  return client ?? (await createServerClient());\n}"
  );
  s = s.replace(
    /function getClient\(\) \{\s*return await createServerClient\(\);\s*\}/g,
    "async function getClient() {\n  return await createServerClient();\n}"
  );

  // await getClient( / getReadClient(
  s = s.replace(/([^=\n])\bconst supabase = getClient\(/g, "$1const supabase = await getClient(");
  s = s.replace(/([^=\n])\bconst supabase = getReadClient\(/g, "$1const supabase = await getReadClient(");
  s = s.replace(/await getClient\(\)\.from/g, "(await getClient()).from");
  s = s.replace(/const \{ data, error \} = await getClient\(\)/g, "const { data, error } = await (await getClient())");

  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log("fixed", rel);
  } else {
    console.log("no change", rel);
  }
}
