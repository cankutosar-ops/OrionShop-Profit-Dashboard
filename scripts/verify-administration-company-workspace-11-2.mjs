/**
 * Sprint 11.2 — Company Workspace & Marketplace Connections validation.
 * Run: npx tsx scripts/verify-administration-company-workspace-11-2.mjs
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
    else if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

const root = resolve(process.cwd());
console.log("=== Sprint 11.2 — Company Workspace & Marketplace Connections ===\n");

const required = [
  "supabase/migrations/20260731200000_company_workspace_11_2.sql",
  "src/lib/administration/connection-status.ts",
  "src/components/administration/company-card.tsx",
  "src/components/administration/company-workspace.tsx",
  "src/components/administration/marketplace-connection-card.tsx",
  "src/components/administration/connection-status-badge.tsx",
  "src/components/administration/quick-action-panel.tsx",
  "src/components/administration/workspace-summary-card.tsx",
  "src/components/administration/company-list-panel.tsx",
  "src/components/administration/company-workspace-panel.tsx",
  "src/components/administration/connections-panel.tsx",
  "src/app/administration/companies/page.tsx",
  "src/app/administration/companies/[companyId]/page.tsx",
  "src/app/administration/connections/page.tsx",
];

console.log("--- Artifacts ---");
for (const rel of required) {
  check(rel, existsSync(resolve(root, rel)));
}

const migration = readFileSync(
  resolve(root, "supabase/migrations/20260731200000_company_workspace_11_2.sql"),
  "utf8"
);
check("Migration adds company status", migration.includes("status"));
check("Migration adds default_tax_percent", migration.includes("default_tax_percent"));

const svc = readFileSync(resolve(root, "src/services/marketplace-account-service.ts"), "utf8");
check("archiveCompany exists", svc.includes("export async function archiveCompany"));
check("testConnection returns latencyMs", svc.includes("latencyMs"));
check("testConnection uses marketplace adapter", svc.includes("testWildberriesConnection"));

const companyPage = readFileSync(
  resolve(root, "src/app/administration/companies/page.tsx"),
  "utf8"
);
check("Companies page uses CompanyListPanel", companyPage.includes("CompanyListPanel"));
check("Companies page is not placeholder", !companyPage.includes("AdminPlaceholderPage"));

const workspacePage = readFileSync(
  resolve(root, "src/app/administration/companies/[companyId]/page.tsx"),
  "utf8"
);
check("Workspace route exists", workspacePage.includes("CompanyWorkspacePanel"));

const connPage = readFileSync(
  resolve(root, "src/app/administration/connections/page.tsx"),
  "utf8"
);
check("Connections page uses ConnectionsPanel", connPage.includes("ConnectionsPanel"));

const workspace = readFileSync(
  resolve(root, "src/components/administration/company-workspace.tsx"),
  "utf8"
);
check("Workspace reuses historical-backfill API", workspace.includes("/api/warehouse/historical-backfill"));
check("Workspace reuses incremental-sync API", workspace.includes("/api/warehouse/incremental-sync"));
check("Workspace does not import warehouse engines", !/from ["']@\/lib\/warehouse/.test(workspace));

const card = readFileSync(
  resolve(root, "src/components/administration/marketplace-connection-card.tsx"),
  "utf8"
);
check("Connection card has Test Connection", card.includes("Test Connection"));
check(
  "Connection card never exposes credential values",
  !/api_key_encrypted|decryptCredential|account\.api_key\b/.test(card) &&
    !/type=["']password["']/.test(card)
);

const adminCompSrc = walk(resolve(root, "src/components/administration"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
check(
  "Admin components never log credentials",
  !/api_key_encrypted|decryptCredential/.test(adminCompSrc)
);
check(
  "Admin UI does not import Financial Engine / Smart Pricing",
  !/financial-engine|smart-pricing|buildModelB/.test(adminCompSrc)
);

const warehouseIdx = readFileSync(resolve(root, "src/lib/warehouse/index.ts"), "utf8");
check("Warehouse package entry still exists (untouched by design)", warehouseIdx.length > 0);

const types = readFileSync(resolve(root, "src/types/database.ts"), "utf8");
check("Company type has status", types.includes("status: CompanyStatus"));
check("Company type has default_tax_percent", types.includes("default_tax_percent: number"));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
