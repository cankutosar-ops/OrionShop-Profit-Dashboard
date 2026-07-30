/**
 * Sprint 6.37.1 — Unallocated margin + navigateScope regression checks.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  alignGroupedProfitabilityToModelB,
  groupedNetMarginPercent,
} from "../src/lib/dimension-profitability.ts";

const root = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

// --- Issue #1: float-dust Unallocated must not produce absurd margin ---
const attributed = [
  {
    id: "a",
    name: "A",
    revenue: 100000 - 5.820766091346741e-11,
    finalNetProfit: 10000,
    productCount: 1,
    returnRate: 0,
  },
];
const modelB = { revenue: 100000, finalNetProfit: 10000 - 233705 };
const rows = alignGroupedProfitabilityToModelB(attributed, modelB);
const unallocated = rows.find((row) => row.name === "Unallocated");

if (!unallocated) {
  fails.push("Unallocated row must remain visible when profit residual exists");
} else {
  if (unallocated.revenue !== 0) {
    fails.push(`Unallocated revenue dust must snap to 0, got ${unallocated.revenue}`);
  }
  if (Math.abs(unallocated.finalNetProfit - -233705) > 0.01) {
    fails.push(`Unallocated profit must stay -233705, got ${unallocated.finalNetProfit}`);
  }
  const margin = groupedNetMarginPercent(unallocated);
  if (margin !== null) {
    fails.push(`Margin with revenue<=0 must be null (UI —), got ${margin}`);
  }
}

const healthy = groupedNetMarginPercent({ revenue: 1000, finalNetProfit: 250 });
if (healthy === null || Math.abs(healthy - 25) > 1e-9) {
  fails.push(`Valid margin must remain 25%, got ${healthy}`);
}

const table = read("src/components/dashboard/profitability-grouped-table.tsx");
if (!table.includes('margin === null ? "—"')) {
  fails.push("ProfitabilityGroupedTable must render — when margin is null");
}

const legacy = read("src/components/dashboard/category-profitability-table.tsx");
if (!legacy.includes('marginSafe === null ? "—"')) {
  fails.push("CategoryProfitabilityTable must render — when margin is null");
}

// --- Issue #2: navigateScope must refresh only after URL commit ---
const scopeNav = read("src/lib/scope-navigation.ts");
if (!scopeNav.includes("router.refresh()")) {
  fails.push("navigateScope must still call router.refresh()");
}
if (!scopeNav.includes("URL_COMMIT_WAIT_MS") || !scopeNav.includes("locationMatchesHref")) {
  fails.push("navigateScope must wait for URL commit before refresh (not bare setTimeout(0))");
}
if (!scopeNav.includes("location.assign")) {
  fails.push("navigateScope must hard-assign if soft-nav never commits");
}
// Bare setTimeout(0) refresh alone is the premature 6.37.1 fix — reject it.
if (/setTimeout\(\s*\(\)\s*=>\s*\{\s*router\.refresh\(\)/.test(scopeNav) && !scopeNav.includes("locationMatchesHref")) {
  fails.push("navigateScope must not refresh on setTimeout(0) without URL match");
}

const switchCtx = read("src/components/layout/account-switch-context.tsx");
if (!switchCtx.includes("router.refresh()")) {
  fails.push("Account switch must refresh after URL match");
}
if (!switchCtx.includes("refreshOnMatchRef")) {
  fails.push("Account switch must refresh-on-match at most once per switch");
}
if (!switchCtx.includes("completeOnUrlMatch") || !switchCtx.includes("targetMatchesParams")) {
  fails.push("Account switch must complete on confirmed URL match");
}

console.log(
  fails.length
    ? `FAIL (${fails.length})\n` + fails.map((f) => ` - ${f}`).join("\n")
    : "PASS — Sprint 6.37.1 regression fixes"
);
process.exit(fails.length ? 1 : 0);
