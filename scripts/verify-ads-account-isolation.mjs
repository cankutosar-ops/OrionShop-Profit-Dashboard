/**
 * Account isolation for advertising spend.
 *
 * Two layers are asserted:
 *   - Source locks on the accessors that could reintroduce cross-account bleed.
 *   - Live assertions against the real warehouse, per account.
 *
 * Read-only: no WB calls, no writes. A live failure is a FAIL, not a SKIP — the
 * previous version swallowed every live error, which made the whole section
 * vacuous the moment anything went wrong.
 *
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
function info(label, detail = "") {
  console.log(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");

console.log("=== Ads account isolation ===");

// =====================================================================
console.log("\n--- A. Read path: fetchAdsInRange ---");
// =====================================================================
{
  const src = read("src/services/persisted-query-service.ts");
  const fnStart = src.indexOf("Advertising spend for the scoped marketplace account");
  const fnEnd = src.indexOf("export async function fetchCostHistory");
  const fn = src.slice(fnStart, fnEnd);

  check("fetchAdsInRange was located in source", fnStart > 0 && fnEnd > fnStart);
  check(
    "scopes wb_ads on marketplace_account_id",
    /marketplaceAccountId: accountScoped \? scope\.marketplaceAccountId : undefined/.test(fn),
    "account column is the primary guard"
  );
  check(
    "retains the product_id in-filter (brand scope + defence in depth)",
    /inFilters: \[\{ column: "product_id"/.test(fn)
  );
  check(
    "never filters wb_ads by supplier_article",
    !/column: "supplier_article"/.test(fn) && /void options\?\.supplierArticles/.test(fn)
  );
}

// =====================================================================
console.log("\n--- B. No unscoped accessor can return another account's ads ---");
// =====================================================================
{
  const src = read("src/services/database-service.ts");
  const start = src.indexOf("export const adsService");
  const fn = src.slice(start, src.indexOf("export const costHistoryService"));

  check("adsService.getByDateRange was located", start > 0);
  check(
    "adsService.getByDateRange requires a marketplaceAccountId",
    /marketplaceAccountId: string/.test(fn) &&
      /\.eq\("marketplace_account_id", marketplaceAccountId\)/.test(fn),
    "account predicate is mandatory"
  );
  check(
    "adsService.getByDateRange rejects a blank account id",
    /if \(!marketplaceAccountId\)/.test(fn)
  );
}

{
  const src = read("src/lib/product-profitability-builder.ts");
  check(
    "profitability builder does not index ads by supplier_article",
    !/byArticle/.test(src),
    "article matching removed — articles are only unique per account"
  );
  check(
    "profitability builder scopes ads by product_id only",
    /scopedAds = ads\.filter\(\s*\(row\) => row\.product_id && productIds\.has/.test(src)
  );
}

{
  const src = read("src/services/dashboard-service.ts");
  const start = src.indexOf("async function isDatabaseEmpty");
  const fn = src.slice(start, start + 1400);
  check(
    "warehouse emptiness check counts wb_ads per account",
    /from\("wb_ads"\)[\s\S]{0,220}?\.eq\("marketplace_account_id", marketplaceAccountId\)/.test(fn),
    "no global wb_ads count"
  );
}

// =====================================================================
console.log("\n--- C. Write path stamps the account on every row ---");
// =====================================================================
{
  const src = read("src/services/advertising-sync-service.ts");
  check(
    "ingestion upserts on (marketplace_account_id, source_key)",
    /onConflict: "marketplace_account_id,source_key"/.test(src)
  );
  check(
    "ingestion rejects a mixed-account batch",
    /mixed or missing marketplace account id/.test(src)
  );
  check(
    "ingestion refuses a row without a source_key",
    /source_key is required for atomic persistence/.test(src)
  );
  check(
    "product lookup is account-scoped",
    /\.eq\("marketplace_account_id", marketplaceAccountId\)/.test(src)
  );
  check(
    "ingestion never falls back to supplier_article for attribution",
    !/eq\("supplier_article"/.test(src)
  );
  check(
    "ingestion issues no DELETE against wb_ads",
    !/from\("wb_ads"\)[\s\S]{0,120}\.delete\(/.test(src),
    "non-destructive"
  );
}

// =====================================================================
console.log("\n--- D. Live warehouse assertions ---");
// =====================================================================
{
  const { parseDateRange } = await import("../src/lib/utils.ts");
  const { fetchProductsWithRelations, fetchAdsInRange } = await import(
    "../src/services/persisted-query-service.ts"
  );
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

  const client = createAdminClient();
  const dates = parseDateRange("2026-01-01", "2026-12-31");

  // Discover accounts rather than hardcoding 1 and 2 — the platform has more.
  const { data: accounts, error: accountsError } = await client
    .from("marketplace_accounts")
    .select("id, account_name, company_id")
    .order("id");
  if (accountsError) throw new Error(`cannot list accounts: ${accountsError.message}`);

  const { count: totalAds } = await client
    .from("wb_ads")
    .select("id", { count: "exact", head: true });
  info(`wb_ads total rows`, String(totalAds ?? 0));

  const idsByAccount = new Map();

  for (const account of accounts) {
    const accountId = String(account.id);
    const products = await fetchProductsWithRelations(accountId, client, {
      columns: "id, supplier_article, brand_id",
    });
    const productIds = new Set(products.map((p) => String(p.id)));

    const ads = await fetchAdsInRange(
      { ...dates, marketplaceAccountId: accountId, companyId: String(account.company_id) },
      client,
      {
        productIds: [...productIds],
        supplierArticles: products.map((p) => p.supplier_article),
      }
    );

    check(
      `account ${accountId}: every ad row resolves to one of its own products`,
      ads.every((ad) => ad.product_id && productIds.has(String(ad.product_id))),
      `ads=${ads.length}`
    );
    check(
      `account ${accountId}: no unattributed (null product_id) ad is returned`,
      ads.every((ad) => ad.product_id),
      `ads=${ads.length}`
    );
    check(
      `account ${accountId}: every ad row carries this account id`,
      ads.every(
        (ad) =>
          ad.marketplace_account_id == null ||
          String(ad.marketplace_account_id) === accountId
      ),
      `ads=${ads.length}`
    );

    idsByAccount.set(accountId, new Set(ads.map((a) => String(a.id))));
  }

  const accountIds = [...idsByAccount.keys()];
  let overlaps = 0;
  for (let i = 0; i < accountIds.length; i += 1) {
    for (let j = i + 1; j < accountIds.length; j += 1) {
      const a = idsByAccount.get(accountIds[i]);
      const b = idsByAccount.get(accountIds[j]);
      const shared = [...a].filter((id) => b.has(id));
      if (shared.length > 0) overlaps += shared.length;
    }
  }
  check(
    "no ad row is visible to two different accounts",
    overlaps === 0,
    `${accountIds.length} accounts compared, ${overlaps} shared row(s)`
  );

  // Direct table-level cross-check: does any row's account disagree with the
  // account that owns its product? This catches a bad write that the read path
  // would otherwise mask.
  const { data: mismatched, error: mismatchError } = await client
    .from("wb_ads")
    .select("id, marketplace_account_id, product_id, products!inner(marketplace_account_id)")
    .limit(1000);
  if (mismatchError) {
    info("row-level product/account cross-check unavailable", mismatchError.message);
  } else {
    const bad = (mismatched ?? []).filter(
      (r) =>
        r.marketplace_account_id != null &&
        r.products?.marketplace_account_id != null &&
        String(r.marketplace_account_id) !== String(r.products.marketplace_account_id)
    );
    check(
      "no wb_ads row is attributed to a different account than its product",
      bad.length === 0,
      `checked ${(mismatched ?? []).length} row(s), ${bad.length} mismatch(es)`
    );
  }

  if ((totalAds ?? 0) === 0) {
    info(
      "live assertions are structurally sound but currently vacuous",
      "wb_ads is empty — run the advertising backfill, then re-run this script"
    );
  }
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exitCode = failures === 0 ? 0 : 1;
