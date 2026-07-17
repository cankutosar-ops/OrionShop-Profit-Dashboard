/**
 * Sprint 6.34.2 — validate Smart Pricing commission = Model B Dashboard commission.
 * PASS only if identical: Commission = max(0, priceWithDisc − forPay), % = Commission / priceWithDisc.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "1";

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { createServerClient } = await import("../src/lib/supabase/server.ts");
const { fetchSalesInRange } = await import("../src/services/dashboard-service.ts");
const {
  buildNetForPayFromDb,
  buildNetSalesFromDb,
  shareOfRevenueBasePercent,
} = await import("../src/lib/sales-revenue-resolution.ts");
const {
  sumSalesApiCommissionMetrics,
  weightedMarketplaceFeesPercent,
} = await import("../src/lib/smart-pricing-marketplace-fees.ts");
const { calculateModelBNetProfit } = await import("../src/lib/profit-engine-model-b.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const client = createServerClient();
const sales = await fetchSalesInRange(scope, client);

const netSales = buildNetSalesFromDb(sales);
const salesForPay = buildNetForPayFromDb(sales);
const modelB = calculateModelBNetProfit({
  grossSales: netSales.grossSales,
  returnedSales: netSales.returnedSales,
  netSales: netSales.netSales,
  netSalesStatus: "ready",
  salesForPay,
  acquiring: 0,
  logistics: 0,
  storage: 0,
  penalties: 0,
  adjustments: 0,
  productCost: 0,
  advertising: 0,
});

const sp = sumSalesApiCommissionMetrics(sales);
const spPct = weightedMarketplaceFeesPercent(sp.marketplaceFees, sp.revenue);
const dashPct = shareOfRevenueBasePercent(modelB.netSales, modelB.commission);

const commissionDiff = Math.abs(sp.marketplaceFees - modelB.commission);
const pctDiff = Math.abs((spPct ?? 0) - dashPct);

console.log("Sprint 6.34.2 — Smart Pricing vs Model B commission");
console.log(`Account: ${accountId}  Range: ${scope.from} → ${scope.to}`);
console.log(`priceWithDisc (netSales): ${netSales.netSales.toFixed(2)}`);
console.log(`forPay (salesForPay):     ${salesForPay.toFixed(2)}`);
console.log(`Model B Commission ₽:     ${modelB.commission.toFixed(2)}`);
console.log(`Smart Pricing Comm ₽:     ${sp.marketplaceFees.toFixed(2)}`);
console.log(`Model B Commission %:     ${dashPct.toFixed(4)}%`);
console.log(`Smart Pricing Comm %:     ${(spPct ?? 0).toFixed(4)}%`);
console.log(`Δ ₽: ${commissionDiff.toFixed(4)}  Δ %: ${pctDiff.toFixed(6)}`);

const pass = commissionDiff < 0.01 && pctDiff < 0.0001;
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
