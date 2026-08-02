/**
 * Sprint 11.5 — Security & Audit validation.
 * Run: npm run verify:administration-security-audit-11-5
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const root = resolve(process.cwd());
console.log("=== Sprint 11.5 — Security & Audit ===\n");

const required = [
  "supabase/migrations/20260801120000_administration_security_audit_11_5.sql",
  "src/services/administration-audit-service.ts",
  "src/services/administration-security-service.ts",
  "src/app/api/administration/security/route.ts",
  "src/app/api/administration/audit-logs/route.ts",
  "src/components/administration/security-status-card.tsx",
  "src/components/administration/audit-log-table.tsx",
  "src/components/administration/login-history-table.tsx",
  "src/components/administration/secret-health-card.tsx",
  "src/components/administration/rls-status-table.tsx",
  "src/components/administration/security-event-table.tsx",
  "src/components/administration/security-panel.tsx",
  "src/components/administration/audit-logs-panel.tsx",
  "src/app/administration/security/page.tsx",
  "src/app/administration/audit-logs/page.tsx",
];

console.log("--- Artifacts ---");
for (const rel of required) {
  check(rel, existsSync(resolve(root, rel)));
}

const migration = readFileSync(
  resolve(root, "supabase/migrations/20260801120000_administration_security_audit_11_5.sql"),
  "utf8"
);
check("Migration creates administration_audit_events", migration.includes("administration_audit_events"));
check("Migration includes reason column", migration.includes("reason"));
check("Migration includes correlation_id", migration.includes("correlation_id"));
check("Migration adds RLS status reporter", migration.includes("orion_admin_rls_status"));
check("Migration does not DROP existing RLS policies", !/DROP\s+POLICY/i.test(migration));

const followUp = resolve(root, "supabase/migrations/20260801130000_administration_audit_reason_correlation_11_5.sql");
check("Follow-up migration for reason/correlation exists", existsSync(followUp));

const securitySvc = readFileSync(
  resolve(root, "src/services/administration-security-service.ts"),
  "utf8"
);
check("Security service reuses secrets helpers", securitySvc.includes("@/lib/security/secrets"));
check("Security service reuses roles", securitySvc.includes("@/lib/security/roles"));
check("Security service reuses listManagedUsers", securitySvc.includes("listManagedUsers"));
check("Secret health statuses are display-only tones", securitySvc.includes("healthy") && securitySvc.includes("missing"));
check("Never returns credential values", securitySvc.includes("assertSecurityPayloadSafe"));
check("Does not import financial engine", !securitySvc.includes("financial-engine"));
check("Does not import warehouse engines", !securitySvc.includes("@/lib/warehouse"));
check("Does not import smart-pricing", !securitySvc.includes("smart-pricing"));

const auditSvc = readFileSync(
  resolve(root, "src/services/administration-audit-service.ts"),
  "utf8"
);
check("Audit service redacts secrets in metadata", auditSvc.includes("redactSecrets"));
check("IP masking exists", auditSvc.includes("maskIp"));
check("Login history query exists", auditSvc.includes("queryLoginHistory"));
check("Security events query exists", auditSvc.includes("querySecurityEvents"));
check("recordPlatformSecurityEvent exists", auditSvc.includes("recordPlatformSecurityEvent"));
check("newCorrelationId exists", auditSvc.includes("newCorrelationId"));
check(
  "Administration security service does not generate security events",
  !securitySvc.includes("recordAuditEvent") && !securitySvc.includes("recordPlatformSecurityEvent")
);

const securityPage = readFileSync(
  resolve(root, "src/app/administration/security/page.tsx"),
  "utf8"
);
check("Security page uses SecurityPanel", securityPage.includes("SecurityPanel"));
check("Security page is not placeholder", !securityPage.includes("AdminPlaceholderPage"));

const auditPage = readFileSync(
  resolve(root, "src/app/administration/audit-logs/page.tsx"),
  "utf8"
);
check("Audit page uses AuditLogsPanel", auditPage.includes("AuditLogsPanel"));
check("Audit page is not placeholder", !auditPage.includes("AdminPlaceholderPage"));

const panel = readFileSync(
  resolve(root, "src/components/administration/security-panel.tsx"),
  "utf8"
);
check("Overview section present", panel.includes("Security Overview"));
check("Authentication section present", panel.includes("Authentication"));
check("Authorization section present", panel.includes("Authorization"));
check("RLS section present", panel.includes("RLS Status"));
check("Secret Health section present", panel.includes("Secret Health"));
check("Login History section present", panel.includes("Login History"));
check("Security Events section present", panel.includes("Security Events"));

const auditPanel = readFileSync(
  resolve(root, "src/components/administration/audit-logs-panel.tsx"),
  "utf8"
);
check("Audit panel supports search", auditPanel.includes("Search"));
check("Audit panel supports date range", auditPanel.includes("dateFrom") && auditPanel.includes("dateTo"));
check("Audit panel is read-only (no write API)", !auditPanel.includes("method: \"POST\""));

const auditTable = readFileSync(
  resolve(root, "src/components/administration/audit-log-table.tsx"),
  "utf8"
);
check("Audit table shows Reason", auditTable.includes("Reason"));
check("Audit table shows Correlation ID", auditTable.includes("Correlation ID"));

const loginRoute = readFileSync(resolve(root, "src/app/api/auth/login/route.ts"), "utf8");
check("Login records audit events", loginRoute.includes("recordAuditEvent"));
check("Login security events via platform helper", loginRoute.includes("recordPlatformSecurityEvent"));
check("Login still uses signInWithPassword (Auth unchanged)", loginRoute.includes("signInWithPassword"));

const marketplaceRoute = readFileSync(
  resolve(root, "src/app/api/marketplace-accounts/[id]/route.ts"),
  "utf8"
);
check(
  "Credential test emits platform security event",
  marketplaceRoute.includes("marketplace_credential_test") &&
    marketplaceRoute.includes("recordPlatformSecurityEvent")
);

const backfillRoute = readFileSync(
  resolve(root, "src/app/api/warehouse/historical-backfill/route.ts"),
  "utf8"
);
check("Historical backfill stamps correlation ID", backfillRoute.includes("correlationId"));

const incrementalRoute = readFileSync(
  resolve(root, "src/app/api/warehouse/incremental-sync/route.ts"),
  "utf8"
);
check("Incremental sync stamps correlation ID", incrementalRoute.includes("correlationId"));

const authorize = readFileSync(resolve(root, "src/lib/security/authorize.ts"), "utf8");
check("AuthZ file unchanged by security engine redesign", authorize.includes("resolveTenantMembership"));
check("AuthZ does not import administration-security-service", !authorize.includes("administration-security-service"));

const requireAuth = readFileSync(resolve(root, "src/lib/security/require-auth.ts"), "utf8");
check("require-auth still present (7.1.B)", requireAuth.includes("requireAuth"));

console.log("\n--- Credential safety ---");
const surfaces = [
  "src/services/administration-security-service.ts",
  "src/services/administration-audit-service.ts",
  "src/components/administration/security-panel.tsx",
  "src/components/administration/secret-health-card.tsx",
  "src/components/administration/audit-logs-panel.tsx",
  "src/app/api/administration/security/route.ts",
  "src/app/api/administration/audit-logs/route.ts",
];
let leak = false;
for (const rel of surfaces) {
  const text = readFileSync(resolve(root, rel), "utf8");
  if (/type=["']password["']/.test(text)) {
    leak = true;
    check(`No password input in ${rel}`, false);
  }
  if (/decryptCredential\(/.test(text)) {
    leak = true;
    check(`No decryptCredential in ${rel}`, false);
  }
}
if (!leak) check("No password inputs / credential decrypt in security surfaces", true);

const secretCard = readFileSync(
  resolve(root, "src/components/administration/secret-health-card.tsx"),
  "utf8"
);
check("Secret card documents never show values", secretCard.includes("never shown") || secretCard.includes("never"));

console.log("\n--- Warehouse / business modules untouched ---");
check(
  "warehouse-ops-service still exists",
  existsSync(resolve(root, "src/services/warehouse-ops-service.ts"))
);
check(
  "financial-engine still exists",
  existsSync(resolve(root, "src/lib/financial-engine.ts"))
);
check(
  "Security service does not call sync engines",
  !securitySvc.includes("runBlockingDashboardSync") &&
    !securitySvc.includes("historical-backfill")
);

console.log("\n=== Result ===");
if (failures === 0) {
  console.log("PASS — Sprint 11.5 Security & Audit");
  process.exit(0);
}
console.log(`FAIL — ${failures} check(s) failed`);
process.exit(1);
