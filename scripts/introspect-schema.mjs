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

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await res.json();

const tables = [
  "brands",
  "categories",
  "products",
  "wb_orders",
  "wb_sales",
  "wb_finance",
  "wb_ads",
  "product_cost_history",
];

console.log("=== LIVE COLUMN TYPES (OpenAPI) ===\n");
for (const table of tables) {
  const props = spec.definitions?.[table]?.properties ?? {};
  console.log(`-- ${table}`);
  for (const [col, meta] of Object.entries(props).sort(([a], [b]) => a.localeCompare(b))) {
    const m = meta;
    const type = m.format ? `${m.type}(${m.format})` : m.type;
    const fk = m.description ? ` -- ${m.description}` : "";
    console.log(`  ${col}: ${type}${fk}`);
  }
  console.log("");
}
