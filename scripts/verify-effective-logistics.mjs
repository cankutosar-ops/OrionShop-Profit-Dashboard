/**
 * Sprint 6.2 — verify effective logistics Smart Pricing change.
 * Usage: npx tsx scripts/verify-effective-logistics.mjs [accountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "2";
const TARGET_MARGIN = 30;
const MARKETING = 15;

function recommended(purchaseCost, logistics, commissionPercent, marketing, margin) {
  const denom = 1 - commissionPercent / 100 - marketing / 100 - margin / 100;
  if (denom <= 0) return null;
  return (purchaseCost + logistics) / denom;
}

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { buildSmartPricingRow } = await import("../src/lib/smart-pricing.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);
if (!inputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

const withCost = inputs.filter((r) => r.purchaseCost !== null && r.hasSalesHistory);
const sample = withCost.slice(0, 20);

console.log("=== Sprint 6.2 Effective Logistics Verification ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Margin:", TARGET_MARGIN + "% | Marketing:", MARKETING + "%");
console.log("Products:", sample.length);
console.log("");

console.log(
  [
    "Model".padEnd(14),
    "PurchaseLog".padStart(12),
    "ExcludedLog".padStart(12),
    "EffectiveLog".padStart(12),
    "OldPrice".padStart(12),
    "NewPrice".padStart(12),
    "Engine".padStart(12),
  ].join(" ")
);
console.log("-".repeat(90));

for (const row of sample) {
  const oldPrice = recommended(
    row.purchaseCost,
    row.unitPurchaseLogistics,
    row.commissionPercent,
    MARKETING,
    TARGET_MARGIN
  );
  const newPrice = recommended(
    row.purchaseCost,
    row.effectiveLogistics,
    row.commissionPercent,
    MARKETING,
    TARGET_MARGIN
  );
  const engine = buildSmartPricingRow(row, TARGET_MARGIN, MARKETING).targetPrice;
  const match =
    newPrice !== null && engine !== null && Math.abs(newPrice - engine) < 0.01;

  console.log(
    [
      row.supplierArticle.slice(0, 14).padEnd(14),
      row.unitPurchaseLogistics.toFixed(2).padStart(12),
      row.unitExcludedLogistics.toFixed(2).padStart(12),
      row.effectiveLogistics.toFixed(2).padStart(12),
      oldPrice !== null ? oldPrice.toFixed(2).padStart(12) : "—".padStart(12),
      newPrice !== null ? newPrice.toFixed(2).padStart(12) : "—".padStart(12),
      (engine !== null ? engine.toFixed(2) : "—") + (match ? "" : " FAIL"),
    ].join(" ")
  );
}

console.log("");
console.log("Formula: EffectiveLogistics = (PurchaseLogistics + ExcludedLogistics) / CompletedPurchases");
console.log("Return logistics: NOT included");
