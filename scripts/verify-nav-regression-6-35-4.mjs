/**
 * Sprint 6.35.4 — Navigation regression fix checks.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const fails = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const scopeNav = read("src/lib/scope-navigation.ts");
const tenant = read("src/components/layout/tenant-selectors.tsx");
const dates = read("src/components/dashboard/date-range-picker.tsx");
const lifecycle = read("src/lib/dashboard-lifecycle.ts");
const switchCtx = read("src/components/layout/account-switch-context.tsx");
const page = read("src/app/page.tsx");

if (!scopeNav.includes("router.refresh()")) {
  fails.push("scope-navigation must refresh after URL change");
}
if (!tenant.includes("navigateScope")) {
  fails.push("tenant-selectors must use navigateScope");
}
if (!dates.includes("navigateScope")) {
  fails.push("date-range-picker must use navigateScope");
}
if (!lifecycle.includes("navigateScope")) {
  fails.push("replaceUrlIfChanged must use navigateScope");
}
if (switchCtx.includes("Account and data are in sync")) {
  fails.push("Must not claim data sync on URL-only success");
}
if (!switchCtx.includes("finishTimeout") && !/phase === \"timeout\"/.test(switchCtx)) {
  fails.push("Max-lock must use timeout path, not false success");
}
if (!page.includes("marketplaceAccountId}:${scope.from}")) {
  fails.push("Dashboard Suspense must key on scope so RSC remounts");
}

// No financial math touched by this sprint's nav files
for (const [rel, src] of [
  ["scope-navigation", scopeNav],
  ["account-switch-context", switchCtx],
]) {
  if (src.includes("profit-engine") || src.includes("buildModelB") || src.includes("smart-pricing")) {
    fails.push(`${rel} must not touch financial engines`);
  }
}

console.log(
  fails.length
    ? `FAIL (${fails.length})\n` + fails.map((f) => ` - ${f}`).join("\n")
    : "PASS — Sprint 6.35.4 navigation regression checks"
);
process.exit(fails.length ? 1 : 0);
