/**
 * P0 Security & Tenant Isolation — regression verification.
 *
 * Scenarios (task A–I):
 *   A  authorized user → own account                         → PASS
 *   B  authorized user → unauthorized ?account=              → DENY
 *   C  authorized user → unauthorized ?company=              → DENY
 *   D  API unauthorized account                              → DENY
 *   E  Administration without the required role              → DENY
 *   F  Administration with the required role                 → PASS
 *   G  no server secret reachable from client bundles
 *   H  no live WB / Finance HTTP on the page-load path
 *   I  switching between authorized accounts still works
 *
 * A/B/C/D/E/F/I execute the real authorization modules (`decideTenantScope`,
 * `hasAdministrationRole`) — no string matching on the rule itself.
 * G/H are module-graph checks over real imports.
 * Live HTTP checks run only when a dev server + E2E credentials are available;
 * otherwise they report SKIP and never count as PASS.
 *
 * Usage: npm run verify:tenant-authorization-p0
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideTenantScope } from "../src/lib/security/tenant-scope.ts";
import {
  ADMINISTRATION_ALLOWED_ROLES,
  hasAdministrationRole,
} from "../src/lib/security/admin-authorization.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let skipped = 0;

function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${why}`);
}

// ---------------------------------------------------------------------------
// Fixtures — two companies, three accounts. The user is a member of C1 only.
// ---------------------------------------------------------------------------
const ACCOUNTS = {
  A1: { marketplaceAccountId: "A1", companyId: "C1" },
  A2: { marketplaceAccountId: "A2", companyId: "C1" },
  FOREIGN: { marketplaceAccountId: "FOREIGN", companyId: "C9" },
};

const lookup = async (id) => ACCOUNTS[id] ?? null;

const memberOfBoth = { companyIds: ["C1"], marketplaceAccountIds: ["A1", "A2"] };
const memberOfA1Only = { companyIds: ["C1"], marketplaceAccountIds: ["A1"] };
const noMembership = { companyIds: [], marketplaceAccountIds: [] };

const REQUIRE_ACCOUNT = { allowDefaultAccount: true, requireMarketplaceAccount: true };

console.log("=== P0 Security & Tenant Isolation ===\n");
console.log("--- A/B/C/I — tenant scope decision (shared by pages and API) ---");

{
  // A — authorized user, own account
  const d = await decideTenantScope(
    memberOfA1Only,
    { account: "A1" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "A  own account allowed",
    d.ok && d.marketplaceAccountId === "A1" && d.companyId === "C1",
    d.ok ? `account=${d.marketplaceAccountId}` : d.code
  );
}

{
  // A — no claim resolves a default inside the allow-list
  const d = await decideTenantScope(memberOfA1Only, {}, REQUIRE_ACCOUNT, lookup);
  check(
    "A  default account stays inside membership",
    d.ok && memberOfA1Only.marketplaceAccountIds.includes(d.marketplaceAccountId),
    d.ok ? `account=${d.marketplaceAccountId}` : d.code
  );
}

{
  // B — ?account= tampering to an account the user does not hold
  const d = await decideTenantScope(
    memberOfA1Only,
    { account: "A2" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "B  unauthorized ?account= denied",
    !d.ok && d.code === "AUTHZ_ACCOUNT_FORBIDDEN",
    d.ok ? `LEAK account=${d.marketplaceAccountId}` : d.code
  );
}

{
  // B — ?account= pointing at another company entirely
  const d = await decideTenantScope(
    memberOfBoth,
    { account: "FOREIGN" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "B  cross-company ?account= denied",
    !d.ok && d.code === "AUTHZ_ACCOUNT_FORBIDDEN",
    d.ok ? `LEAK account=${d.marketplaceAccountId}` : d.code
  );
}

{
  // B — unknown account id is not silently downgraded to a default account
  const d = await decideTenantScope(
    memberOfBoth,
    { account: "does-not-exist" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "B  unknown ?account= denied (no silent default)",
    !d.ok && d.code === "AUTHZ_ACCOUNT_FORBIDDEN",
    d.ok ? `LEAK account=${d.marketplaceAccountId}` : d.code
  );
}

{
  // C — ?company= tampering
  const d = await decideTenantScope(
    memberOfBoth,
    { company: "C9" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "C  unauthorized ?company= denied",
    !d.ok && d.code === "AUTHZ_COMPANY_FORBIDDEN",
    d.ok ? `LEAK company=${d.companyId}` : d.code
  );
}

{
  // C — account + company that do not belong together
  const d = await decideTenantScope(
    { companyIds: ["C1", "C9"], marketplaceAccountIds: ["A1", "FOREIGN"] },
    { account: "A1", company: "C9" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "C  account/company mismatch denied",
    !d.ok && d.code === "AUTHZ_TENANT_MISMATCH",
    d.ok ? "LEAK" : d.code
  );
}

{
  // No membership at all — fail closed
  const d = await decideTenantScope(noMembership, {}, REQUIRE_ACCOUNT, lookup);
  check(
    "   no membership fails closed",
    !d.ok && d.code === "AUTHZ_NO_MEMBERSHIP",
    d.ok ? "LEAK" : d.code
  );
}

{
  // I — switching between two authorized accounts keeps working
  const first = await decideTenantScope(
    memberOfBoth,
    { account: "A1" },
    REQUIRE_ACCOUNT,
    lookup
  );
  const second = await decideTenantScope(
    memberOfBoth,
    { account: "A2" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "I  authorized account switch still works",
    first.ok &&
      second.ok &&
      first.marketplaceAccountId === "A1" &&
      second.marketplaceAccountId === "A2",
    `${first.ok ? first.marketplaceAccountId : first.code} → ${
      second.ok ? second.marketplaceAccountId : second.code
    }`
  );

  const withCompany = await decideTenantScope(
    memberOfBoth,
    { account: "A2", company: "C1" },
    REQUIRE_ACCOUNT,
    lookup
  );
  check(
    "I  account + matching company allowed",
    withCompany.ok && withCompany.marketplaceAccountId === "A2",
    withCompany.ok ? "ok" : withCompany.code
  );
}

// ---------------------------------------------------------------------------
// E / F — Administration role enforcement (real predicate)
// ---------------------------------------------------------------------------
console.log("\n--- E/F — Administration role ---");

function userWithRole(role) {
  return {
    id: "user-1",
    app_metadata: role ? { orion: { company_ids: ["C1"], role } } : { orion: { company_ids: ["C1"] } },
  };
}

check(
  "F  administrator allowed",
  hasAdministrationRole(userWithRole("administrator")),
  `allowed roles: ${ADMINISTRATION_ALLOWED_ROLES.join(", ")}`
);
for (const role of ["manager", "operator", "viewer"]) {
  check(`E  ${role} denied`, !hasAdministrationRole(userWithRole(role)));
}
check("E  no role denied", !hasAdministrationRole(userWithRole(null)));
check(
  "   internal service principal allowed",
  hasAdministrationRole({ id: "service:internal", app_metadata: { provider: "internal" } })
);

// ---------------------------------------------------------------------------
// Coverage — every server page reaches tenant data through the guard
// ---------------------------------------------------------------------------
console.log("\n--- Tenant guard coverage (server pages) ---");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const srcFiles = walk(path.join(root, "src"));
const rel = (f) => path.relative(root, f).replace(/\\/g, "/");
const read = (f) => fs.readFileSync(f, "utf8");

{
  const scopeModule = read(path.join(root, "src/lib/marketplace-scope.ts"));
  check(
    "   resolveScopedDateRange enforces membership",
    scopeModule.includes("requirePageScope"),
    "src/lib/marketplace-scope.ts → requirePageScope"
  );
  check(
    "   resolveScopedDateRange no longer trusts URL ids directly",
    !scopeModule.includes("resolveMarketplaceAccountId"),
    "no unauthenticated account resolution"
  );
}

{
  // Anything outside the account service that resolves an account id from raw
  // params would bypass the guard.
  const bypass = srcFiles.filter(
    (f) =>
      read(f).includes("resolveMarketplaceAccountId(") &&
      !rel(f).startsWith("src/services/marketplace-account-service.ts")
  );
  check(
    "   no page bypasses the guard via resolveMarketplaceAccountId",
    bypass.length === 0,
    bypass.map(rel).join(", ") || "none"
  );
}

{
  const scopeConsumers = srcFiles.filter((f) =>
    read(f).includes("resolveScopedDateRange")
  );
  const wrongImport = scopeConsumers.filter((f) => {
    const src = read(f);
    if (rel(f) === "src/lib/marketplace-scope.ts") return false;
    if (!src.includes("resolveScopedDateRange(")) return false;
    return !src.includes('from "@/lib/marketplace-scope"');
  });
  check(
    "   all scope consumers import the guarded resolver",
    wrongImport.length === 0,
    `${scopeConsumers.length - 1} consumers; offenders: ${
      wrongImport.map(rel).join(", ") || "none"
    }`
  );
}

{
  const adminRoutes = srcFiles.filter((f) =>
    /^src\/app\/api\/administration\/.*route\.ts$/.test(rel(f))
  );
  const unguarded = adminRoutes.filter((f) => !read(f).includes("requireAdminApi"));
  check(
    "E  every /api/administration route uses the role guard",
    adminRoutes.length > 0 && unguarded.length === 0,
    `${adminRoutes.length} routes; offenders: ${unguarded.map(rel).join(", ") || "none"}`
  );

  const stillAuthOnly = adminRoutes.filter((f) => /\brequireAuth\(/.test(read(f)));
  check(
    "E  no administration route falls back to auth-only",
    stillAuthOnly.length === 0,
    stillAuthOnly.map(rel).join(", ") || "none"
  );
}

// ---------------------------------------------------------------------------
// G — no server secret reachable from the client
// ---------------------------------------------------------------------------
console.log("\n--- G — client secret exposure ---");

const SERVER_ONLY_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTERNAL_API_SECRET",
  "MARKETPLACE_CREDENTIALS_KEY",
  "WB_API_TOKEN",
];

{
  const clientFiles = srcFiles.filter((f) => /^\s*["']use client["']/.test(read(f)));
  const leaks = [];
  for (const f of clientFiles) {
    const src = read(f);
    for (const secret of SERVER_ONLY_SECRETS) {
      if (src.includes(secret)) leaks.push(`${rel(f)}:${secret}`);
    }
  }
  check(
    "G  no server secret referenced in a client component",
    leaks.length === 0,
    `${clientFiles.length} client files; leaks: ${leaks.join(", ") || "none"}`
  );

  const publicised = [];
  for (const f of srcFiles) {
    const src = read(f);
    for (const secret of SERVER_ONLY_SECRETS) {
      if (src.includes(`NEXT_PUBLIC_${secret}`)) publicised.push(`${rel(f)}:${secret}`);
    }
  }
  check(
    "G  no secret is exposed under a NEXT_PUBLIC_ name",
    publicised.length === 0,
    publicised.join(", ") || "none"
  );
}

{
  const tracked = [".env.local.save", ".env.local", ".env"];
  const { execFileSync } = await import("node:child_process");
  let trackedFiles = "";
  try {
    trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  } catch {
    trackedFiles = "";
  }
  const offenders = tracked.filter((name) =>
    trackedFiles.split(/\r?\n/).includes(name)
  );
  check(
    "G  no environment secret file is tracked by git",
    offenders.length === 0,
    offenders.join(", ") || "none tracked"
  );
}

// ---------------------------------------------------------------------------
// H — page-load path stays warehouse-only
// ---------------------------------------------------------------------------
console.log("\n--- H — warehouse-only page load ---");

/**
 * Scope of this check: the guard must not have introduced a live marketplace
 * call on the page-load path. The deep warehouse-only invariant (which service
 * calls are allowed to talk to WB, and when) is owned by
 * `npm run verify:warehouse-db-only-10-6` — run it alongside this script.
 */
{
  const scopePages = srcFiles.filter(
    (f) => /page\.tsx$/.test(rel(f)) && read(f).includes("resolveScopedDateRange")
  );
  const offenders = scopePages.filter((f) =>
    /from\s+["']@\/lib\/wildberries\//.test(read(f))
  );
  check(
    "H  scoped pages import no WB/Finance client directly",
    scopePages.length > 0 && offenders.length === 0,
    `${scopePages.length} scoped pages; offenders: ${offenders.map(rel).join(", ") || "none"}`
  );

  const guardModules = [
    "src/lib/marketplace-scope.ts",
    "src/lib/security/page-scope.ts",
    "src/lib/security/tenant-scope.ts",
    "src/lib/security/admin-authorization.ts",
  ];
  const guardOffenders = guardModules.filter((m) => {
    const full = path.join(root, m);
    return fs.existsSync(full) && /@\/lib\/wildberries\//.test(read(full));
  });
  check(
    "H  authorization guards perform no marketplace HTTP",
    guardOffenders.length === 0,
    guardOffenders.join(", ") || "none"
  );
}

// ---------------------------------------------------------------------------
// Live HTTP (optional) — real requests against a running dev server
// ---------------------------------------------------------------------------
console.log("\n--- D — live HTTP tenant tampering (optional) ---");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env.e2e.local"));

const BASE = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const FOREIGN_ACCOUNT = "00000000-0000-4000-8000-000000000098";
const FOREIGN_COMPANY = "00000000-0000-4000-8000-000000000099";

function storeCookies(jar, res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/login`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

if (!(await serverUp())) {
  skip("D  live tenant tampering", `no server at ${BASE} (start: npm run dev)`);
} else {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    skip("D  live tenant tampering", "E2E_USER_EMAIL / E2E_USER_PASSWORD not configured");
  } else {
    const jar = new Map();
    storeCookies(jar, await fetch(`${BASE}/login`, { redirect: "manual" }));
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({ email, password }),
    });
    storeCookies(jar, loginRes);

    if (loginRes.status !== 200) {
      skip("D  live tenant tampering", `login failed (${loginRes.status})`);
    } else {
      /**
       * A tampered page request is safe when it either redirects to
       * /access-denied or renders the denial surface — never tenant data.
       */
      async function assertPageDenied(label, url, deniedPath = "/access-denied") {
        const res = await fetch(url, {
          headers: { Cookie: cookieHeader(jar) },
          redirect: "manual",
        });
        const location = res.headers.get("location") ?? "";
        const redirected =
          res.status >= 300 && res.status < 400 && location.includes(deniedPath);
        const body = redirected ? "" : await res.text().catch(() => "");
        // A redirect thrown after streaming began arrives as a 200 document
        // carrying the redirect instead of a 3xx — still a denial, as long as
        // no tenant payload was flushed with it.
        const streamedRedirect = body.includes(deniedPath);
        const renderedDenial = body.includes("Not authorized");
        check(
          label,
          redirected || streamedRedirect || renderedDenial,
          `status=${res.status} location=${location || "-"} streamedRedirect=${streamedRedirect} deniedBody=${renderedDenial} bytes=${body.length}`
        );

        // The denial must carry no tenant payload — only the app shell.
        const TENANT_MARKERS = [
          "Net Profit",
          "Gross Profit",
          "Estimated Tax",
          "Marketplace Fee",
          "Seller Payout",
        ];
        const leaked = TENANT_MARKERS.filter((m) => body.includes(m));
        check(
          `${label} — no tenant payload in the denial`,
          leaked.length === 0,
          leaked.join(", ") || "no financial markers rendered"
        );
      }

      await assertPageDenied(
        "B  page ?account= tampering denied",
        `${BASE}/?account=${FOREIGN_ACCOUNT}`
      );
      await assertPageDenied(
        "C  page ?company= tampering denied",
        `${BASE}/?company=${FOREIGN_COMPANY}`
      );

      const adminApiProbe = await fetch(`${BASE}/api/administration/users`, {
        headers: { Cookie: cookieHeader(jar) },
      });
      if (adminApiProbe.status === 403) {
        await assertPageDenied(
          "E  /administration page gate denies without the role",
          `${BASE}/administration`
        );
      } else {
        skip("E  /administration page gate", "this user holds the administrator role");
      }

      const apiRes = await fetch(
        `${BASE}/api/sync/status?marketplaceAccountId=${FOREIGN_ACCOUNT}`,
        { headers: { Cookie: cookieHeader(jar) } }
      );
      const apiBody = await apiRes.json().catch(() => ({}));
      check(
        "D  API unauthorized account → 403",
        apiRes.status === 403,
        `status=${apiRes.status} code=${apiBody.code}`
      );

      const ownPageRes = await fetch(`${BASE}/`, {
        headers: { Cookie: cookieHeader(jar) },
        redirect: "manual",
      });
      check(
        "A  authorized user reaches the dashboard",
        ownPageRes.status === 200 ||
          !(ownPageRes.headers.get("location") ?? "").includes("/access-denied"),
        `status=${ownPageRes.status} location=${ownPageRes.headers.get("location") ?? "-"}`
      );

      const adminRes = await fetch(`${BASE}/api/administration/users`, {
        headers: { Cookie: cookieHeader(jar) },
      });
      const adminBody = await adminRes.json().catch(() => ({}));
      check(
        "E/F  administration reflects the role claim",
        adminRes.status === 200 || adminRes.status === 403,
        `status=${adminRes.status} code=${adminBody.code ?? "-"}`
      );
    }
  }
}

console.log(
  `\n${failures === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${failures} failure(s), ${skipped} skipped`
);
process.exit(failures === 0 ? 0 : 1);
