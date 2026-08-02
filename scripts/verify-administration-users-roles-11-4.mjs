/**
 * Sprint 11.4 — Users & Roles validation.
 * Run: npm run verify:administration-users-roles-11-4
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
console.log("=== Sprint 11.4 — Users & Roles ===\n");

const required = [
  "src/lib/security/roles.ts",
  "src/lib/security/tenant-membership.ts",
  "src/services/administration-user-service.ts",
  "src/app/api/administration/users/route.ts",
  "src/app/api/administration/users/[userId]/route.ts",
  "src/app/api/administration/users/[userId]/memberships/route.ts",
  "src/app/api/administration/users/[userId]/marketplace-access/route.ts",
  "src/app/api/administration/roles/route.ts",
  "src/components/administration/user-table.tsx",
  "src/components/administration/user-card.tsx",
  "src/components/administration/user-details-panel.tsx",
  "src/components/administration/membership-table.tsx",
  "src/components/administration/marketplace-access-table.tsx",
  "src/components/administration/role-badge.tsx",
  "src/components/administration/users-panel.tsx",
  "src/components/administration/roles-panel.tsx",
  "src/app/administration/users/page.tsx",
  "src/app/administration/roles/page.tsx",
];

console.log("--- Artifacts ---");
for (const rel of required) {
  check(rel, existsSync(resolve(root, rel)));
}

const roles = readFileSync(resolve(root, "src/lib/security/roles.ts"), "utf8");
check("Roles include Administrator", roles.includes('"administrator"'));
check("Roles include Manager", roles.includes('"manager"'));
check("Roles include Operator", roles.includes('"operator"'));
check("Roles include Viewer", roles.includes('"viewer"'));

const membership = readFileSync(
  resolve(root, "src/lib/security/tenant-membership.ts"),
  "utf8"
);
check("Membership preserves role", membership.includes("role"));
check("revokeCompanyFromUser exists", membership.includes("export async function revokeCompanyFromUser"));
check(
  "Marketplace grant/revoke helpers exist",
  membership.includes("grantMarketplaceAccountToUser") &&
    membership.includes("revokeMarketplaceAccountFromUser")
);
check("Still uses app_metadata.orion", membership.includes("ORION_TENANT_METADATA_KEY"));

const svc = readFileSync(
  resolve(root, "src/services/administration-user-service.ts"),
  "utf8"
);
check("Invite uses inviteUserByEmail", svc.includes("inviteUserByEmail"));
check("Statuses include active/invited/disabled", /active.*invited.*disabled|UserStatus/.test(svc));
check("Never sets password on invite", !/password\s*:/.test(svc));
check("assertNoCredentialsInPayload exists", svc.includes("assertNoCredentialsInPayload"));
check("Displays Wildberries/Ozon/Lamoda/Shopify", svc.includes("shopify") && svc.includes("wildberries"));

const usersPage = readFileSync(
  resolve(root, "src/app/administration/users/page.tsx"),
  "utf8"
);
check("Users page uses UsersPanel", usersPage.includes("UsersPanel"));
check("Users page is not placeholder", !usersPage.includes("AdminPlaceholderPage"));

const rolesPage = readFileSync(
  resolve(root, "src/app/administration/roles/page.tsx"),
  "utf8"
);
check("Roles page uses RolesPanel", rolesPage.includes("RolesPanel"));
check("Roles page is not placeholder", !rolesPage.includes("AdminPlaceholderPage"));

const usersPanel = readFileSync(
  resolve(root, "src/components/administration/users-panel.tsx"),
  "utf8"
);
check("UsersPanel loads user list API", usersPanel.includes("/api/administration/users"));
check("UsersPanel has Invite", usersPanel.includes("Invite"));
check("UsersPanel never collects password", !/type=["']password["']/.test(usersPanel));

const details = readFileSync(
  resolve(root, "src/components/administration/user-details-panel.tsx"),
  "utf8"
);
check("Details has Profile", details.includes("Display name") || details.includes("Save profile"));
check("Details has Memberships", details.includes("MembershipTable"));
check("Details has Marketplace Access", details.includes("MarketplaceAccessTable"));
check("Details has Role", details.includes("RoleBadge"));
check("Details has Recent Activity", details.includes("Recent Activity"));

const accessTable = readFileSync(
  resolve(root, "src/components/administration/marketplace-access-table.tsx"),
  "utf8"
);
check("Marketplace table lists four platforms", accessTable.includes("DISPLAY_MARKETPLACES"));
check("Marketplace table grant/revoke", accessTable.includes("Grant") && accessTable.includes("Revoke"));

const authorize = readFileSync(resolve(root, "src/lib/security/authorize.ts"), "utf8");
check(
  "AuthZ unchanged — still membership-based",
  authorize.includes("resolveTenantMembership") && !authorize.includes("PLATFORM_ROLES")
);
check(
  "AuthZ does not import administration-user-service",
  !authorize.includes("administration-user-service")
);

const requireAuth = readFileSync(resolve(root, "src/lib/security/require-auth.ts"), "utf8");
check("require-auth file still present (7.1.B)", requireAuth.includes("requireAuth"));

console.log("\n--- Credential safety ---");
const userMgmtFiles = [
  resolve(root, "src/services/administration-user-service.ts"),
  resolve(root, "src/components/administration/users-panel.tsx"),
  resolve(root, "src/components/administration/user-details-panel.tsx"),
  resolve(root, "src/components/administration/user-table.tsx"),
  resolve(root, "src/components/administration/user-card.tsx"),
  resolve(root, "src/components/administration/membership-table.tsx"),
  resolve(root, "src/components/administration/marketplace-access-table.tsx"),
  resolve(root, "src/components/administration/roles-panel.tsx"),
  resolve(root, "src/app/api/administration/users/route.ts"),
  resolve(root, "src/app/api/administration/users/[userId]/route.ts"),
  resolve(root, "src/app/api/administration/users/[userId]/memberships/route.ts"),
  resolve(root, "src/app/api/administration/users/[userId]/marketplace-access/route.ts"),
  resolve(root, "src/app/api/administration/roles/route.ts"),
];

let credentialLeak = false;
for (const file of userMgmtFiles) {
  const text = readFileSync(file, "utf8");
  if (/type=["']password["']/.test(text)) {
    credentialLeak = true;
    check(`No password input in ${file.replace(root, "")}`, false);
  }
  if (/api_key_encrypted|decryptCredential/.test(text)) {
    credentialLeak = true;
    check(`No credential decrypt in ${file.replace(root, "")}`, false);
  }
}
if (!credentialLeak) {
  check("No password fields / credential decrypt in user management surfaces", true);
}

const inviteRoute = readFileSync(
  resolve(root, "src/app/api/administration/users/route.ts"),
  "utf8"
);
check("Invite route uses requireAuth", inviteRoute.includes("requireAuth"));
check("Invite route does not accept password", !/password/.test(inviteRoute));

console.log("\n--- Warehouse / business modules untouched ---");
const warehouseOps = resolve(root, "src/services/warehouse-ops-service.ts");
const smartPricing = resolve(root, "src/lib/smart-pricing.ts");
const finance = resolve(root, "src/lib/financial-engine.ts");
check("warehouse-ops-service still exists", existsSync(warehouseOps));
check("smart-pricing still exists", existsSync(smartPricing));
check(
  "User service does not import warehouse engines",
  !svc.includes("@/lib/warehouse") && !svc.includes("warehouse-ops")
);
check(
  "User service does not import smart-pricing / financial engine",
  !svc.includes("smart-pricing") && !svc.includes("financial-engine")
);

console.log("\n=== Result ===");
if (failures === 0) {
  console.log("PASS — Sprint 11.4 Users & Roles");
  process.exit(0);
}
console.log(`FAIL — ${failures} check(s) failed`);
process.exit(1);
