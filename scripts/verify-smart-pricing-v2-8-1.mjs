/**
 * Sprint 8.1 — Smart Pricing V2 mathematics validation (no UI).
 * Run: node scripts/verify-smart-pricing-v2-8-1.mjs
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

const {
  resolvePreferredCostWindow,
  buildSmartPricingDataScope,
  aspWindowDateFrom,
  lookbackDateFrom,
  SMART_PRICING_ASP_WINDOW_DAYS,
  SMART_PRICING_COST_WINDOW_DEFAULT,
  SMART_PRICING_DATA_LOOKBACK_DAYS,
} = await import("../src/lib/smart-pricing-windows.ts");

const {
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  filterSalesByAspWindow,
  filterSalesByCommissionWindow,
  applySmartPricingCommissionSettings,
  resolveCostWindowForSettings,
  commissionWindowDateFrom,
} = await import("../src/lib/smart-pricing-settings.ts");

const { solveRecommendedPrice, buildSmartPricingRow } = await import("../src/lib/smart-pricing.ts");
const { buildLatestCostByProductId } = await import("../src/lib/cost-history-resolution.ts");

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 8.1 — Smart Pricing V2 math ===\n");

// 1. Defaults
check(
  "Default cost window is 90 (not range)",
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS.commissionWindow === "90" &&
    SMART_PRICING_COST_WINDOW_DEFAULT === "90"
);

// 2. Preferred band mapping
check("range + enough 60d units → 60", resolvePreferredCostWindow({ window: "range", productUnits60: 25, minProductSales: 20 }) === "60");
check("range + thin 60d units → 90", resolvePreferredCostWindow({ window: "range", productUnits60: 5, minProductSales: 20 }) === "90");
check("30 clamps to 60", resolvePreferredCostWindow({ window: "30", productUnits60: 0, minProductSales: 20 }) === "60");
check("180 clamps to 90", resolvePreferredCostWindow({ window: "180", productUnits60: 100, minProductSales: 20 }) === "90");
check("explicit 60 honored", resolvePreferredCostWindow({ window: "60", productUnits60: 0, minProductSales: 20 }) === "60");
check("explicit 90 honored", resolvePreferredCostWindow({ window: "90", productUnits60: 100, minProductSales: 20 }) === "90");

// 3. Data scope ignores reporting from/to
const reporting = {
  from: "2020-01-01",
  to: "2020-01-07",
  marketplaceAccountId: "1",
  companyId: "1",
  brandId: null,
};
const dataScope = buildSmartPricingDataScope(reporting);
check(
  "Pricing data scope ignores dashboard from/to",
  dataScope.from !== reporting.from && dataScope.to !== reporting.to,
  `data=${dataScope.from}…${dataScope.to}`
);
check(
  "Pricing lookback is 180d inclusive",
  (() => {
    const a = new Date(`${dataScope.from}T12:00:00`);
    const b = new Date(`${dataScope.to}T12:00:00`);
    const days = Math.round((b - a) / 86400000) + 1;
    return days === SMART_PRICING_DATA_LOOKBACK_DAYS;
  })()
);
check("Tenant ids preserved on data scope", dataScope.marketplaceAccountId === "1" && dataScope.companyId === "1");

// 4. ASP window length
const aspFrom = aspWindowDateFrom(dataScope.to);
const aspDays =
  Math.round(
    (new Date(`${dataScope.to}T12:00:00`) - new Date(`${aspFrom}T12:00:00`)) / 86400000
  ) + 1;
check(
  `ASP window is ${SMART_PRICING_ASP_WINDOW_DAYS} days (within 14–30)`,
  aspDays === SMART_PRICING_ASP_WINDOW_DAYS && aspDays >= 14 && aspDays <= 30
);

// 5. Commission window filters never use reporting.from
const sales = [
  { sale_date: "2020-01-03", quantity: 1 },
  { sale_date: dataScope.to, quantity: 2 },
  { sale_date: lookbackDateFrom(dataScope.to, 10), quantity: 3 },
  { sale_date: lookbackDateFrom(dataScope.to, 45), quantity: 4 },
  { sale_date: lookbackDateFrom(dataScope.to, 100), quantity: 5 },
];
const filteredRange = filterSalesByCommissionWindow(sales, dataScope, "range");
check(
  '"range" filter equals 90d lookback (not reporting range)',
  filteredRange.every((s) => s.sale_date >= commissionWindowDateFrom(dataScope.to, "90")),
  `n=${filteredRange.length}`
);
const aspFiltered = filterSalesByAspWindow(sales, dataScope.to);
check(
  "ASP filter excludes older than ASP window",
  aspFiltered.every((s) => s.sale_date >= aspFrom) &&
    !aspFiltered.some((s) => s.sale_date === lookbackDateFrom(dataScope.to, 45))
);

// 6. Latest product cost — never average
const costs = [
  {
    id: "1",
    product_id: "p1",
    cost: 100,
    effective_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    product_id: "p1",
    cost: 200,
    effective_from: "2026-06-01",
    created_at: "2026-06-01T00:00:00Z",
  },
];
const latest = buildLatestCostByProductId(costs, [{ id: "p1", supplier_article: "A1" }]);
check("Product cost uses latest history row only", latest.get("p1") === 200);

// 7. Solver identity (post-fee tax model unchanged)
const P = solveRecommendedPrice(
  {
    purchaseCost: 500,
    historicalLogistics: 80,
    storagePerUnit: 20,
    marketplaceFeesPercent: 20,
  },
  15,
  5,
  6
);
check("Recommended price solver returns finite P*", P != null && Number.isFinite(P) && P > 0, `P*=${P?.toFixed(2)}`);

// 8. applySettings uses preferred window buckets
function emptyLogistics(units = 0) {
  return { outboundLogistics: 0, rebillLogistics: 0, unitsSold: units };
}
function emptyFees(units = 0) {
  return { marketplaceFees: 0, revenue: 0, salesForPay: 0, unitsSold: units };
}
function emptyStorage(units = 0) {
  return { storage: 0, unitsSold: units };
}
function windowTotals(productUnits, feeRevenue, feeAmount, logisticsPerUnit, storagePerUnit) {
  const units = productUnits;
  return {
    productLogistics: {
      outboundLogistics: logisticsPerUnit * units,
      rebillLogistics: 0,
      unitsSold: units,
    },
    categoryLogistics: emptyLogistics(0),
    accountLogistics: emptyLogistics(1000),
    productMarketplaceFees: {
      marketplaceFees: feeAmount,
      revenue: feeRevenue,
      salesForPay: feeRevenue - feeAmount,
      unitsSold: units,
    },
    categoryMarketplaceFees: emptyFees(0),
    accountMarketplaceFees: emptyFees(1000),
    productStorage: { storage: storagePerUnit * units, unitsSold: units },
    categoryStorage: emptyStorage(0),
    accountStorage: emptyStorage(1000),
  };
}

const baseInput = {
  productId: "p1",
  supplierArticle: "A1",
  productName: "Test",
  brandId: "b1",
  brandName: "Brand",
  categoryId: "c1",
  categoryName: "Cat",
  currentStock: 10,
  purchaseCost: 500,
  resolutionSource: "PRODUCT_HISTORY",
  historicalLogistics: 0,
  effectiveLogistics: 0,
  storagePerUnit: 0,
  unitOutboundLogistics: 0,
  unitRebillLogistics: 0,
  historicalCompletedUnits: 0,
  productHistoricalLogistics: null,
  categoryHistoricalLogistics: null,
  accountHistoricalLogistics: null,
  productHistoricalStoragePerUnit: null,
  categoryHistoricalStoragePerUnit: null,
  accountHistoricalStoragePerUnit: null,
  marketplaceFeesPercent: 20,
  commissionPercent: 20,
  marketplaceFeesSource: "PRODUCT_HISTORY",
  commissionSource: "PRODUCT_HISTORY",
  completedSales: 10,
  productHistoricalMarketplaceFeesPercent: null,
  categoryHistoricalMarketplaceFeesPercent: null,
  productHistoricalCommissionPercent: null,
  categoryHistoricalCommissionPercent: null,
  marketplaceCommissionPercent: 20,
  currentAvgPrice: 1500,
  finishedPriceRatio: 1,
  hasSalesHistory: true,
  orders: 10,
  returnRatePercent: 5,
  returnLogisticsPercent: 10,
  unitPurchaseLogistics: 0,
  unitExcludedLogistics: 0,
  logisticsSource: "PRODUCT_HISTORY",
  logisticsCompletedUnits: 0,
  productHistoricalEffectiveLogistics: null,
  categoryHistoricalEffectiveLogistics: null,
  accountHistoricalEffectiveLogistics: null,
  excludedLogisticsPercent: 0,
  historicalReplay: {
    marketplace: "wildberries",
    categoryId: "c1",
    byWindow: {
      "30": windowTotals(10, 10000, 1500, 50, 5),
      "60": windowTotals(25, 25000, 5000, 70, 8),
      "90": windowTotals(40, 40000, 8000, 90, 10),
      "180": windowTotals(80, 80000, 16000, 100, 12),
      range: windowTotals(40, 40000, 8000, 90, 10),
    },
  },
  commissionReplay: {
    marketplace: "wildberries",
    categoryId: "c1",
    byWindow: {
      "30": { productTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 10 }, categoryTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 10 } },
      "60": { productTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 25 }, categoryTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 25 } },
      "90": { productTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 40 }, categoryTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 40 } },
      "180": { productTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 80 }, categoryTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 80 } },
      range: { productTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 40 }, categoryTotals: { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 40 } },
    },
  },
};

const settings90 = {
  ...DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  commissionWindow: "90",
};
check(
  "resolveCostWindowForSettings(90) → 90",
  resolveCostWindowForSettings(baseInput, settings90) === "90"
);
const applied90 = applySmartPricingCommissionSettings(baseInput, settings90);
check(
  "90d window uses 90d logistics (90)",
  Math.abs(applied90.historicalLogistics - 90) < 1e-9,
  `L=${applied90.historicalLogistics}`
);
check(
  "90d window uses 90d storage (10)",
  Math.abs(applied90.storagePerUnit - 10) < 1e-9,
  `St=${applied90.storagePerUnit}`
);

const settingsRange = {
  ...DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  commissionWindow: "range",
};
check(
  "range with units60≥min → cost window 60",
  resolveCostWindowForSettings(baseInput, settingsRange) === "60"
);
const appliedRange = applySmartPricingCommissionSettings(baseInput, settingsRange);
check(
  "adaptive range uses 60d logistics (70)",
  Math.abs(appliedRange.historicalLogistics - 70) < 1e-9,
  `L=${appliedRange.historicalLogistics}`
);

const row = buildSmartPricingRow(applied90, 15, 5, 6);
check(
  "buildSmartPricingRow yields recommended (target) price",
  row.targetPrice != null && row.targetPrice > 0,
  `P*=${row.targetPrice}`
);

// 9. Changing reporting range must not change data scope endpoints for same "today"
const otherReporting = { ...reporting, from: "2019-06-01", to: "2019-12-31" };
const dataScope2 = buildSmartPricingDataScope(otherReporting);
check(
  "Different dashboard ranges → identical pricing lookback",
  dataScope.from === dataScope2.from && dataScope.to === dataScope2.to
);

// 10. Live regression — recommended cost inputs identical across reporting ranges
try {
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
  const { applySmartPricingCommissionSettings: apply } = await import(
    "../src/lib/smart-pricing-settings.ts"
  );
  const { buildSmartPricingRow: buildRow } = await import("../src/lib/smart-pricing.ts");

  const s1 = await resolveScopedDateRange({ from: "2026-01-01", to: "2026-01-15" });
  const s2 = await resolveScopedDateRange({ from: "2025-06-01", to: "2025-12-31" });
  const a = await getSmartPricingInputs(s1);
  const b = await getSmartPricingInputs(s2);
  if (!a || !b || a.length === 0) {
    console.log("SKIP  Live date-range independence (no Smart Pricing data / env)");
  } else {
    const map = new Map(b.map((r) => [r.productId, r]));
    let same = 0;
    let diff = 0;
    for (const r of a) {
      const o = map.get(r.productId);
      if (!o) continue;
      const left = apply(r, DEFAULT_SMART_PRICING_COMMISSION_SETTINGS);
      const right = apply(o, DEFAULT_SMART_PRICING_COMMISSION_SETTINGS);
      const lp = buildRow(left, 15, 5, 6).targetPrice;
      const rp = buildRow(right, 15, 5, 6).targetPrice;
      const ok =
        Math.abs(left.marketplaceFeesPercent - right.marketplaceFeesPercent) < 1e-9 &&
        Math.abs(left.historicalLogistics - right.historicalLogistics) < 1e-9 &&
        Math.abs(left.storagePerUnit - right.storagePerUnit) < 1e-9 &&
        left.purchaseCost === right.purchaseCost &&
        (left.currentAvgPrice ?? null) === (right.currentAvgPrice ?? null) &&
        lp === rp;
      if (ok) same += 1;
      else diff += 1;
    }
    check(
      "Live: recommended price inputs identical across dashboard date ranges",
      diff === 0 && same > 0,
      `same=${same} diff=${diff}`
    );
  }
} catch (err) {
  console.log(
    `SKIP  Live date-range independence — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
