#!/usr/bin/env node
/** Offline analysis of exported WB sales JSON — no API calls. */
import { readFileSync } from "fs";
import { resolve } from "path";

const exportPath = process.argv[2] ?? "exports/wb-raw-account1-portal-proof/sales.json";
const from = process.argv[3] ?? "2026-06-15";
const to = process.argv[4] ?? "2026-07-11";
const PORTAL = { purchases: Number(process.argv[5] ?? 151), value: Number(process.argv[6] ?? 858438.94) };

const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
const sales = Array.isArray(raw) ? raw : raw.data ?? [];

function ymd(s) {
  return s?.slice?.(0, 10) ?? "";
}
function inRange(d) {
  return d >= from && d <= to;
}
function isRet(s) {
  return String(s.saleID ?? "").startsWith("R");
}

const inRangeRows = sales.filter((s) => inRange(ymd(s.date)));
const saleEvents = inRangeRows.filter((s) => !isRet(s));
const returnEvents = inRangeRows.filter((s) => isRet(s));

const sridLedger = new Map();
for (const s of inRangeRows) {
  const key = s.srid ?? s.saleID;
  if (!key) continue;
  sridLedger.set(key, (sridLedger.get(key) ?? 0) + (isRet(s) ? -1 : 1));
}

const sridNetPositive = [...sridLedger.entries()].filter(([, v]) => v > 0);
const sridNetZero = [...sridLedger.entries()].filter(([, v]) => v === 0);
const sridNetNegative = [...sridLedger.entries()].filter(([, v]) => v < 0);

function sumPriceWithDisc(rows) {
  return Math.round(rows.reduce((a, s) => a + Math.abs(s.priceWithDisc ?? 0), 0) * 100) / 100;
}

const gross = sumPriceWithDisc(saleEvents);
const returned = sumPriceWithDisc(returnEvents);
const net = gross - returned;

// WB purchase count hypothesis: count sale events where SRID net > 0 after period ledger
const saleEventsNetPositive = saleEvents.filter((s) => (sridLedger.get(s.srid ?? s.saleID) ?? 0) > 0);
// Hypothesis: unique SRIDs with net > 0
const uniqueSridNetPositive = sridNetPositive.length;

// Hypothesis: sale events minus those fully offset (srid net <= 0)
const saleEventsNotOffset = saleEvents.filter((s) => (sridLedger.get(s.srid ?? s.saleID) ?? 0) > 0);

// Dedupe sync model
const bySrid = new Map();
for (const s of inRangeRows) {
  const key = s.srid ?? s.saleID;
  const existing = bySrid.get(key);
  if (!existing || ymd(s.date) >= ymd(existing.date)) bySrid.set(key, s);
}
const deduped = [...bySrid.values()];
const dedupedSales = deduped.filter((s) => !isRet(s));

const candidates = [
  ["Sale event rows (non-R)", saleEvents.length],
  ["Return event rows (R)", returnEvents.length],
  ["Row net (sale − return events)", saleEvents.length - returnEvents.length],
  ["Unique SRIDs net ledger > 0", uniqueSridNetPositive],
  ["Sale events on SRIDs with net > 0", saleEventsNotOffset.length],
  ["Deduped non-return rows (sync last-wins)", dedupedSales.length],
  ["Deduped net rows", deduped.filter((s) => !isRet(s)).length - deduped.filter((s) => isRet(s)).length],
];

console.log(JSON.stringify({
  exportPath,
  period: { from, to },
  portal: PORTAL,
  value: { gross, returned, net, portalDiff: Math.round((net - PORTAL.value) * 100) / 100 },
  sridLedger: {
    totalSrids: sridLedger.size,
    netPositive: sridNetPositive.length,
    netZero: sridNetZero.length,
    netNegative: sridNetNegative.length,
    ledgerNetTotal: [...sridLedger.values()].reduce((a, b) => a + b, 0),
  },
  candidates: candidates.map(([label, count]) => ({
    label,
    count,
    diffFromPortal: count - PORTAL.purchases,
    matchesPortal: count === PORTAL.purchases,
  })),
  exactPortalMatches: candidates.filter(([, c]) => c === PORTAL.purchases).map(([l, c]) => ({ label: l, count: c })),
}, null, 2));
