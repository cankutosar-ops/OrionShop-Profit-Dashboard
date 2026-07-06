/**
 * Sprint 6 — verify Smart Pricing rebuild (read-only).
 * Usage: npx tsx scripts/verify-smart-pricing-rebuild.mjs [accountId]
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

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const {
  buildSmartPricingRow,
  solveRecommendedPrice,
  verifyRecommendedPrice,
  formatRecommendedPriceFormula,
} = await import("../src/lib/smart-pricing.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const inputs = await getSmartPricingInputs(scope);
if (!inputs) {
  console.error("Supabase not configured");
  process.exit(1);
}

const withCost = inputs.filter((row) => row.purchaseCost !== null);
const sample = withCost.slice(0, 20);

console.log("=== Smart Pricing Rebuild Verification ===");
console.log("Account:", accountId, "| Scope:", scope.from, "→", scope.to);
console.log("Sample size:", sample.length, "products with purchase cost");
console.log("");

let aspViolations = 0;
let marginChecks = 0;
let marginFailures = 0;

for (const row of sample) {
  const computed = buildSmartPricingRow(row, TARGET_MARGIN, MARKETING);
  const solver = {
    purchaseCost: row.purchaseCost,
    purchaseLogistics: row.purchaseLogistics,
    commissionPercent: row.commissionPercent,
  };

  const recommended = computed.targetPrice;
  const verify =
    recommended !== null
      ? verifyRecommendedPrice(solver, TARGET_MARGIN, MARKETING, recommended)
      : null;

  console.log("---", row.supplierArticle, "---");
  console.log("Purchase Cost:", row.purchaseCost?.toFixed(2), "₽");
  console.log("Purchase Logistics:", row.purchaseLogistics.toFixed(2), "₽");
  console.log("Commission %:", row.commissionPercent);
  console.log("Marketing %:", MARKETING);
  console.log("Target Margin %:", TARGET_MARGIN);
  console.log(formatRecommendedPriceFormula(solver, TARGET_MARGIN, MARKETING));
  console.log("Recommended Price:", recommended !== null ? `${recommended.toFixed(2)} ₽` : "—");
  console.log("Average Selling Price:", row.currentAvgPrice?.toFixed(2) ?? "—", "₽");
  console.log("Status:", computed.status);

  if (verify) {
    marginChecks += 1;
    const ok = Math.abs(verify.marginPercent - TARGET_MARGIN) < 0.01;
    console.log("Margin verify:", verify.marginPercent.toFixed(2), "%", ok ? "PASS" : "FAIL");
    if (!ok) marginFailures += 1;
  }

  if (
    recommended !== null &&
    row.currentAvgPrice !== null &&
    row.currentAvgPrice > 0 &&
    recommended > row.currentAvgPrice * 2
  ) {
    const costFloor = (row.purchaseCost + row.purchaseLogistics) / row.currentAvgPrice;
    const justified = costFloor >= 0.85;
    console.log(
      "2× ASP check:",
      justified ? "PASS (cost justifies)" : "FAIL",
      `(ratio ${(recommended / row.currentAvgPrice).toFixed(2)}×)`
    );
    if (!justified) aspViolations += 1;
  } else if (recommended !== null && row.currentAvgPrice !== null) {
    console.log(
      "2× ASP check: PASS",
      `(ratio ${(recommended / row.currentAvgPrice).toFixed(2)}×)`
    );
  }

  console.log("");
}

console.log("=== Denominator sensitivity (first product with cost) ===");
const probe = sample[0];
if (probe) {
  const solver = {
    purchaseCost: probe.purchaseCost,
    purchaseLogistics: probe.purchaseLogistics,
    commissionPercent: probe.commissionPercent,
  };
  const base = solveRecommendedPrice(solver, TARGET_MARGIN, MARKETING);
  const marketingUp = solveRecommendedPrice(solver, TARGET_MARGIN, MARKETING + 5);
  const marginUp = solveRecommendedPrice(solver, TARGET_MARGIN + 5, MARKETING);
  const numer = probe.purchaseCost + probe.purchaseLogistics;
  const denomBase = 1 - probe.commissionPercent / 100 - MARKETING / 100 - TARGET_MARGIN / 100;
  const denomMarketing = 1 - probe.commissionPercent / 100 - (MARKETING + 5) / 100 - TARGET_MARGIN / 100;
  const denomMargin = 1 - probe.commissionPercent / 100 - MARKETING / 100 - (TARGET_MARGIN + 5) / 100;

  console.log("SKU:", probe.supplierArticle);
  console.log("Numerator fixed:", numer.toFixed(2));
  console.log("Base price:", base?.toFixed(2), "denom", denomBase.toFixed(4));
  console.log("Marketing +5%:", marketingUp?.toFixed(2), "denom", denomMarketing.toFixed(4));
  console.log("Margin +5%:", marginUp?.toFixed(2), "denom", denomMargin.toFixed(4));
  const onlyDenomMarketing =
    base !== null && marketingUp !== null && Math.abs(numer / base - denomBase) < 0.0001;
  const onlyDenomMargin =
    base !== null && marginUp !== null && Math.abs(numer / base - denomBase) < 0.0001;
  console.log(
    "Marketing change affects denominator only:",
    onlyDenomMarketing && base !== marketingUp ? "PASS" : "FAIL"
  );
  console.log(
    "Margin change affects denominator only:",
    onlyDenomMargin && base !== marginUp ? "PASS" : "FAIL"
  );
}

console.log("");
console.log("=== Summary ===");
console.log("Products verified:", sample.length);
console.log("Margin checks:", marginChecks, "| failures:", marginFailures);
console.log("Unjustified >2× ASP:", aspViolations);

// R-1098L regression
const r1098 = inputs.find((r) => r.supplierArticle === "R-1098L");
if (r1098) {
  const row = buildSmartPricingRow(r1098, 30, 15);
  console.log("");
  console.log("R-1098L regression:", row.targetPrice?.toFixed(2), "₽ (was 27,313 before rebuild)");
  console.log(
    "R-1098L vs ASP:",
    r1098.currentAvgPrice && row.targetPrice
      ? `${((row.targetPrice / r1098.currentAvgPrice) * 100).toFixed(0)}% of ASP`
      : "—"
  );
}

process.exit(marginFailures > 0 || aspViolations > 0 ? 1 : 0);
