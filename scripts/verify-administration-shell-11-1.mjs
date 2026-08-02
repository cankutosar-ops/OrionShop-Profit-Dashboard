/**
 * Sprint 11.1 — Administration Shell validation.
 * Run: npx tsx scripts/verify-administration-shell-11-1.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const root = resolve(process.cwd());
console.log("=== Sprint 11.1 — Administration Shell ===\n");

const components = [
  "src/components/administration/admin-layout.tsx",
  "src/components/administration/admin-sidebar.tsx",
  "src/components/administration/admin-header.tsx",
  "src/components/administration/admin-breadcrumb.tsx",
  "src/components/administration/admin-section.tsx",
  "src/components/administration/admin-placeholder.tsx",
  "src/components/administration/admin-metric-card.tsx",
];
console.log("--- Components ---");
for (const rel of components) {
  check(rel, existsSync(resolve(root, rel)));
}

const routes = [
  "src/app/administration/layout.tsx",
  "src/app/administration/page.tsx",
  "src/app/administration/companies/page.tsx",
  "src/app/administration/connections/page.tsx",
  "src/app/administration/warehouse/page.tsx",
  "src/app/administration/warehouse/sessions/page.tsx",
  "src/app/administration/warehouse/scheduler/page.tsx",
  "src/app/administration/warehouse/queue/page.tsx",
  "src/app/administration/warehouse/checkpoints/page.tsx",
  "src/app/administration/users/page.tsx",
  "src/app/administration/roles/page.tsx",
  "src/app/administration/audit-logs/page.tsx",
  "src/app/administration/security/page.tsx",
  "src/app/administration/alerts/page.tsx",
  "src/app/administration/system-health/page.tsx",
  "src/app/administration/settings/page.tsx",
];
console.log("\n--- Routes ---");
for (const rel of routes) {
  check(rel, existsSync(resolve(root, rel)));
}

console.log("\n--- Shell wiring ---");
const layout = readFileSync(resolve(root, "src/app/administration/layout.tsx"), "utf8");
check("Layout calls requireAdminAccess", layout.includes("requireAdminAccess"));
check("Layout uses AdminLayout", layout.includes("AdminLayout"));

const appShell = readFileSync(resolve(root, "src/components/layout/app-shell.tsx"), "utf8");
check(
  "AppShell skips DashboardLayout for /administration",
  appShell.includes("isAdminShellPath") || appShell.includes("/administration")
);

const sidebar = readFileSync(resolve(root, "src/components/layout/sidebar.tsx"), "utf8");
check("Main sidebar links to Administration", sidebar.includes('href: "/administration"'));

const gate = readFileSync(
  resolve(root, "src/lib/administration/require-admin-access.ts"),
  "utf8"
);
check("Auth gate uses getAuthUser", gate.includes("getAuthUser"));
check("Role options reserved (not enforced)", gate.includes("requiredRoles"));

const overview = readFileSync(resolve(root, "src/app/administration/page.tsx"), "utf8");
check("Overview uses AdminMetricCard", overview.includes("AdminMetricCard"));
check("Overview has no live service imports", !/from ["']@\/services\//.test(overview));

console.log("\n--- Boundary (no business mutations) ---");
const adminAppFiles = walk(resolve(root, "src/app/administration"));
const adminCompFiles = walk(resolve(root, "src/components/administration"));
const adminLibFiles = walk(resolve(root, "src/lib/administration"));
const allAdmin = [...adminAppFiles, ...adminCompFiles, ...adminLibFiles]
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

check(
  "Admin shell has no createAdminClient mutations",
  !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(allAdmin)
);
check(
  "Admin shell has no WbApiClient",
  !/WbApiClient|createWbSyncService/.test(allAdmin)
);
check(
  "Admin shell does not import Financial Engine / Smart Pricing",
  !/financial-engine|smart-pricing|buildModelB/.test(allAdmin)
);

const unchanged = [
  "src/services/dashboard-service.ts",
  "src/lib/smart-pricing.ts",
  "src/lib/warehouse/index.ts",
];
console.log("\n--- Existing modules present (unchanged by design) ---");
for (const rel of unchanged) {
  check(rel, existsSync(resolve(root, rel)));
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
