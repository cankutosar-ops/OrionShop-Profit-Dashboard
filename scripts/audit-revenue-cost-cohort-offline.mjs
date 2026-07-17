#!/usr/bin/env node
/** Offline cohort audit from sales export + simulated cost. */
import { readFileSync } from "fs";
import { resolve } from "path";

const exportPath = process.argv[2] ?? "exports/wb-raw-account1-portal-proof/sales.json";
const from = process.argv[3] ?? "2026-06-15";
const to = process.argv[4] ?? "2026-07-11";
const UNIT_COST = Number(process.argv[5] ?? 1200); // proxy when no DB cost join

const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
const allEvents = raw.data ?? raw;
const ymd = (s) => s.slice(0, 10);
const inRange = (d) => d >= from && d <= to;
const isRet = (s) => String(s.saleID).startsWith("R");

const events = allEvents.filter((e) => inRange(ymd(e.date)));

const bySrid = new Map();
for (const e of events) {
  const k = e.srid ?? e.saleID;
  const list = bySrid.get(k) ?? [];
  list.push(e);
  bySrid.set(k, list);
}

// Dedupe like sync (last-wins by date)
function dbRowForSrid(sridEvents) {
  let best = sridEvents[0];
  for (const e of sridEvents) {
    if (ymd(e.date) >= ymd(best.date)) best = e;
  }
  const isReturn = isRet(best);
  return {
    is_return: isReturn,
    sale_date: ymd(best.date),
    price_with_disc: Math.abs(best.priceWithDisc ?? 0),
    quantity: 1,
  };
}

const matrix = {
  soldNotReturned: { units: 0, revenue: 0, costEvent: 0, costDb: 0 },
  soldReturnedSamePeriod: { units: 0, revenue: 0, costEvent: 0, costDb: 0 },
  soldPrevReturnedNow: { units: 0, revenue: 0, costEvent: 0, costDb: 0 },
  soldNowReturnFuture: { units: 0, revenue: 0, costEvent: 0, costDb: 0 },
};

const samples = [];

for (const [srid, sridEvents] of bySrid) {
  const saleEvents = sridEvents.filter((e) => !isRet(e));
  const retEvents = sridEvents.filter((e) => isRet(e));

  // Check if sale existed before period (need full export - events only in range here)
  // For sale before period: sale event NOT in `events` but return IS — detect return-only SRID
  const pwdSale = saleEvents.reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
  const pwdRet = retEvents.reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
  const netRev = pwdSale - pwdRet;

  const costEvent = (saleEvents.length - retEvents.length) * UNIT_COST;
  const db = dbRowForSrid(sridEvents);
  const costDb = (db.is_return ? -1 : 1) * UNIT_COST * db.quantity;
  const dbRev = db.is_return ? -db.price_with_disc : db.price_with_disc;

  let scenario;
  if (saleEvents.length > 0 && retEvents.length === 0) {
    scenario = "soldNowReturnFuture";
    matrix.soldNowReturnFuture.units += 1;
    matrix.soldNowReturnFuture.revenue += pwdSale;
    matrix.soldNowReturnFuture.costEvent += UNIT_COST;
    matrix.soldNowReturnFuture.costDb += costDb;
  } else if (saleEvents.length > 0 && retEvents.length > 0) {
    scenario = "soldReturnedSamePeriod";
    matrix.soldReturnedSamePeriod.units += 1;
    matrix.soldReturnedSamePeriod.revenue += netRev;
    matrix.soldReturnedSamePeriod.costEvent += costEvent;
    matrix.soldReturnedSamePeriod.costDb += costDb;
  } else if (saleEvents.length === 0 && retEvents.length > 0) {
    scenario = "soldPrevReturnedNow";
    matrix.soldPrevReturnedNow.units += 1;
    matrix.soldPrevReturnedNow.revenue += -pwdRet;
    matrix.soldPrevReturnedNow.costEvent += -UNIT_COST;
    matrix.soldPrevReturnedNow.costDb += costDb;
  }

  if (samples.length < 35) {
    samples.push({
      srid,
      scenario,
      saleDates: saleEvents.map((e) => ymd(e.date)),
      returnDates: retEvents.map((e) => ymd(e.date)),
      revenueEventNet: Math.round(netRev * 100) / 100,
      revenueDbRow: Math.round(dbRev * 100) / 100,
      costEvent: costEvent,
      costDbRow: costDb,
      returnDeductedFromNetSales: retEvents.length > 0 ? "Yes (return priceWithDisc in period)" : "No",
      originalSaleInPeriod: saleEvents.length > 0 ? "Yes" : "No (return-only in window)",
    });
  }
}

// sold not returned = same as soldNowReturnFuture in this export (all in-range)

const eventGross = events.filter((e) => !isRet(e)).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
const eventRet = events.filter((e) => isRet(e)).reduce((a, e) => a + Math.abs(e.priceWithDisc ?? 0), 0);
const eventNet = eventGross - eventRet;

const dbRows = [...bySrid.values()].map(dbRowForSrid);
const dbGross = dbRows.filter((r) => !r.is_return).reduce((a, r) => a + r.price_with_disc, 0);
const dbRet = dbRows.filter((r) => r.is_return).reduce((a, r) => a + r.price_with_disc, 0);
const dbNet = dbGross - dbRet;
const dbCost = dbRows.reduce((a, r) => a + (r.is_return ? -1 : 1) * UNIT_COST * r.quantity, 0);
const eventCost = (events.filter((e) => !isRet(e)).length - events.filter((e) => isRet(e)).length) * UNIT_COST;

console.log(
  JSON.stringify(
    {
      period: { from, to },
      totals: {
        eventLevel: { gross: eventGross, returned: eventRet, netSales: eventNet, productCost: eventCost },
        dbDeduped: { gross: dbGross, returned: dbRet, netSales: dbNet, productCost: dbCost },
        netSalesGap: Math.round((eventNet - dbNet) * 100) / 100,
        productCostGap: eventCost - dbCost,
      },
      cohortMatrix: Object.fromEntries(
        Object.entries(matrix).map(([k, v]) => [
          k,
          {
            units: v.units,
            revenueImpact: Math.round(v.revenue * 100) / 100,
            productCostImpact: Math.round(v.costEvent * 100) / 100,
            productCostDbProxy: Math.round(v.costDb * 100) / 100,
          },
        ])
      ),
      samples: samples.slice(0, 35),
    },
    null,
    2
  )
);
