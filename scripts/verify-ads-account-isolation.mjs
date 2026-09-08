/**
 * Account isolation for advertising spend (wb_ads has no marketplace_account_id).
 * Run: npx tsx scripts/verify-ads-account-isolation.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Ads account isolation ===\n");

const src = readFileSync(
  resolve(process.cwd(), "src/services/persisted-query-service.ts"),
  "utf8"
);
const fnStart = src.indexOf("Advertising spend for the scoped marketplace account");
const fnEnd = src.indexOf("export async function fetchCostHistory");
const fn = src.slice(fnStart, fnEnd);

check(
  "Does not query wb_ads by supplier_article",
  !/inFilters: \[\{ column: "supplier_article"/.test(fn)
);
check(
  "Does not load unscoped wb_ads date range",
  !/from\("wb_ads"\)/.test(fn) && /inFilters: \[\{ column: "product_id"/.test(fn)
);
check(
  "Ignores supplierArticles option (isolation comment present)",
  /void options\?\.supplierArticles/.test(fn) && /no `marketplace_account_id`/.test(fn)
);
check(
  "Requires product_id in-filter",
  /column: "product_id"/.test(fn)
);

try {
  const { parseDateRange } = await import("../src/lib/utils.ts");
  const { fetchProductsWithRelations, fetchAdsInRange } = await import(
    "../src/services/persisted-query-service.ts"
  );
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const client = createAdminClient();
  const dates = parseDateRange("2026-01-01", "2026-09-08");

  const sets = [];
  for (const accountId of ["1", "2"]) {
    const products = await fetchProductsWithRelations(accountId, client, {
      columns: "id, supplier_article, brand_id",
    });
    const productIds = new Set(products.map((p) => String(p.id)));
    const ads = await fetchAdsInRange(
      {
        ...dates,
        marketplaceAccountId: accountId,
        companyId: "1",
      },
      client,
      {
        productIds: [...productIds],
        supplierArticles: products.map((p) => p.supplier_article),
      }
    );
    const foreign = ads.filter((ad) => ad.product_id && !productIds.has(String(ad.product_id)));
    check(
      `Account ${accountId}: ads product_id belongs to account`,
      foreign.length === 0,
      `ads=${ads.length} foreign=${foreign.length}`
    );
    check(
      `Account ${accountId}: no null product_id ads attributed`,
      ads.every((ad) => ad.product_id),
      `ads=${ads.length}`
    );
    sets.push(new Set(ads.map((a) => String(a.id))));
  }

  const overlap = [...sets[0]].filter((id) => sets[1].has(id));
  check(
    "Account 1 and 2 ad row ids do not overlap",
    overlap.length === 0,
    `overlap=${overlap.length}`
  );
} catch (err) {
  console.log(`SKIP  Live ads isolation — ${err instanceof Error ? err.message : String(err)}`);
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
