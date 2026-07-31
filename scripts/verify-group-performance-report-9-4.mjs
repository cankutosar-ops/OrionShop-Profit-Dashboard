/**
 * Sprint 9.4 — Category & Brand Performance validation.
 * Run: npx tsx scripts/verify-group-performance-report-9-4.mjs
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

function sumField(rows, field) {
  return rows.reduce((s, r) => s + r[field], 0);
}

console.log("=== Sprint 9.4 — Category & Brand Performance ===\n");

const { REPORTING_CATALOG } = await import("../src/lib/reporting/module/report-catalog.ts");
const { buildProductProfitReport, calculateProductRoiPercent } = await import(
  "../src/lib/reporting/module/product-profit-report.ts"
);
const {
  buildGroupPerformanceReport,
  aggregateProductProfitRows,
} = await import("../src/lib/reporting/module/group-performance-report.ts");
const { calculateModelBMarginPercent } = await import("../src/lib/financial-engine.ts");
const { StubReportExporter } = await import("../src/lib/reporting/module/export-types.ts");

check(
  "Category Performance catalog ready",
  REPORTING_CATALOG.find((r) => r.id === "category-performance")?.status === "ready"
);
check(
  "Brand Performance catalog ready",
  REPORTING_CATALOG.find((r) => r.id === "brand-performance")?.status === "ready"
);

const products = [
  {
    productId: "p1",
    modelCode: "SKU-1",
    productName: "Alpha",
    categoryName: "Cat A",
    brandName: "Brand X",
    revenue: 1000,
    productCost: 200,
    commission: 100,
    logistics: 40,
    returnLogistics: 10,
    storage: 20,
    advertising: 30,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 500,
    returnRate: 0,
    unitsSold: 10,
    unitsReturned: 0,
    netSales: 1200,
    finalNetProfit: 400,
    marketplaceFees: 150,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 12,
    purchases: 10,
    conversionPercent: 83,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 40,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
  {
    productId: "p2",
    modelCode: "SKU-2",
    productName: "Beta",
    categoryName: "Cat B",
    brandName: "Brand Y",
    revenue: 500,
    productCost: 100,
    commission: 50,
    logistics: 20,
    returnLogistics: 0,
    storage: 5,
    advertising: 10,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 100,
    returnRate: 0,
    unitsSold: 5,
    unitsReturned: 0,
    netSales: 600,
    finalNetProfit: 80,
    marketplaceFees: 70,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 6,
    purchases: 5,
    conversionPercent: 83,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 20,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
  {
    productId: "p3",
    modelCode: "SKU-3",
    productName: "Gamma",
    categoryName: "Cat A",
    brandName: "Brand X",
    revenue: 2000,
    productCost: 500,
    commission: 200,
    logistics: 80,
    returnLogistics: 20,
    storage: 40,
    advertising: 60,
    penalties: 0,
    otherExpenses: 0,
    netProfit: 900,
    returnRate: 0,
    unitsSold: 20,
    unitsReturned: 0,
    netSales: 2400,
    finalNetProfit: 800,
    marketplaceFees: 300,
    accountAdjustments: 0,
    reimbursements: 0,
    orders: 22,
    purchases: 20,
    conversionPercent: 90,
    cancelled: 0,
    cancellationPercent: 0,
    purchaseLogistics: 80,
    excludedLogistics: 0,
    purchaseLogisticsRows: 1,
    excludedLogisticsRows: 0,
  },
];

const productView = buildProductProfitReport({ products, currency: "RUB" });
const categoryView = buildGroupPerformanceReport({
  products,
  dimension: "category",
  category: "Cat B", // must be ignored for category dimension
  currency: "RUB",
});
const brandView = buildGroupPerformanceReport({
  products,
  dimension: "brand",
  category: "Cat A",
  currency: "RUB",
});

check(
  "Category report ignores category filter",
  categoryView.productRowCount === 3 && categoryView.rows.length === 2
);
check(
  "Brand report applies category filter",
  brandView.productRowCount === 2 && brandView.rows.length === 1 && brandView.rows[0].name === "Brand X"
);

check(
  "Category totals revenue = Σ product rows",
  Math.abs(sumField(categoryView.rows, "revenue") - productView.totals.revenue) < 0.01
);
check(
  "Category totals netProfit = Σ product rows",
  Math.abs(sumField(categoryView.rows, "netProfit") - productView.totals.netProfit) < 0.01
);
check(
  "Category totals logistics = Σ product rows",
  Math.abs(sumField(categoryView.rows, "logistics") - sumField(productView.rows, "logistics")) < 0.01
);
check(
  "Category summary revenue matches product totals",
  categoryView.totals.revenue === productView.totals.revenue
);
check(
  "Category summary netProfit matches product totals",
  categoryView.totals.netProfit === productView.totals.netProfit
);
check(
  "Category average margin = Model B on totals",
  categoryView.totals.averageMarginPercent ===
    calculateModelBMarginPercent(productView.totals.revenue, productView.totals.netProfit)
);

const catA = categoryView.rows.find((r) => r.name === "Cat A");
check("Cat A product count", catA?.productCount === 2);
check("Cat A units sold", catA?.unitsSold === 30);
check(
  "Cat A margin Model B",
  catA?.netMarginPercent === calculateModelBMarginPercent(catA.revenue, catA.netProfit)
);
check(
  "Cat A ROI consistent",
  catA?.roiPercent === calculateProductRoiPercent(catA.netProfit, catA.productCost)
);

check(
  "Default sort highest Net Profit first (category)",
  categoryView.rows[0]?.name === "Cat A"
);

const brandFilteredProducts = buildProductProfitReport({
  products,
  category: "Cat A",
  currency: "RUB",
});
check(
  "Brand totals = Σ filtered product rows",
  Math.abs(sumField(brandView.rows, "revenue") - brandFilteredProducts.totals.revenue) < 0.01 &&
    Math.abs(sumField(brandView.rows, "netProfit") - brandFilteredProducts.totals.netProfit) < 0.01
);

const byRoi = buildGroupPerformanceReport({
  products,
  dimension: "category",
  sortKey: "roiPercent",
  sortDirection: "desc",
});
check(
  "Sort by ROI",
  byRoi.rows[0].roiPercent >= (byRoi.rows[1]?.roiPercent ?? -Infinity)
);

const byUnits = buildGroupPerformanceReport({
  products,
  dimension: "category",
  sortKey: "unitsSold",
  sortDirection: "desc",
});
check("Sort by Units Sold", byUnits.rows[0].unitsSold >= byUnits.rows[1].unitsSold);

check("Summary has 4 cards (category)", categoryView.summary.length === 4);
check(
  "Summary Categories count",
  categoryView.summary.find((l) => l.id === "groupCount")?.amount === 2
);
check(
  "Summary Brands count (filtered)",
  brandView.summary.find((l) => l.id === "groupCount")?.amount === 1
);

const exporter = new StubReportExporter();
const stub = await exporter.export({
  reportId: "category-performance",
  format: "csv",
  payload: categoryView,
});
check("Export still NOT_IMPLEMENTED", !stub.ok && stub.code === "NOT_IMPLEMENTED");

const moduleSrc = readFileSync(
  resolve(process.cwd(), "src/lib/reporting/module/group-performance-report.ts"),
  "utf8"
);
check(
  "No Smart Pricing / WB API in group module",
  !moduleSrc.includes("solveTargetPrice") &&
    !moduleSrc.includes("buildSmartPricing") &&
    !moduleSrc.includes("wildberries") &&
    !moduleSrc.includes("api-client")
);
check(
  "Aggregates via Product Profit path",
  moduleSrc.includes("buildProductProfitReport") && moduleSrc.includes("aggregateProductProfitRows")
);

// Identity: re-aggregate product rows equals buildGroupPerformanceReport
const reAgg = aggregateProductProfitRows(productView.rows, "brand");
const brandAll = buildGroupPerformanceReport({ products, dimension: "brand" });
check(
  "Brand re-aggregation identity",
  reAgg.length === brandAll.rows.length &&
    Math.abs(sumField(reAgg, "netProfit") - sumField(brandAll.rows, "netProfit")) < 0.01
);

// Live
try {
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { loadReportContext } = await import("../src/lib/reporting/report-context.ts");

  const scope = await resolveScopedDateRange({});
  const ctx = await loadReportContext(scope, { skipInventory: true });
  const liveProducts = buildProductProfitReport({
    products: ctx.products,
    currency: ctx.tenant.currency,
  });
  const liveCat = buildGroupPerformanceReport({
    products: ctx.products,
    dimension: "category",
    currency: ctx.tenant.currency,
  });
  const liveBrand = buildGroupPerformanceReport({
    products: ctx.products,
    dimension: "brand",
    currency: ctx.tenant.currency,
  });

  check(
    "Live: category revenue = Σ product profit",
    Math.abs(liveCat.totals.revenue - liveProducts.totals.revenue) < 0.01,
    `cat=${liveCat.totals.revenue} products=${liveProducts.totals.revenue}`
  );
  check(
    "Live: category netProfit = Σ product profit",
    Math.abs(liveCat.totals.netProfit - liveProducts.totals.netProfit) < 0.01,
    `cat=${liveCat.totals.netProfit} products=${liveProducts.totals.netProfit}`
  );
  check(
    "Live: brand revenue = Σ product profit",
    Math.abs(liveBrand.totals.revenue - liveProducts.totals.revenue) < 0.01
  );
  check(
    "Live: brand netProfit = Σ product profit",
    Math.abs(liveBrand.totals.netProfit - liveProducts.totals.netProfit) < 0.01
  );
  check(
    "Live: category row sums = totals",
    Math.abs(sumField(liveCat.rows, "revenue") - liveCat.totals.revenue) < 0.01 &&
      Math.abs(sumField(liveCat.rows, "netProfit") - liveCat.totals.netProfit) < 0.01
  );
  check(
    "Live: FE product revenue available",
    Number.isFinite(ctx.financialEngine.revenue)
  );
} catch (err) {
  console.log(
    `SKIP  Live group-performance identity — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
