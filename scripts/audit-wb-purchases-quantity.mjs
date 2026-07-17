#!/usr/bin/env node
/**
 * Read-only Wildberries Purchases quantity reconciliation.
 * Usage: npx tsx scripts/audit-wb-purchases-quantity.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import {
  buildNetSalesFromApiSales,
  buildNetSalesFromDb,
  resolveNetSalesFromSources,
} from "../src/lib/sales-revenue-resolution.ts";
import {
  fetchFinanceInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "../src/services/persisted-query-service.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { isWithinDateRange, toDateString } from "../src/lib/wildberries/mappers.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const defaultRange = buildInclusiveDateRange(28);
const from = process.argv[3] ?? defaultRange.from;
const to = process.argv[4] ?? defaultRange.to;
const brandId = process.argv[5] || undefined;

const scope = { marketplaceAccountId: String(accountId), from, to, brandId };
const PORTAL_PURCHASES = 153;
const PORTAL_VALUE = 871_639.38;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function inRange(dateStr) {
  return isWithinDateRange(dateStr, from, to);
}

function isReturnSaleId(saleID) {
  return String(saleID ?? "").startsWith("R");
}

/** Sync-equivalent dedupe: one row per srid, last-wins by date. */
function dedupeBySridLastWins(rows, getSrid, getDate) {
  const byKey = new Map();
  for (const row of rows) {
    const key = getSrid(row);
    if (!key) continue;
    const existing = byKey.get(key);
    const date = getDate(row);
    if (!existing || date >= getDate(existing)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function countApiMetrics(apiSales) {
  const inRangeRows = apiSales.filter((s) => inRange(toDateString(s.date)));

  const saleEvents = inRangeRows.filter((s) => !isReturnSaleId(s.saleID));
  const returnEvents = inRangeRows.filter((s) => isReturnSaleId(s.saleID));

  const dedupedAll = dedupeBySridLastWins(
    inRangeRows,
    (s) => s.srid ?? s.saleID,
    (s) => toDateString(s.date)
  );
  const dedupedSales = dedupedAll.filter((s) => !isReturnSaleId(s.saleID));
  const dedupedReturns = dedupedAll.filter((s) => isReturnSaleId(s.saleID));

  // SRID ledger: +1 sale, -1 return per event in range
  const sridLedger = new Map();
  for (const s of inRangeRows) {
    const key = s.srid ?? s.saleID;
    if (!key) continue;
    const delta = isReturnSaleId(s.saleID) ? -1 : 1;
    sridLedger.set(key, (sridLedger.get(key) ?? 0) + delta);
  }
  const sridNetPositive = [...sridLedger.values()].filter((n) => n > 0).length;
  const sridNetSum = [...sridLedger.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const sridLedgerNet = [...sridLedger.values()].reduce((a, b) => a + b, 0);

  const netSales = buildNetSalesFromApiSales(apiSales, from, to);

  return {
    saleEventRows: saleEvents.length,
    returnEventRows: returnEvents.length,
    rowNet: saleEvents.length - returnEvents.length,
    dedupedSaleRows: dedupedSales.length,
    dedupedReturnRows: dedupedReturns.length,
    dedupedNet: dedupedSales.length - dedupedReturns.length,
    uniqueSridSaleEvents: new Set(saleEvents.map((s) => s.srid ?? s.saleID)).size,
    uniqueSridReturnEvents: new Set(returnEvents.map((s) => s.srid ?? s.saleID)).size,
    sridNetPositiveCount: sridNetPositive,
    sridNetPositiveQtySum: sridNetSum,
    sridLedgerNetTotal: sridLedgerNet,
    netSalesValue: netSales.netSales,
    grossSalesValue: netSales.grossSales,
    returnedSalesValue: netSales.returnedSales,
  };
}

function countDbMetrics(sales) {
  const completed = sales.filter((s) => !s.is_return);
  const returns = sales.filter((s) => s.is_return);
  const dbNet = buildNetSalesFromDb(sales);
  const breakdown = assembleFinancialComponents({ sales, finance: [], ads: [], costHistory: [] });

  return {
    soldUnits: completed.reduce((s, r) => s + r.quantity, 0),
    returnedUnits: returns.reduce((s, r) => s + r.quantity, 0),
    netUnits: completed.reduce((s, r) => s + r.quantity, 0) - returns.reduce((s, r) => s + r.quantity, 0),
    soldRows: completed.length,
    returnRows: returns.length,
    netSalesValue: dbNet.netSales,
    grossSalesValue: dbNet.grossSales,
    returnedSalesValue: dbNet.returnedSales,
    productCostBasis: breakdown.productCost,
  };
}

function countFinanceMetrics(finance) {
  const sales = finance.filter((r) => r.operation_type === "sale" || r.description === "Продажа");
  const returns = finance.filter((r) => r.operation_type === "return" || r.description === "Возврат");

  // Try quantity from raw if present in description/source — finance rows are 1 per line typically
  const saleQty = sales.length;
  const returnQty = returns.length;

  const saleRetail = sales.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);

  return { financeSaleRows: saleQty, financeReturnRows: returnQty, financeNetRows: saleQty - returnQty, financeSaleAmount: saleRetail };
}

async function main() {
  const client = createAdminClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
  });
  const productIds = products.map((p) => String(p.id));

  const [dbSales, finance] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds }),
    fetchFinanceInRange(scope, client, { productIds }),
  ]);

  const account = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
  const wbClient = new WbApiClient(account.apiKey);
  const apiSales = await wbClient.fetchSales(`${from}T00:00:00`);

  const db = countDbMetrics(dbSales);
  const api = countApiMetrics(apiSales);
  const fin = countFinanceMetrics(finance);
  const resolution = resolveNetSalesFromSources({ sales: dbSales, apiSales, scopeFrom: from, scopeTo: to });

  const candidates = [
    { label: "API sale event rows (non-R, by sale date)", count: api.saleEventRows },
    { label: "API return event rows (R, by sale date)", count: api.returnEventRows },
    { label: "API row net (sale events − return events)", count: api.rowNet },
    { label: "API deduped sale rows (sync model, last-wins srid)", count: api.dedupedSaleRows },
    { label: "API deduped return rows (sync model)", count: api.dedupedReturnRows },
    { label: "API deduped net rows", count: api.dedupedNet },
    { label: "API unique SRID sale events", count: api.uniqueSridSaleEvents },
    { label: "API SRIDs with net ledger > 0 in period", count: api.sridNetPositiveCount },
    { label: "API SRID ledger net sum (clamp negative to 0)", count: api.sridNetPositiveQtySum },
    { label: "API SRID ledger net total (can be negative)", count: api.sridLedgerNetTotal },
    { label: "DB sold units (dashboard Units Sold)", count: db.soldUnits },
    { label: "DB returned units (dashboard Returned Units)", count: db.returnedUnits },
    { label: "DB net units (dashboard Net Units)", count: db.netUnits },
    { label: "Finance sale rows", count: fin.financeSaleRows },
    { label: "Finance net rows", count: fin.financeNetRows },
  ];

  const portalMatch = candidates.filter((c) => c.count === PORTAL_PURCHASES);
  const closest = [...candidates].sort(
    (a, b) => Math.abs(a.count - PORTAL_PURCHASES) - Math.abs(b.count - PORTAL_PURCHASES)
  );

  // Transaction audit: classify each sale event
  const inRangeApi = apiSales.filter((s) => inRange(toDateString(s.date)));
  const saleEvents = inRangeApi.filter((s) => !isReturnSaleId(s.saleID));

  const auditRows = saleEvents.slice(0, 25).map((s) => {
    const srid = s.srid ?? s.saleID;
    const matchingReturn = inRangeApi.find(
      (r) => isReturnSaleId(r.saleID) && (r.srid ?? r.saleID) === srid
    );
    const dbRow = dbSales.find((d) => d.srid === srid);
    return {
      saleID: s.saleID,
      srid,
      gNumber: s.gNumber ?? null,
      saleDate: toDateString(s.date),
      priceWithDisc: round2(Math.abs(s.priceWithDisc ?? 0)),
      isReturn: false,
      hasReturnInPeriod: Boolean(matchingReturn),
      returnDate: matchingReturn ? toDateString(matchingReturn.date) : null,
      dbFinalState: dbRow ? (dbRow.is_return ? "return" : "sale") : "missing",
      dashboardSoldContribution: dbRow && !dbRow.is_return ? dbRow.quantity : 0,
      dashboardReturnContribution: dbRow && dbRow.is_return ? dbRow.quantity : 0,
      wbPurchaseEventCount: 1,
      wbNetAfterMatchedReturn: matchingReturn ? 0 : 1,
    };
  });

  // Explain 170 vs 153: sale events not in WB purchase count
  const sridLedger = new Map();
  for (const s of inRangeApi) {
    const key = s.srid ?? s.saleID;
    if (!key) continue;
    sridLedger.set(key, (sridLedger.get(key) ?? 0) + (isReturnSaleId(s.saleID) ? -1 : 1));
  }

  const saleEventsNotNetPositive = saleEvents.filter((s) => {
    const key = s.srid ?? s.saleID;
    return (sridLedger.get(key) ?? 0) <= 0;
  });

  const valueCheck = {
    portalValue: PORTAL_VALUE,
    dashboardNetSales: round2(resolution.netSales),
    apiNetSales: round2(api.netSalesValue),
    dbNetSales: round2(db.netSalesValue),
    valueDiffPortalVsDashboard: round2(resolution.netSales - PORTAL_VALUE),
  };

  console.log(
    JSON.stringify(
      {
        scope,
        portalReference: { purchases: PORTAL_PURCHASES, value: PORTAL_VALUE },
        valueReconciliation: valueCheck,
        dashboard: {
          unitsSold: db.soldUnits,
          unitsReturned: db.returnedUnits,
          netUnits: db.netUnits,
          netSales: round2(db.netSalesValue),
        },
        apiEventCounts: api,
        financeCounts: fin,
        candidateCounts: candidates,
        portalExactMatches: portalMatch,
        closestToPortal: closest.slice(0, 5),
        reconciliationTable: {
          purchases: {
            wildberries: PORTAL_PURCHASES,
            dashboardSoldUnits: db.soldUnits,
            dashboardNetUnits: db.netUnits,
            diffVsSold: db.soldUnits - PORTAL_PURCHASES,
            diffVsNet: db.netUnits - PORTAL_PURCHASES,
          },
          returnedUnits: {
            wildberries: "not shown separately on Purchases tab",
            dashboard: db.returnedUnits,
          },
        },
        saleEventsFullyOffsetByReturns: saleEventsNotNetPositive.length,
        sampleOffsetSales: saleEventsNotNetPositive.slice(0, 10).map((s) => ({
          saleID: s.saleID,
          srid: s.srid ?? s.saleID,
          date: toDateString(s.date),
          priceWithDisc: round2(Math.abs(s.priceWithDisc ?? 0)),
          sridLedgerNet: sridLedger.get(s.srid ?? s.saleID),
        })),
        transactionAuditSample: auditRows,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
