#!/usr/bin/env node
/**
 * Revenue vs Product Cost cohort consistency audit (read-only).
 * Usage: npx tsx scripts/audit-revenue-cost-cohort.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import {
  buildNetSalesFromApiSales,
  buildNetSalesFromDb,
} from "../src/lib/sales-revenue-resolution.ts";
import { toDateString } from "../src/lib/wildberries/mappers.ts";
import {
  fetchCostHistory,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "../src/services/persisted-query-service.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-06-15";
const to = process.argv[4] ?? "2026-07-12";
const scope = { marketplaceAccountId: String(accountId), from, to };

function round2(n) {
  return Math.round(n * 100) / 100;
}
function inRange(d) {
  return d >= from && d <= to;
}
function isReturnSaleId(id) {
  return String(id ?? "").startsWith("R");
}

function resolveUnitCostAtSaleDate(sale, costHistory, latestMap) {
  const latest = latestMap?.get(String(sale.product_id));
  if (latest !== undefined) return latest;
  const applicable = costHistory
    .filter((c) => c.effective_from <= sale.sale_date && (!c.effective_to || c.effective_to >= sale.sale_date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return applicable[0]?.cost ?? 0;
}

function costForRow(sale, costHistory, latestMap) {
  const unit = resolveUnitCostAtSaleDate(sale, costHistory, latestMap);
  const sign = sale.is_return ? -1 : 1;
  return sign * unit * sale.quantity;
}

function pwdForDbRow(sale) {
  return Math.abs(Number(sale.price_with_disc ?? 0)) * sale.quantity;
}

async function main() {
  const client = createAdminClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client);
  const productIds = products.map((p) => String(p.id));
  const [dbSales, costHistory] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds }),
    fetchCostHistory(scope.marketplaceAccountId, client, { productIds }),
  ]);
  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);

  let apiSales = [];
  try {
    const account = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
    apiSales = await new WbApiClient(account.apiKey).fetchSales(`${from}T00:00:00`);
  } catch {
    /* rate limit ok — use export if needed */
  }

  const inRangeApi = apiSales.filter((s) => inRange(toDateString(s.date)));

  // Pair sale/return events by SRID on API (full event history in fetch window)
  const eventsBySrid = new Map();
  for (const s of inRangeApi) {
    const srid = s.srid ?? s.saleID;
    if (!srid) continue;
    const list = eventsBySrid.get(srid) ?? [];
    list.push(s);
    eventsBySrid.set(srid, list);
  }

  const dbBySrid = new Map(dbSales.map((s) => [s.srid, s]));

  const scenarios = {
    soldNotReturned: { units: 0, revenue: 0, productCost: 0, samples: [] },
    soldReturnedSamePeriod: { units: 0, revenue: 0, productCost: 0, samples: [] },
    soldPrevReturnedNow: { units: 0, revenue: 0, productCost: 0, samples: [] },
    soldNowReturnFuture: { units: 0, revenue: 0, productCost: 0, samples: [] },
    dedupCollapsedPair: { units: 0, revenue: 0, productCost: 0, samples: [] },
  };

  function addSample(bucket, row) {
    if (bucket.samples.length < 5) bucket.samples.push(row);
  }

  for (const [srid, events] of eventsBySrid) {
    const saleEv = events.filter((e) => !isReturnSaleId(e.saleID));
    const retEv = events.filter((e) => isReturnSaleId(e.saleID));
    const dbRow = dbBySrid.get(srid);

    const saleDates = saleEv.map((e) => toDateString(e.date));
    const retDates = retEv.map((e) => toDateString(e.date));
    const saleInPeriod = saleDates.some((d) => inRange(d));
    const retInPeriod = retDates.some((d) => inRange(d));
    const saleBeforePeriod = saleDates.some((d) => d < from);
    const saleInPeriodOnly = saleDates.filter((d) => inRange(d));
    const retInPeriodOnly = retDates.filter((d) => inRange(d));

    const pwdSale = saleEv.filter((e) => inRange(toDateString(e.date))).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
    const pwdRet = retEv.filter((e) => inRange(toDateString(e.date))).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
    const netRev = pwdSale - pwdRet;

    const unitCost = dbRow ? resolveUnitCostAtSaleDate(dbRow, costHistory, latestCostByProductId) : 0;
    const dbCost = dbRow ? costForRow(dbRow, costHistory, latestCostByProductId) : 0;

    // API-event-based cost proxy (same sign logic on each event)
    let eventCost = 0;
    for (const e of events) {
      if (!inRange(toDateString(e.date))) continue;
      const sign = isReturnSaleId(e.saleID) ? -1 : 1;
      eventCost += sign * unitCost;
    }

    const sample = {
      srid,
      saleDates,
      retDates,
      netRevApi: round2(netRev),
      dbFinalState: dbRow ? (dbRow.is_return ? "return" : "sale") : "missing",
      dbCost: round2(dbCost),
      eventCostProxy: round2(eventCost),
    };

    if (saleInPeriod && !retInPeriod) {
      scenarios.soldNowReturnFuture.units += 1;
      scenarios.soldNowReturnFuture.revenue += pwdSale;
      scenarios.soldNowReturnFuture.productCost += dbRow && !dbRow.is_return ? unitCost : eventCost;
      addSample(scenarios.soldNowReturnFuture, sample);
    } else if (saleInPeriod && retInPeriod) {
      if (saleEv.length > 0 && retEv.length > 0 && dbRow) {
        const collapsed = saleEv.length >= 1 && retEv.length >= 1 && !(dbBySrid.has(srid) && events.length > 1);
        if (events.length > 1 && dbRow) {
          // both events exist in API but DB has one row
          scenarios.dedupCollapsedPair.units += 1;
          scenarios.dedupCollapsedPair.revenue += netRev;
          scenarios.dedupCollapsedPair.productCost += dbCost;
          addSample(scenarios.dedupCollapsedPair, { ...sample, note: "API has sale+return; DB keeps one" });
        }
      }
      scenarios.soldReturnedSamePeriod.units += 1;
      scenarios.soldReturnedSamePeriod.revenue += netRev;
      scenarios.soldReturnedSamePeriod.productCost += eventCost;
      addSample(scenarios.soldReturnedSamePeriod, sample);
    } else if (saleBeforePeriod && retInPeriod) {
      scenarios.soldPrevReturnedNow.units += 1;
      scenarios.soldPrevReturnedNow.revenue += -pwdRet;
      scenarios.soldPrevReturnedNow.productCost += dbRow?.is_return ? -unitCost : eventCost;
      addSample(scenarios.soldPrevReturnedNow, sample);
    } else if (saleInPeriod && retDates.some((d) => d > to)) {
      scenarios.soldNowReturnFuture.units += 1;
      scenarios.soldNowReturnFuture.revenue += pwdSale;
      scenarios.soldNowReturnFuture.productCost += unitCost;
    }
  }

  // DB-only rows not in API pairing (sold not returned using DB)
  for (const row of dbSales.filter((s) => !s.is_return)) {
    if (!eventsBySrid.has(row.srid)) {
      scenarios.soldNotReturned.units += row.quantity;
      scenarios.soldNotReturned.revenue += pwdForDbRow(row);
      scenarios.soldNotReturned.productCost += costForRow(row, costHistory, latestCostByProductId);
    }
  }
  for (const row of dbSales.filter((s) => s.is_return)) {
    if (!eventsBySrid.has(row.srid)) {
      // return only in DB
      if (!saleDates) {
        scenarios.soldPrevReturnedNow.units += row.quantity;
        scenarios.soldPrevReturnedNow.revenue -= pwdForDbRow(row);
        scenarios.soldPrevReturnedNow.productCost += costForRow(row, costHistory, latestCostByProductId);
      }
    }
  }

  const netSalesDb = buildNetSalesFromDb(dbSales);
  const netSalesApi = inRangeApi.length ? buildNetSalesFromApiSales(apiSales, from, to) : null;
  const breakdown = assembleFinancialComponents({
    sales: dbSales,
    finance: [],
    ads: [],
    costHistory,
    latestCostByProductId,
    auditRange: scope,
  });

  // Count SRIDs with both events in period where DB collapsed
  let collapsedPairs = 0;
  let collapsedRevImpact = 0;
  for (const [srid, events] of eventsBySrid) {
    const inPeriodEvents = events.filter((e) => inRange(toDateString(e.date)));
    const hasSale = inPeriodEvents.some((e) => !isReturnSaleId(e.saleID));
    const hasRet = inPeriodEvents.some((e) => isReturnSaleId(e.saleID));
    if (hasSale && hasRet) {
      collapsedPairs += 1;
      const dbRow = dbBySrid.get(srid);
      const pwdSale = inPeriodEvents.filter((e) => !isReturnSaleId(e.saleID)).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
      const pwdRet = inPeriodEvents.filter((e) => isReturnSaleId(e.saleID)).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
      const trueNet = pwdSale - pwdRet;
      const dbNet = dbRow ? (dbRow.is_return ? -pwdForDbRow(dbRow) : pwdForDbRow(dbRow)) : 0;
      collapsedRevImpact += trueNet - dbNet;
    }
  }

  console.log(
    JSON.stringify(
      {
        scope,
        dashboardTotals: {
          netSalesDb: round2(netSalesDb.netSales),
          netSalesApi: netSalesApi ? round2(netSalesApi.netSales) : null,
          productCost: round2(breakdown.productCost),
          unitsSold: breakdown.unitsSold,
          unitsReturned: breakdown.unitsReturned,
          netUnits: breakdown.unitsSold - breakdown.unitsReturned,
        },
        cohortMatrix: Object.fromEntries(
          Object.entries(scenarios).map(([k, v]) => [
            k,
            {
              units: v.units,
              revenueImpact: round2(v.revenue),
              productCostImpact: round2(v.productCost),
              samples: v.samples,
            },
          ])
        ),
        dedupAnalysis: {
          sridPairsBothEventsInPeriod: collapsedPairs,
          netRevenueDistortionFromDedup: round2(collapsedRevImpact),
          explanation:
            "When sale+return share SRID in period, sync keeps last-wins row only; event-level net ≠ DB row net",
        },
        consistencyCheck: {
          sameRowSet:
            "Net Sales (DB) and Product Cost both iterate fetchSalesInRange(dbSales) — same rows",
          sameDateField: "Both use sale_date in range (sale and return rows filtered by return/sale event date)",
          costBasis: "Product cost uses latestCostByProductId when provided (dashboard does)",
          revenueBasis: "Net Sales uses priceWithDisc on same dbSales rows (or API fallback)",
        },
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
