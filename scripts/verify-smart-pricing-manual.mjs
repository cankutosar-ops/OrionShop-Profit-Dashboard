/**
 * Manual vs engine Smart Pricing check — 10 random products, ±0.01 ₽ tolerance.
 * Usage: npx tsx scripts/verify-smart-pricing-manual.mjs [accountId] [seed]
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
const seed = Number(process.argv[3] ?? Date.now());
const TARGET_MARGIN = 15;
const MARKETING = 5;
const TOLERANCE = 0.01;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function manualRecommended(purchaseCost, purchaseLogistics, commissionPercent, marketing, margin) {
  const alpha = commissionPercent / 100;
  const beta = marketing / 100;
  const m = margin / 100;
  const numerator = purchaseCost + purchaseLogistics;
  const denominator = 1 - alpha - beta - m;
  if (denominator <= 0) return null;
  return numerator / denominator;
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

const withCost = inputs.filter((r) => r.purchaseCost !== null);
const rng = mulberry32(seed);
const shuffled = [...withCost].sort(() => rng() - 0.5);
const sample = shuffled.slice(0, 10);

console.log("=== Manual vs Engine Smart Pricing ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Seed:", seed, "| Sample:", sample.length, "products");
console.log("Defaults: margin", TARGET_MARGIN + "%, marketing", MARKETING + "%");
console.log("Tolerance: ±", TOLERANCE, "₽");
console.log("");

let firstFailure = null;

for (const row of sample) {
  const manual15 = manualRecommended(
    row.purchaseCost,
    row.purchaseLogistics,
    row.commissionPercent,
    MARKETING,
    15
  );
  const manual20 = manualRecommended(
    row.purchaseCost,
    row.purchaseLogistics,
    row.commissionPercent,
    MARKETING,
    20
  );
  const manualRecommendedTarget = manualRecommended(
    row.purchaseCost,
    row.purchaseLogistics,
    row.commissionPercent,
    MARKETING,
    TARGET_MARGIN
  );

  const engine = buildSmartPricingRow(row, TARGET_MARGIN, MARKETING);

  const checks = [
    { label: "15%", manual: manual15, engine: engine.priceFor15 },
    { label: "20%", manual: manual20, engine: engine.priceFor20 },
    { label: `Recommended (${TARGET_MARGIN}%)`, manual: manualRecommendedTarget, engine: engine.targetPrice },
  ];

  console.log("---", row.supplierArticle, "---");
  console.log(
    "Purchase Cost:",
    row.purchaseCost.toFixed(2),
    "| Logistics:",
    row.purchaseLogistics.toFixed(2),
    "| Commission:",
    row.commissionPercent + "%"
  );

  for (const { label, manual, engine: eng } of checks) {
    const diff =
      manual !== null && eng !== null
        ? Math.abs(manual - eng)
        : manual === eng
          ? 0
          : Infinity;
    const ok = diff <= TOLERANCE;
    console.log(
      label + ":",
      "manual",
      manual !== null ? manual.toFixed(2) : "—",
      "| engine",
      eng !== null ? eng.toFixed(2) : "—",
      "| diff",
      Number.isFinite(diff) ? diff.toFixed(4) : "N/A",
      ok ? "PASS" : "FAIL"
    );

    if (!ok && !firstFailure) {
      firstFailure = {
        model: row.supplierArticle,
        preset: label,
        purchaseCost: row.purchaseCost,
        purchaseLogistics: row.purchaseLogistics,
        commissionPercent: row.commissionPercent,
        marketing: MARKETING,
        margin: label.includes("20")
          ? 20
          : label.includes("25")
            ? 25
            : label.includes("35")
              ? 35
              : 30,
        manual,
        engine: eng,
        diff,
        formula: `(${row.purchaseCost.toFixed(2)} + ${row.purchaseLogistics.toFixed(2)}) / (1 - ${row.commissionPercent / 100} - ${MARKETING / 100} - ${(label.includes("20") ? 20 : label.includes("25") ? 25 : label.includes("35") ? 35 : 30) / 100})`,
      };
    }
  }
  console.log("");
}

console.log("=== Result ===");
if (firstFailure) {
  console.log("FAIL — first mismatch:");
  console.log(JSON.stringify(firstFailure, null, 2));
  process.exit(1);
}

console.log("PASS — all 10 products match within ±", TOLERANCE, "₽");
process.exit(0);
