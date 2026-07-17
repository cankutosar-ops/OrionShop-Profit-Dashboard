#!/usr/bin/env node
/**
 * Orders Value accounting audit — compare every Orders API price field vs WB Portal.
 * Usage: node scripts/audit-wb-orders-value.mjs [exportPath] [portalOrders] [portalValue]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const exportPath = process.argv[2] ?? "exports/wb-raw-account1-portal-proof/orders.json";
const PORTAL_ORDERS = Number(process.argv[3] ?? 870);
const PORTAL_VALUE = Number(process.argv[4] ?? 5_005_037.75);
const DASH_ORDERS = Number(process.argv[5] ?? 747);
const DASH_VALUE = Number(process.argv[6] ?? 8_915_200);

const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
const orders = raw.data ?? raw;
const ymd = (s) => s?.slice?.(0, 10) ?? "";

function round2(n) {
  return Math.round(n * 100) / 100;
}
function sum(rows, fn) {
  return round2(rows.reduce((a, r) => a + (fn(r) || 0), 0));
}
function pctDiff(computed, expected) {
  if (!expected) return null;
  return round2(((computed - expected) / expected) * 100);
}

function dedupeLastWins(rows, keyFn) {
  const m = new Map();
  for (const o of rows) {
    const k = keyFn(o);
    const ex = m.get(k);
    if (!ex || ymd(o.lastChangeDate) >= ymd(ex.lastChangeDate)) m.set(k, o);
  }
  return [...m.values()];
}

function sumByGNumber(rows, field) {
  const m = new Map();
  for (const o of rows) {
    m.set(o.gNumber, (m.get(o.gNumber) || 0) + (o[field] || 0));
  }
  return round2([...m.values()].reduce((a, v) => a + v, 0));
}

const priceFields = ["totalPrice", "priceWithDisc", "finishedPrice"];
const derived = [
  ["totalPrice × (100−discountPercent)/100", (o) => (o.totalPrice || 0) * (100 - (o.discountPercent || 0)) / 100],
  ["totalPrice × (100−spp)/100", (o) => (o.totalPrice || 0) * (100 - (o.spp || 0)) / 100],
];

const ranges = [
  ["2026-06-15", "2026-07-11", "portal-export-window"],
  ["2026-06-15", "2026-07-12", "dashboard-window"],
];
const dateFields = ["date", "lastChangeDate"];
const cancelFilters = ["all", "active", "cancelled"];

const candidates = [];

for (const [from, to, rlabel] of ranges) {
  for (const df of dateFields) {
    for (const cf of cancelFilters) {
      let rows = orders.filter((o) => {
        const d = ymd(o[df]);
        return d >= from && d <= to;
      });
      if (cf === "active") rows = rows.filter((o) => !o.isCancel);
      if (cf === "cancelled") rows = rows.filter((o) => o.isCancel);

      const base = { range: rlabel, from, to, dateField: df, cancel: cf };

      for (const f of priceFields) {
        candidates.push({
          ...base,
          formula: `Σ(${f})`,
          count: rows.length,
          value: sum(rows, (o) => o[f]),
        });
        candidates.push({
          ...base,
          formula: `Σ(${f}) by unique gNumber`,
          count: new Set(rows.map((o) => o.gNumber)).size,
          value: sumByGNumber(rows, f),
        });
        const dedupG = dedupeLastWins(rows, (o) => o.gNumber);
        candidates.push({
          ...base,
          formula: `Σ(${f}) gNumber last-wins`,
          count: dedupG.length,
          value: sum(dedupG, (o) => o[f]),
        });
      }
      for (const [name, fn] of derived) {
        candidates.push({
          ...base,
          formula: `Σ(${name})`,
          count: rows.length,
          value: sum(rows, fn),
        });
      }
    }
  }
}

const ranked = candidates
  .map((c) => ({
    ...c,
    diffVsPortal: round2(c.value - PORTAL_VALUE),
    pctVsPortal: pctDiff(c.value, PORTAL_VALUE),
    absPct: Math.abs(pctDiff(c.value, PORTAL_VALUE) ?? 999),
    countDiffPortal: c.count - PORTAL_ORDERS,
  }))
  .sort((a, b) => a.absPct - b.absPct || Math.abs(a.countDiffPortal) - Math.abs(b.countDiffPortal));

const dashPath = candidates.find(
  (c) =>
    c.range === "dashboard-window" &&
    c.dateField === "date" &&
    c.cancel === "all" &&
    c.formula === "Σ(totalPrice)"
);

console.log(
  JSON.stringify(
    {
      exportMeta: raw.metadata ?? null,
      portal: { orders: PORTAL_ORDERS, value: PORTAL_VALUE },
      dashboard: { orders: DASH_ORDERS, value: DASH_VALUE, exportSimulated: dashPath ?? null },
      top15ClosestToPortal: ranked.slice(0, 15),
      provenFormula: ranked[0],
      auditCompleteUnderHalfPercent: ranked[0].absPct < 0.5,
    },
    null,
    2
  )
);
