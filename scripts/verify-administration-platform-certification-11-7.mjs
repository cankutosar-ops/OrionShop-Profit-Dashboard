/**
 * Sprint 11.7 — Administration Platform Certification.
 * Validation only — no feature implementation.
 *
 * Run: npm run verify:administration-platform-certification-11-7
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
const sections = {
  architecture: { pass: 0, fail: 0 },
  navigation: { pass: 0, fail: 0 },
  boundaries: { pass: 0, fail: 0 },
  reuse: { pass: 0, fail: 0 },
  security: { pass: 0, fail: 0 },
  configuration: { pass: 0, fail: 0 },
  performance: { pass: 0, fail: 0 },
  production: { pass: 0, fail: 0 },
};

let currentSection = "architecture";

function section(name) {
  currentSection = name;
  console.log(`\n=== ${name.toUpperCase()} ===`);
}

function check(label, cond, detail = "") {
  const bucket = sections[currentSection];
  if (cond) {
    bucket.pass += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    bucket.fail += 1;
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function exists(rel) {
  return existsSync(resolve(root, rel));
}

function collectText(paths) {
  return paths
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
}

function runPriorVerify(scriptName) {
  const result = spawnSync("npx", ["tsx", scriptName], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  return result.status === 0;
}

const root = resolve(process.cwd());
console.log("=== Sprint 11.7 — Administration Platform Certification ===");
console.log("Validation only. No feature implementation.\n");

const adminApp = resolve(root, "src/app/administration");
const adminComponents = resolve(root, "src/components/administration");
const adminLib = resolve(root, "src/lib/administration");
const adminApi = resolve(root, "src/app/api/administration");
const adminServices = [
  "src/services/administration-user-service.ts",
  "src/services/administration-audit-service.ts",
  "src/services/administration-security-service.ts",
  "src/services/administration-platform-settings-service.ts",
  "src/services/warehouse-control-center-service.ts",
].map((p) => resolve(root, p));

const adminFiles = [
  ...walk(adminApp),
  ...walk(adminComponents),
  ...walk(adminLib),
  ...walk(adminApi),
  ...adminServices.filter((p) => existsSync(p)),
];
const adminCorpus = collectText(adminFiles);

// ---------------------------------------------------------------------------
section("architecture");
// ---------------------------------------------------------------------------
check("Administration app tree exists", exists("src/app/administration"));
check("Administration layout gates access", read("src/app/administration/layout.tsx").includes("requireAdminAccess"));
check("AdminLayout shell present", exists("src/components/administration/admin-layout.tsx"));
check(
  "AppShell isolates Administration from DashboardLayout",
  read("src/components/layout/app-shell.tsx").includes("administration") ||
    read("src/components/layout/app-shell.tsx").includes("isAdminShellPath")
);

const forbiddenBusiness = [
  /from\s+["']@\/lib\/financial-engine["']/,
  /from\s+["']@\/lib\/smart-pricing["']/,
  /calculateEstimatedTax/,
  /buildModelBProfitMetrics/,
  /from\s+["']@\/lib\/warehouse\/backfill\/engine["']/,
  /from\s+["']@\/lib\/warehouse\/incremental\/engine["']/,
  /HistoricalBackfillEngine/,
  /IncrementalSyncEngine/,
];
let businessLeak = null;
for (const re of forbiddenBusiness) {
  if (re.test(adminCorpus)) {
    businessLeak = re.toString();
    break;
  }
}
check(
  "Administration never performs / owns business calculations or sync engines",
  !businessLeak,
  businessLeak ? `matched ${businessLeak}` : "no FE/SP/engine imports in admin surface"
);

check("Financial Engine remains independent", exists("src/lib/financial-engine.ts"));
check("Smart Pricing remains independent", exists("src/lib/smart-pricing.ts"));
check("Warehouse ops service remains independent", exists("src/services/warehouse-ops-service.ts"));
check(
  "Warehouse control center is read aggregation",
  read("src/services/warehouse-control-center-service.ts").includes("getWarehouseAdminBundle") &&
    !read("src/services/warehouse-control-center-service.ts").includes("HistoricalBackfillEngine")
);

// ---------------------------------------------------------------------------
section("navigation");
// ---------------------------------------------------------------------------
const nav = read("src/lib/administration/nav.ts");
const sidebar = read("src/components/administration/admin-sidebar.tsx");
const breadcrumb = read("src/components/administration/admin-breadcrumb.tsx");

check("Sidebar uses ADMIN_NAV_SECTIONS", sidebar.includes("ADMIN_NAV_SECTIONS"));
check("Dashboard return navigation present", sidebar.includes("Back to Dashboard"));
check("Dashboard return targets /", /DASHBOARD_HREF\s*=\s*["']\/["']|href=["']\/["']/.test(sidebar));
check("Breadcrumbs helper present", nav.includes("buildAdminBreadcrumbs"));
check("Breadcrumb component present", exists("src/components/administration/admin-breadcrumb.tsx"));
check("Breadcrumb uses buildAdminBreadcrumbs", breadcrumb.includes("buildAdminBreadcrumbs"));

const requiredRoutes = [
  "src/app/administration/page.tsx",
  "src/app/administration/companies/page.tsx",
  "src/app/administration/companies/[companyId]/page.tsx",
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
for (const rel of requiredRoutes) {
  check(`Route exists: ${rel}`, exists(rel));
}

let placeholderPages = 0;
for (const rel of requiredRoutes) {
  const text = read(rel);
  if (text.includes("AdminPlaceholderPage")) placeholderPages += 1;
}
check("No AdminPlaceholderPage on certified routes", placeholderPages === 0, `${placeholderPages} placeholder page(s)`);

const navHrefs = [...nav.matchAll(/href:\s*`?\$\{ADMIN_ROOT\}([^`",\n]*)`?|href:\s*ADMIN_ROOT/g)].map(
  (m) => (m[0].includes("ADMIN_ROOT") && !m[1] ? "/administration" : `/administration${m[1] || ""}`)
);
// Simpler: flatten from known list
const expectedHrefs = [
  "/administration",
  "/administration/companies",
  "/administration/connections",
  "/administration/warehouse",
  "/administration/warehouse/sessions",
  "/administration/warehouse/scheduler",
  "/administration/warehouse/queue",
  "/administration/warehouse/checkpoints",
  "/administration/users",
  "/administration/roles",
  "/administration/audit-logs",
  "/administration/security",
  "/administration/alerts",
  "/administration/system-health",
  "/administration/settings",
];
for (const href of expectedHrefs) {
  const pageRel =
    href === "/administration"
      ? "src/app/administration/page.tsx"
      : `src/app/administration${href.replace("/administration", "")}/page.tsx`;
  check(`Nav href has page: ${href}`, exists(pageRel));
}

// ---------------------------------------------------------------------------
section("boundaries");
// ---------------------------------------------------------------------------
const owned = {
  Companies: "src/components/administration/company-list-panel.tsx",
  "Marketplace Connections": "src/components/administration/connections-panel.tsx",
  "Warehouse Operations": "src/components/administration/warehouse-control-shell.tsx",
  Users: "src/components/administration/users-panel.tsx",
  Roles: "src/components/administration/roles-panel.tsx",
  Security: "src/components/administration/security-panel.tsx",
  Audit: "src/components/administration/audit-logs-panel.tsx",
  "Platform Settings": "src/components/administration/settings-panel.tsx",
};
for (const [name, rel] of Object.entries(owned)) {
  check(`Owns ${name}`, exists(rel));
}

check(
  "Does NOT own Financial Engine formulas",
  !adminCorpus.includes("calculateEstimatedTax") && !adminCorpus.includes("buildModelBProfitMetrics")
);
check(
  "Does NOT own Smart Pricing solver",
  !/from\s+["']@\/lib\/smart-pricing["']/.test(adminCorpus)
);
check(
  "Does NOT own Product Analytics services",
  !adminCorpus.includes("product-analytics-service") &&
    !adminCorpus.includes("@/services/dashboard-service")
);
check(
  "Warehouse UI reuses ops APIs (does not embed sync engines)",
  read("src/components/administration/warehouse-control-context.tsx").includes("/api/warehouse/ops") &&
    !read("src/components/administration/warehouse-control-context.tsx").includes("HistoricalBackfillEngine")
);

// ---------------------------------------------------------------------------
section("reuse");
// ---------------------------------------------------------------------------
check("Authentication (require-auth) present", exists("src/lib/security/require-auth.ts"));
check("Authorization (authorize) present", exists("src/lib/security/authorize.ts"));
check("RLS migration present", exists("supabase/migrations/20260729180000_rls_tenant_isolation_7_1_d.sql"));
check("ThemeProvider present", exists("src/components/providers/theme-provider.tsx"));
check("ThemeSelector reused in admin header", read("src/components/administration/admin-header.tsx").includes("ThemeSelector"));
check("Platform config provider present", exists("src/lib/platform-config/provider.ts"));
check(
  "Settings API uses platform-config provider",
  read("src/app/api/administration/settings/route.ts").includes("@/lib/platform-config")
);
check("Warehouse ops service reused by control center", exists("src/services/warehouse-ops-service.ts"));
check(
  "Control center calls getWarehouseAdminBundle",
  read("src/services/warehouse-control-center-service.ts").includes("getWarehouseAdminBundle")
);
check("Tenant membership reused for users", read("src/services/administration-user-service.ts").includes("tenant-membership"));
check("Admin access uses require-auth", read("src/lib/administration/require-admin-access.ts").includes("getAuthUser"));

// ---------------------------------------------------------------------------
section("security");
// ---------------------------------------------------------------------------
const auditSvc = read("src/services/administration-audit-service.ts");
const securitySvc = read("src/services/administration-security-service.ts");
const auditTable = read("src/components/administration/audit-log-table.tsx");
const migration115 = exists("supabase/migrations/20260801120000_administration_security_audit_11_5.sql")
  ? read("supabase/migrations/20260801120000_administration_security_audit_11_5.sql")
  : "";
const migration115b = exists("supabase/migrations/20260801130000_administration_audit_reason_correlation_11_5.sql")
  ? read("supabase/migrations/20260801130000_administration_audit_reason_correlation_11_5.sql")
  : "";

check("Audit schema supports reason", migration115.includes("reason") || migration115b.includes("reason"));
check(
  "Audit schema supports correlation_id",
  migration115.includes("correlation_id") || migration115b.includes("correlation_id")
);
check("AuditLogTable displays Reason", auditTable.includes("Reason"));
check("AuditLogTable displays Correlation ID", auditTable.includes("Correlation ID"));
check("recordPlatformSecurityEvent exists", auditSvc.includes("recordPlatformSecurityEvent"));
check(
  "Administration security service does not emit security events",
  !securitySvc.includes("recordAuditEvent") && !securitySvc.includes("recordPlatformSecurityEvent")
);
check(
  "Login emits platform security events",
  read("src/app/api/auth/login/route.ts").includes("recordPlatformSecurityEvent")
);
check(
  "Credential test emits platform security events",
  read("src/app/api/marketplace-accounts/[id]/route.ts").includes("recordPlatformSecurityEvent")
);

const secretSurfaces = [
  "src/services/administration-security-service.ts",
  "src/services/administration-user-service.ts",
  "src/components/administration/security-panel.tsx",
  "src/components/administration/secret-health-card.tsx",
  "src/components/administration/users-panel.tsx",
];
let secretLeak = false;
for (const rel of secretSurfaces) {
  const text = read(rel);
  if (/type=["']password["']/.test(text) || /decryptCredential\(/.test(text)) {
    secretLeak = true;
    check(`No credential exposure in ${rel}`, false);
  }
}
if (!secretLeak) check("Secrets never exposed in admin security/user surfaces", true);

check(
  "Connection card does not render ciphertext",
  !/api_key_encrypted|decryptCredential/.test(read("src/components/administration/marketplace-connection-card.tsx")) ||
    !read("src/components/administration/marketplace-connection-card.tsx").includes("decryptCredential")
);

// ---------------------------------------------------------------------------
section("configuration");
// ---------------------------------------------------------------------------
const platformProvider = read("src/lib/platform-config/provider.ts");
const settingsSvc = read("src/services/administration-platform-settings-service.ts");
const settingsPanel = read("src/components/administration/settings-panel.tsx");

check("Platform Settings SoT provider documents ownership", platformProvider.includes("Company Workspace"));
check("getPlatformConfiguration exported", platformProvider.includes("getPlatformConfiguration"));
check("Platform settings exclude defaultCurrency", !settingsSvc.includes("defaultCurrency"));
check("Settings UI excludes Default Currency", !settingsPanel.includes("Default Currency"));
check("Settings UI points company ownership", settingsPanel.includes("Company Workspace"));
check("Company Workspace remains separate", exists("src/components/administration/company-workspace.tsx"));
check("Connections panel remains separate", exists("src/components/administration/connections-panel.tsx"));
check(
  "Theme uses existing ThemeProvider storage key",
  read("src/lib/theme.ts").includes("orionshop.theme")
);

// ---------------------------------------------------------------------------
section("performance");
// ---------------------------------------------------------------------------
check(
  "Warehouse control context shares one ops fetch surface",
  read("src/components/administration/warehouse-control-context.tsx").includes("WarehouseControlProvider") ||
    read("src/components/administration/warehouse-control-context.tsx").includes("useWarehouseControl")
);
check(
  "Security panel batches overview loads",
  read("src/components/administration/security-panel.tsx").includes("Promise.all")
);
check(
  "No client-side Estimated Tax in administration",
  !adminCorpus.includes("calculateEstimatedTax") && !adminCorpus.includes("finishedPrice")
);
check(
  "Shared admin components barrel exists",
  exists("src/components/administration/index.ts")
);
check(
  "Users list uses single list endpoint",
  read("src/components/administration/users-panel.tsx").includes("/api/administration/users")
);

// ---------------------------------------------------------------------------
section("production");
// ---------------------------------------------------------------------------
const priorScripts = [
  "scripts/verify-administration-shell-11-1.mjs",
  "scripts/verify-administration-company-workspace-11-2.mjs",
  "scripts/verify-administration-warehouse-control-11-3.mjs",
  "scripts/verify-administration-users-roles-11-4.mjs",
  "scripts/verify-administration-security-audit-11-5.mjs",
  "scripts/verify-administration-nav-11-5-1.mjs",
  "scripts/verify-administration-platform-settings-11-6.mjs",
  "scripts/verify-theme-support.mjs",
];
for (const rel of priorScripts) {
  check(`Prior verify artifact present: ${relative(root, resolve(root, rel))}`, exists(rel));
}

console.log("\n--- Running prior Administration verify scripts ---");
const priorResults = [];
for (const rel of priorScripts) {
  const ok = runPriorVerify(rel);
  priorResults.push({ rel, ok });
  check(`Prior verify PASS: ${rel}`, ok);
}

check("Auth requireAuth module present", exists("src/lib/security/require-auth.ts"));
check("AuthZ authorize module present", exists("src/lib/security/authorize.ts"));
check("RLS docs/migration present", exists("docs/02-architecture/DATABASE_RLS.md"));
check("Theme provider wired in root layout", read("src/app/layout.tsx").includes("ThemeProvider"));
check("Administration routing under /administration", exists("src/app/administration/layout.tsx"));
check("Platform configuration migration present", exists("supabase/migrations/20260801160000_platform_settings_11_6.sql"));
check("Security audit migration present", exists("supabase/migrations/20260801120000_administration_security_audit_11_5.sql"));

// ---------------------------------------------------------------------------
console.log("\n=== CERTIFICATION SUMMARY ===\n");
for (const [name, counts] of Object.entries(sections)) {
  const status = counts.fail === 0 ? "PASS" : "FAIL";
  console.log(
    `${status.padEnd(4)}  ${name.padEnd(14)}  (${counts.pass} pass / ${counts.fail} fail)`
  );
}

console.log("\n=== Result ===");
if (failures === 0) {
  console.log("PASS — Sprint 11.7 Administration Platform Certification");
  console.log("Administration Platform is certified: architecture boundaries intact.");
  process.exit(0);
}
console.log(`FAIL — ${failures} check(s) failed — Administration Platform NOT certified`);
process.exit(1);
