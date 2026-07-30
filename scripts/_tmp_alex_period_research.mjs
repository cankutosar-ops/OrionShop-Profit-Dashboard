/**
 * Research-only: ALEXALACIVERT Smart Pricing period comparison.
 * No production code changes. Run: npx tsx scripts/_tmp_alex_period_research.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        process.env[trimmed.slice(0, idx).trim()] ??= trimmed.slice(idx + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

const ARTICLE = "ALEXALACIVERT";
const PERIODS = [14, 30, 60, 90, 180];
const TARGET_MARGIN = 15;
const MARKETING = 5;
const TAX = 6;

const { buildInclusiveDateRange } = await import("../src/lib/utils.ts");
const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { buildSmartPricingRow } = await import("../src/lib/smart-pricing.ts");
const {
  applySmartPricingCommissionSettings,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
} = await import("../src/lib/smart-pricing-settings.ts");
const { createServerClient } = await import("../src/lib/supabase/server.ts");
const {
  fetchSalesInRange,
  fetchOrdersInRange,
  fetchFinanceInRange,
  fetchProductsWithRelations,
} = await import("../src/services/persisted-query-service.ts");
const { saleUnitSalesAmount } = await import("../src/lib/smart-pricing-marketplace-fees.ts");
const {
  sumProductHistoricalLogisticsMetrics,
  totalHistoricalLogistics,
} = await import("../src/lib/smart-pricing-logistics.ts");
const { sumProductMarketplaceFeesMetrics } = await import(
  "../src/lib/smart-pricing-marketplace-fees.ts"
);
const { sumProductStorageMetrics } = await import("../src/lib/smart-pricing-storage.ts");

function round(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function weekKey(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function analyzePeriod(days) {
  const { from, to } = buildInclusiveDateRange(days);
  const scope = await resolveScopedDateRange({
    company: "1",
    account: "1",
    from,
    to,
  });

  const inputs = await getSmartPricingInputs(scope);
  const raw = (inputs ?? []).find(
    (r) => String(r.supplierArticle).toUpperCase() === ARTICLE
  );
  if (!raw) {
    return { days, from, to, error: "product_not_in_stock_filtered_inputs" };
  }

  const configured = applySmartPricingCommissionSettings(
    raw,
    DEFAULT_SMART_PRICING_COMMISSION_SETTINGS
  );
  const row = buildSmartPricingRow(configured, TARGET_MARGIN, MARKETING, TAX);

  // Raw transaction proof for this product in range
  const client = createServerClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client);
  const product = products.find(
    (p) => String(p.supplier_article).toUpperCase() === ARTICLE
  );
  const productId = product ? String(product.id) : raw.productId;

  const [sales, orders, finance] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds: [productId] }),
    fetchOrdersInRange(scope, client, { productIds: [productId] }),
    fetchFinanceInRange(scope, client, { productIds: [productId] }),
  ]);

  const productSales = sales.filter((s) => String(s.product_id) === productId);
  const productOrders = orders.filter((o) => String(o.product_id) === productId);
  const productFinance = finance.filter(
    (f) => f.product_id == null || String(f.product_id) === productId
  );

  const completed = productSales.filter((s) => !s.is_return);
  const returns = productSales.filter((s) => s.is_return);
  const unitsSold = completed.reduce((s, r) => s + r.quantity, 0);
  const unitsReturned = returns.reduce((s, r) => s + r.quantity, 0);
  const revenue = completed.reduce((s, r) => s + saleUnitSalesAmount(r), 0);
  const orderQty = productOrders.reduce((s, r) => s + (r.quantity ?? 1), 0);
  const cancelled = productOrders.filter((o) => o.is_cancel).length;

  const logistics = sumProductHistoricalLogisticsMetrics(productSales, productFinance);
  const fees = sumProductMarketplaceFeesMetrics(productSales, productFinance);
  const storage = sumProductStorageMetrics(productSales, productFinance);
  const totalLog = totalHistoricalLogistics(logistics);

  // Weekly ASP / units for seasonality / campaign detection
  const byWeek = new Map();
  for (const s of completed) {
    const k = weekKey(s.sale_date);
    const cur = byWeek.get(k) ?? { units: 0, revenue: 0, tx: 0 };
    cur.units += s.quantity;
    cur.revenue += saleUnitSalesAmount(s);
    cur.tx += 1;
    byWeek.set(k, cur);
  }
  const weekly = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({
      week,
      units: v.units,
      tx: v.tx,
      asp: v.units > 0 ? round(v.revenue / v.units) : null,
    }));

  // Fee / logistics intensity by half of period
  const mid = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  const midMs = mid.getTime() + (end.getTime() - mid.getTime()) / 2;
  const midIso = new Date(midMs).toISOString().slice(0, 10);
  const earlySales = completed.filter((s) => s.sale_date.slice(0, 10) < midIso);
  const lateSales = completed.filter((s) => s.sale_date.slice(0, 10) >= midIso);
  const earlyRev = earlySales.reduce((s, r) => s + saleUnitSalesAmount(r), 0);
  const lateRev = lateSales.reduce((s, r) => s + saleUnitSalesAmount(r), 0);
  const earlyUnits = earlySales.reduce((s, r) => s + r.quantity, 0);
  const lateUnits = lateSales.reduce((s, r) => s + r.quantity, 0);

  return {
    days,
    from,
    to,
    productId,
    purchaseCost: row.purchaseCost,
    resolutionSource: row.resolutionSource,
    logisticsSource: row.logisticsSource,
    marketplaceFeesSource: row.marketplaceFeesSource,
    historicalLogistics: round(row.historicalLogistics),
    storagePerUnit: round(row.storagePerUnit),
    marketplaceFeesPercent: round(row.marketplaceFeesPercent, 3),
    commissionPercent: round(row.commissionPercent, 3),
    currentAvgPrice: round(row.currentAvgPrice),
    targetPrice: round(row.targetPrice),
    currentNetProfit: round(row.currentNetProfit),
    currentMarginPercent: round(row.currentMarginPercent, 2),
    differenceRub: round(row.differenceRub),
    differencePercent: round(row.differencePercent, 2),
    status: row.status,
    riskLevel: row.riskLevel ?? null,
    completedSalesInput: row.completedSales,
    hasSalesHistory: row.hasSalesHistory,
    returnRatePercent: round(row.returnRatePercent, 2),
    returnLogisticsPercent: round(row.returnLogisticsPercent, 2),
    ordersFunnel: row.orders,
    historicalCompletedUnits: row.historicalCompletedUnits,
    productHistoricalLogistics: round(row.productHistoricalLogistics),
    categoryHistoricalLogistics: round(row.categoryHistoricalLogistics),
    accountHistoricalLogistics: round(row.accountHistoricalLogistics),
    productHistoricalMarketplaceFeesPercent: round(
      row.productHistoricalMarketplaceFeesPercent,
      3
    ),
    categoryHistoricalMarketplaceFeesPercent: round(
      row.categoryHistoricalMarketplaceFeesPercent,
      3
    ),
    productHistoricalStoragePerUnit: round(row.productHistoricalStoragePerUnit),
    categoryHistoricalStoragePerUnit: round(row.categoryHistoricalStoragePerUnit),
    // Raw proof
    raw: {
      salesTx: productSales.length,
      completedTx: completed.length,
      returnTx: returns.length,
      unitsSold,
      unitsReturned,
      ordersTx: productOrders.length,
      orderQty,
      cancelledOrders: cancelled,
      buyoutRateApprox:
        orderQty > 0 ? round((unitsSold / orderQty) * 100, 1) : null,
      returnRateUnits:
        unitsSold + unitsReturned > 0
          ? round((unitsReturned / (unitsSold + unitsReturned)) * 100, 2)
          : null,
      asp: unitsSold > 0 ? round(revenue / unitsSold) : null,
      revenue: round(revenue),
      logisticsTotal: round(totalLog),
      logisticsPerUnit: unitsSold > 0 ? round(totalLog / unitsSold) : null,
      outboundPerUnit:
        unitsSold > 0 ? round(logistics.outboundLogistics / unitsSold) : null,
      rebillPerUnit:
        unitsSold > 0 ? round(logistics.rebillLogistics / unitsSold) : null,
      feesTotal: round(fees.commission),
      feesPercentOfRevenue:
        fees.revenue > 0 ? round((fees.commission / fees.revenue) * 100, 3) : null,
      storageTotal: round(storage.storage),
      storagePerUnitRaw:
        unitsSold > 0 ? round(storage.storage / unitsSold) : null,
      earlyHalf: {
        units: earlyUnits,
        asp: earlyUnits > 0 ? round(earlyRev / earlyUnits) : null,
      },
      lateHalf: {
        units: lateUnits,
        asp: lateUnits > 0 ? round(lateRev / lateUnits) : null,
      },
      weekly,
    },
  };
}

const results = [];
for (const days of PERIODS) {
  console.error(`Analyzing ${days}d…`);
  results.push(await analyzePeriod(days));
}

const outPath = resolve(process.cwd(), ".perf/alexalacivert-period-research.json");
writeFileSync(outPath, JSON.stringify({ article: ARTICLE, generatedAt: new Date().toISOString(), targetMargin: TARGET_MARGIN, marketing: MARKETING, tax: TAX, results }, null, 2));
console.log(JSON.stringify({ outPath, results }, null, 2));
