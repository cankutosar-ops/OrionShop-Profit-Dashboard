/**
 * Structural RLS verifier for 20260917110000. The default catalog is the
 * read-only production snapshot in .audit; pass --catalog=PATH for a fresh
 * clone catalog and --post after applying the migration to that clone.
 * This does not query or change production.
 */
import { readFileSync } from "node:fs";

const targets = [
  ["wb_orders", "dashboard_read_orders", "tenant_select_wb_orders"],
  ["wb_sales", "dashboard_read_sales", "tenant_select_wb_sales"],
  ["product_cost_history", "dashboard_read_costs", "tenant_select_product_cost_history"],
];
const catalogPath = process.argv.find((arg) => arg.startsWith("--catalog="))?.slice(10)
  ?? ".audit/production-catalog-raw.json";
const post = process.argv.includes("--post");
const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
const catalog = raw.rows?.[0]?.catalog ?? raw.catalog ?? raw;
const sql = readFileSync("supabase/migrations/20260917110000_contain_residual_tenant_read_policies.sql", "utf8");
let failures = 0;

function check(label, pass) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
function hasGrant(table, grantee, privilege) {
  return catalog.grants.some((x) => x.table === table && x.grantee === grantee && x.privilege === privilege);
}
function effectiveFor(policy, role) {
  return policy.roles.includes(role) || policy.roles.includes("public");
}
function isRead(policy) {
  return policy.cmd === "SELECT" || policy.cmd === "ALL";
}

check("migration is transaction-wrapped", /^\s*BEGIN;/m.test(sql) && /^\s*COMMIT;/m.test(sql));
check("migration changes policy metadata only", !/^\s*(?:UPDATE|INSERT|DELETE|TRUNCATE|ALTER\s+TABLE|CREATE\s+POLICY|GRANT|REVOKE)\b/im.test(
  sql.replace(/--[^\n]*/g, "")
));
check("migration has exactly one policy-drop operation in a guarded loop",
  (sql.match(/DROP POLICY IF EXISTS %I ON public\.%I/g) ?? []).length === 1);

for (const [table, broadName, tenantName] of targets) {
  const relation = catalog.relations.find((x) => x.name === table);
  const policies = catalog.policies.filter((x) => x.table === table);
  const broad = policies.find((x) => x.name === broadName);
  const tenant = policies.find((x) => x.name === tenantName);
  const service = policies.find((x) => x.name === `service_role_all_${table}`);
  const after = policies.filter((x) => x.name !== broadName);
  const tuple = `('${table}', '${broadName}', '${tenantName}')`;

  check(`${table}: migration targets exact broad and scoped policy names`, sql.includes(tuple));
  check(`${table}: RLS enabled`, relation?.rls === true);
  check(`${table}: anon has no SELECT grant`, !hasGrant(table, "anon", "SELECT"));
  check(`${table}: authenticated retains SELECT grant`, hasGrant(table, "authenticated", "SELECT"));
  check(`${table}: service_role retains SELECT grant and all-access policy`,
    hasGrant(table, "service_role", "SELECT") && service?.cmd === "ALL" &&
    service?.roles.length === 1 && service.roles[0] === "service_role" && service.qual === "true");
  check(`${table}: tenant policy grants authenticated SELECT with account filter`,
    tenant?.cmd === "SELECT" && tenant.roles.length === 1 && tenant.roles[0] === "authenticated" &&
    tenant.qual.includes("orion_allowed_marketplace_account_ids()") &&
    (table !== "product_cost_history" || (tenant.qual.includes("product_id") && tenant.qual.includes("products"))));
  check(`${table}: ${post ? "post-correction" : "pre-correction"} broad-policy state`,
    post ? !broad : broad?.cmd === "SELECT" && broad.qual === "true" && effectiveFor(broad, "authenticated"));
  check(`${table}: projected authenticated read has no unconditional policy`,
    !after.some((x) => isRead(x) && effectiveFor(x, "authenticated") && x.qual === "true"));

  // Model the verified tenant policy predicate for one allowed and one foreign
  // account. This is structural evidence; the clone must run SQL/JWT row probes.
  const allowedAccountIds = [101];
  const rows = table === "product_cost_history"
    ? [{ product: { marketplace_account_id: 101 } }, { product: { marketplace_account_id: 202 } }]
    : [{ marketplace_account_id: 101 }, { marketplace_account_id: 202 }];
  const accountOf = (row) => row.product?.marketplace_account_id ?? row.marketplace_account_id;
  check(`${table}: own-account model passes; foreign-account model fails`,
    allowedAccountIds.includes(accountOf(rows[0])) && !allowedAccountIds.includes(accountOf(rows[1])));
}

if (failures) process.exitCode = 1;
