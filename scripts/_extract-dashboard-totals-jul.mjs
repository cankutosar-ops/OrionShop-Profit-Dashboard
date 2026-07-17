#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const FROM = "2026-07-01";
const TO = "2026-07-12";
const ACCOUNT = process.argv[2] ?? "2";

const { assembleFinancialComponents } = await import("../src/lib/financial-components.ts");
const { calculateModelBNetProfit } = await import("../src/lib/profit-engine-model-b.ts");
const { buildMarketplaceFeesPresentationFromFinance } = await import("../src/lib/finance-rollup.ts");
const { summarizeFinanceByCategory } = await import("../src/lib/finance-rollup.ts");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchAll(path) {
  const all = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${url}${path}&offset=${offset}&limit=1000`, { headers: h });
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return all;
}

const [sales, finance, ads, products] = await Promise.all([
  fetchAll(
    `/rest/v1/wb_sales?select=*&marketplace_account_id=eq.${ACCOUNT}&sale_date=gte.${FROM}&sale_date=lte.${TO}`
  ),
  fetchAll(
    `/rest/v1/wb_finance?select=*&marketplace_account_id=eq.${ACCOUNT}&operation_date=gte.${FROM}&operation_date=lte.${TO}`
  ),
  fetchAll(
    `/rest/v1/wb_ads?select=*&campaign_date=gte.${FROM}&campaign_date=lte.${TO}`
  ),
  fetchAll(`/rest/v1/products?select=id&marketplace_account_id=eq.${ACCOUNT}`),
]);

const productIds = products.map((p) => p.id);
let costHistory = [];
if (productIds.length) {
  costHistory = await fetchAll(
    `/rest/v1/product_cost_history?select=*&product_id=in.(${productIds.join(",")})`
  );
}

const latestCost = new Map();
for (const c of costHistory.sort((a, b) => b.effective_from.localeCompare(a.effective_from))) {
  if (!latestCost.has(c.product_id)) latestCost.set(c.product_id, Number(c.cost));
}

const breakdown = assembleFinancialComponents({
  sales,
  finance,
  ads,
  costHistory,
  latestCostByProductId: latestCost,
});

const mf = buildMarketplaceFeesPresentationFromFinance(finance, breakdown.commission);
const modelB = calculateModelBNetProfit({
  grossSales: breakdown.revenue,
  returnedSales: 0,
  netSales: breakdown.revenue,
  netSalesStatus: "ready",
  marketplaceFees: mf.marketplaceFees,
  logistics: breakdown.logistics + breakdown.returnLogistics,
  storage: breakdown.storage,
  productCost: breakdown.productCost,
  advertising: breakdown.advertising,
  accountAdjustments: mf.accountAdjustments,
});
const cats = summarizeFinanceByCategory(finance);
const round = (n) => Math.round(n * 100) / 100;

const csvLines = readFileSync("c:/Users/User/Downloads/New balance details (1).csv", "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .filter((l) => {
    const d = l.split(",")[0];
    if (!d || !d.startsWith("7/")) return false;
    const day = parseInt(d.split("/")[1], 10);
    return day >= 1 && day <= 12;
  });

const csvSum = (idx) =>
  round(
    csvLines.reduce((s, l) => {
      const v = parseFloat(l.split(",")[idx]);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0)
  );

const wbLogistics = csvSum(3);
const dashLogisticsCombined = round(breakdown.logistics + breakdown.returnLogistics);

console.log(
  JSON.stringify(
    {
      account: ACCOUNT,
      financeRows: finance.length,
      salesRows: sales.length,
      dashboard: {
        revenue: round(breakdown.revenue),
        marketplaceFees: round(mf.marketplaceFees),
        outboundLogistics: round(breakdown.logistics),
        returnRebillLogistics: round(breakdown.returnLogistics),
        storage: round(breakdown.storage),
        penalties: round(breakdown.penalties),
        deductions: round(cats.ADJUSTMENT || 0),
        productCost: round(breakdown.productCost),
        advertising: round(breakdown.advertising),
        netProfit: round(modelB.netProfit),
        netPlusCostAndAds: round(modelB.netProfit + breakdown.productCost + breakdown.advertising),
      },
      wbCsv: {
        sales: csvSum(1),
        wbFee: csvSum(2),
        logistics: wbLogistics,
        storage: csvSum(4),
        wbFeeAdjustment: csvSum(5),
        penalties: csvSum(6),
        acceptance: csvSum(7),
        deductions: csvSum(8),
        dailyNetTotalSum: csvSum(10),
        endingBalance: round(parseFloat(csvLines[csvLines.length - 1].split(",")[11] || "0")),
      },
    },
    null,
    2
  )
);
