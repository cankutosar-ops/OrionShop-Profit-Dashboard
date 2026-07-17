#!/usr/bin/env node
/** Offline WB Orders reconciliation — no API calls. */
import { readFileSync } from "fs";
import { resolve } from "path";

const exportPath = process.argv[2] ?? "exports/wb-raw-account1-portal-proof/orders.json";
const PORTAL_ORDERS = Number(process.argv[3] ?? 870);
const PORTAL_VALUE = Number(process.argv[4] ?? 5_005_037.75);

const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
const orders = raw.data ?? raw;
const ymd = (s) => s?.slice?.(0, 10) ?? "";

function sumTotalPrice(rows) {
  return Math.round(rows.reduce((a, o) => a + (o.totalPrice ?? 0), 0) * 100) / 100;
}

function metrics(from, to, dateField, cancelFilter) {
  let rows = orders.filter((o) => {
    const d = ymd(o[dateField]);
    return d >= from && d <= to;
  });
  if (cancelFilter === "active") rows = rows.filter((o) => !o.isCancel);
  if (cancelFilter === "cancelled") rows = rows.filter((o) => o.isCancel);
  return {
    from,
    to,
    dateField,
    cancelFilter: cancelFilter ?? "all",
    count: rows.length,
    value: sumTotalPrice(rows),
    active: rows.filter((o) => !o.isCancel).length,
    cancelled: rows.filter((o) => o.isCancel).length,
  };
}

const results = [];
for (const df of ["date", "lastChangeDate"]) {
  for (const cf of ["all", "active", "cancelled"]) {
    for (const [f, t] of [
      ["2026-06-15", "2026-07-11"],
      ["2026-06-15", "2026-07-12"],
      ["2026-06-14", "2026-07-12"],
      ["2026-06-13", "2026-07-12"],
    ]) {
      results.push(metrics(f, t, df, cf));
    }
  }
}

const orderMatches = results.filter(
  (r) => r.count === PORTAL_ORDERS || Math.abs(r.value - PORTAL_VALUE) < 1
);

// Dedupe by srid
function dedupeMetrics(from, to, dateField) {
  const rows = orders.filter((o) => {
    const d = ymd(o[dateField]);
    return d >= from && d <= to;
  });
  const bySrid = new Map();
  for (const o of rows) {
    const key = o.srid ?? o.gNumber ?? `${o.nmId}-${o.date}`;
    const existing = bySrid.get(key);
    if (!existing || ymd(o.lastChangeDate) >= ymd(existing.lastChangeDate)) {
      bySrid.set(key, o);
    }
  }
  const deduped = [...bySrid.values()];
  return {
    dateField,
    from,
    to,
    dedupedCount: deduped.length,
    dedupedValue: sumTotalPrice(deduped),
    dedupedActive: deduped.filter((o) => !o.isCancel).length,
    dedupedCancelled: deduped.filter((o) => o.isCancel).length,
  };
}

const deduped = [
  dedupeMetrics("2026-06-15", "2026-07-11", "date"),
  dedupeMetrics("2026-06-15", "2026-07-12", "date"),
  dedupeMetrics("2026-06-15", "2026-07-11", "lastChangeDate"),
];

console.log(
  JSON.stringify(
    {
      exportMeta: raw.metadata ?? null,
      portal: { orders: PORTAL_ORDERS, value: PORTAL_VALUE },
      exactMatches: orderMatches,
      closestByCount: [...results]
        .sort((a, b) => Math.abs(a.count - PORTAL_ORDERS) - Math.abs(b.count - PORTAL_ORDERS))
        .slice(0, 8),
      closestByValue: [...results]
        .sort((a, b) => Math.abs(a.value - PORTAL_VALUE) - Math.abs(b.value - PORTAL_VALUE))
        .slice(0, 8),
      dedupedBySrid: deduped,
    },
    null,
    2
  )
);
