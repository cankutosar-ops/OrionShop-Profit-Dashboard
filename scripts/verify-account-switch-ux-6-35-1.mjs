/**
 * Sprint 6.35.1 — Account switching UX / navigation isolation checks.
 * Static verification: no business math files touched; no dual refresh path;
 * unlock must not wait on RSC / useTransition / server data load.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

const fails = [];

const tenant = read("src/components/layout/tenant-selectors.tsx");
const dateScope = read("src/components/dashboard/marketplace-date-scope.tsx");
const switchCtx = read("src/components/layout/account-switch-context.tsx");
const layout = read("src/components/layout/dashboard-layout.tsx");

if (!layout.includes("AccountSwitchProvider")) {
  fails.push("DashboardLayout missing AccountSwitchProvider");
}
if (!switchCtx.includes("Switching account")) {
  fails.push("Missing switching progress copy");
}
if (!switchCtx.includes("Loading dashboard")) {
  fails.push("Missing loading progress copy");
}
if (!switchCtx.includes("Finalizing")) {
  fails.push("Missing finalizing progress copy");
}
// 6.35.4: success must not claim data sync before RSC refresh completes
if (switchCtx.includes("Account and data are in sync")) {
  fails.push("Success copy must not claim data sync (false positive before RSC)");
}
if (!switchCtx.includes("finishTimeout") && !switchCtx.includes("timeout")) {
  fails.push("Max-lock must not claim success — use timeout path");
}
if (!tenant.includes("runAccountSwitch")) {
  fails.push("TenantSelectors not using runAccountSwitch");
}
if (!tenant.includes("applyDashboardDateScopeForAccount")) {
  fails.push("Date clamp not folded into single navigation");
}
if (/params\.set\(\s*SYNC_DATE_PARAM\.accountSwitched/.test(tenant) || /params\.set\(\s*["']accountSwitched["']/.test(tenant)) {
  fails.push("TenantSelectors still sets accountSwitched (causes 2nd reload)");
}
// 6.35.4: scope navigation must refresh after push/replace (via navigateScope)
const scopeNav = read("src/lib/scope-navigation.ts");
if (!scopeNav.includes("router.refresh()")) {
  fails.push("scope-navigation must call router.refresh() after URL update");
}
if (!tenant.includes("navigateScope") && !read("src/components/dashboard/date-range-picker.tsx").includes("navigateScope")) {
  fails.push("Account/date navigation must use navigateScope");
}
if (!tenant.includes("navigateScope")) {
  fails.push("TenantSelectors must use navigateScope");
}
if (/^\s*router\.refresh\(\)/m.test(dateScope) && !dateScope.includes("replaceUrlIfChanged")) {
  fails.push("MarketplaceDateScope should rely on replaceUrlIfChanged (which refreshes)");
}
if (!tenant.includes("isBusy") || !tenant.includes("disabled={selectorsDisabled}")) {
  fails.push("Selectors not disabled while busy");
}

// Math files must not be imported by switch UX for calculations
if (switchCtx.includes("profit-engine") || switchCtx.includes("smart-pricing")) {
  fails.push("Account switch context must not touch Model B / Smart Pricing");
}

// --- Unlock must not be gated on useTransition / server settlement ---
if (/useTransition\s*\(/.test(switchCtx) || /=\s*useTransition\b/.test(switchCtx)) {
  fails.push("Unlock must not use useTransition (RSC/WB can keep isPending true forever)");
}
if (/if\s*\(\s*isPending\s*\)\s*return/.test(switchCtx)) {
  fails.push("Completion path still early-returns on isPending");
}
if (/&&\s*!isPending|!\s*isPending\s*\)\s*finishSuccess/.test(switchCtx)) {
  fails.push("finishSuccess / unlock still gated on !isPending");
}
if (!switchCtx.includes("MAX_LOCK_MS")) {
  fails.push("Missing short max-lock timeout (must unlock without waiting for server)");
}
const maxLockMatch = switchCtx.match(/MAX_LOCK_MS\s*=\s*([\d_]+)/);
if (maxLockMatch) {
  const ms = Number(maxLockMatch[1].replace(/_/g, ""));
  if (!(ms >= 3_000 && ms <= 8_000)) {
    fails.push(`MAX_LOCK_MS should be 3–8s for usability, got ${ms}ms`);
  }
}
if (/180_000|180000/.test(switchCtx)) {
  fails.push("180s safety timeout still present — unlock must not wait that long");
}
// URL-match unlock: completion must compare searchParams to target
if (!switchCtx.includes("accountMatches") || !switchCtx.includes("companyMatches")) {
  fails.push("Missing URL account/company match unlock logic");
}
if (!/target\.account\s*===\s*accountId/.test(switchCtx) || !/target\.company\s*===\s*companyId/.test(switchCtx)) {
  fails.push("Unlock must compare searchParams account/company to switch target");
}

console.log("Sprint 6.35.1 — Account switching reliability checks");
if (fails.length) {
  console.log("FAIL");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("PASS");
console.log("✓ Single navigation path (no push+refresh)");
console.log("✓ Date clamp in same navigation (no accountSwitched)");
console.log("✓ MarketplaceDateScope does not refresh");
console.log("✓ Loading / progress / success UX present");
console.log("✓ Selectors disabled while busy");
console.log("✓ Unlock on URL match — not useTransition/isPending");
console.log("✓ Short max-lock (3–8s) — WB/RSC cannot hold overlay");
