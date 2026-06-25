#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.env.AUDIT_FROM || "2026-05-24";
const to = process.env.AUDIT_TO || "2026-06-23";

const { getProductAnalytics } = await import("../src/services/product-analytics-service.ts");
const {
  verifyProductAnalyticsTotals,
  verifyProductAnalyticsV3Totals,
  verifyProductAnalyticsOperationalTotals,
} = await import("../src/lib/product-analytics.ts");

const report = await getProductAnalytics({ from, to });
if (!report) {
  console.error("No report — Supabase not configured");
  process.exit(1);
}

const products = await import("../src/services/dashboard-service.ts").then((m) =>
  m.getProductProfitability({ from, to })
);

const v2Check = verifyProductAnalyticsTotals(products, report.totals);
const v3Check = verifyProductAnalyticsV3Totals(report.v3All, report.totals);
const opsCheck = verifyProductAnalyticsOperationalTotals(report.v3All, report.totals);

console.log("Product Analytics totals:", JSON.stringify(report.totals, null, 2));
console.log("V3 SKU count:", report.v3All.length);
console.log("V2 net profit reconciliation:", v2Check.ok ? "OK" : `FAIL (delta ${v2Check.delta})`);
console.log(
  "V3 funnel reconciliation:",
  v3Check.ok ? "OK" : `FAIL (${JSON.stringify(v3Check.deltas)})`
);

console.log(
  "V3 operational reconciliation:",
  opsCheck.ok ? "OK" : `FAIL (${JSON.stringify(opsCheck.deltas)})`
);

if (!v2Check.ok || !v3Check.ok || !opsCheck.ok) process.exit(1);
