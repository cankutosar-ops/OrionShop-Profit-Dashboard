/**
 * Sprint 7.1.C — Authorization validation (API-level).
 * Usage: node scripts/verify-authz-7-1-c.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

function ok(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function storeCookies(jar, res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email, password) {
  const jar = new Map();
  const loginPage = await fetch(`${BASE}/login`);
  storeCookies(jar, loginPage);
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
  const body = await loginRes.json().catch(() => ({}));
  if (loginRes.status !== 200 || !body.authenticated) {
    throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(body)}`);
  }
  return jar;
}

async function main() {
  let failures = 0;

  // Preserve 7.1.A / 7.1.B baselines
  {
    const res = await fetch(`${BASE}/api/companies`, { redirect: "manual" });
    const body = await res.json().catch(() => ({}));
    if (!ok("Anonymous API still 401", res.status === 401, `code=${body.code}`)) failures += 1;
    if (
      !ok(
        "Anonymous code containment or auth",
        ["CONTAINMENT_GATE", "AUTH_REQUIRED"].includes(body.code),
        `code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  // Ensure e2e user + tenant grants
  spawnSync("node", ["scripts/provision-e2e-auth-user.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  spawnSync(
    "node",
    ["scripts/grant-tenant-access.mjs", "--email", process.env.E2E_USER_EMAIL || "e2e-auth@orionshop.local"],
    { cwd: root, stdio: "inherit" }
  );

  loadEnvFile(path.join(root, ".env.e2e.local"));
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    console.log("FAIL  Missing E2E credentials after provision");
    process.exit(1);
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: companies } = await admin.from("companies").select("id").limit(5);
  const { data: accounts } = await admin
    .from("marketplace_accounts")
    .select("id, company_id")
    .limit(20);

  if (!companies?.length || !accounts?.length) {
    console.log("FAIL  No companies/accounts in database to authorize against");
    process.exit(1);
  }

  const allowedCompany = String(companies[0].id);
  const allowedAccount =
    accounts.find((a) => String(a.company_id) === allowedCompany) ?? accounts[0];
  const allowedAccountId = String(allowedAccount.id);

  // Fake foreign IDs (valid UUID shape, not in allow-list)
  const foreignCompany = "00000000-0000-4000-8000-000000000099";
  const foreignAccount = "00000000-0000-4000-8000-000000000098";

  const jar = await login(email, password);

  // Valid tenant
  {
    const res = await fetch(`${BASE}/api/companies`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    const body = await res.json().catch(() => ({}));
    if (!ok("Valid membership lists companies", res.status === 200, `status=${res.status}`)) {
      failures += 1;
    } else {
      const ids = (body.companies ?? []).map((c) => String(c.id));
      const granted = new Set((companies ?? []).map((c) => String(c.id)));
      if (!ok("Listed companies ⊆ granted set", ids.every((id) => granted.has(id)), `ids=${ids.join(",")}`)) {
        failures += 1;
      }
      if (!ok("Companies list non-empty for granted user", ids.length > 0)) {
        failures += 1;
      }
    }
  }

  {
    const res = await fetch(
      `${BASE}/api/sync/status?marketplaceAccountId=${encodeURIComponent(allowedAccountId)}`,
      { headers: { Cookie: cookieHeader(jar) } }
    );
    if (!ok("Valid marketplace account allowed", res.status === 200, `status=${res.status}`)) {
      failures += 1;
    }
  }

  // Invalid / foreign company
  {
    const res = await fetch(`${BASE}/api/companies/${foreignCompany}`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    const body = await res.json().catch(() => ({}));
    if (!ok("Foreign company → 403", res.status === 403, `status=${res.status} code=${body.code}`)) {
      failures += 1;
    }
  }

  // Foreign marketplace account
  {
    const res = await fetch(
      `${BASE}/api/sync/status?marketplaceAccountId=${encodeURIComponent(foreignAccount)}`,
      { headers: { Cookie: cookieHeader(jar) } }
    );
    const body = await res.json().catch(() => ({}));
    if (
      !ok(
        "Foreign marketplace account → 403",
        res.status === 403,
        `status=${res.status} code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  // Body spoof: sync with foreign account
  {
    const res = await fetch(`${BASE}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({
        marketplaceAccountId: foreignAccount,
        dateFrom: "2026-01-01",
        dateTo: "2026-01-02",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (
      !ok(
        "Body marketplaceAccountId spoof → 403",
        res.status === 403,
        `status=${res.status} code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  // Tenant mismatch: allowed account + foreign company query
  {
    const res = await fetch(
      `${BASE}/api/brands?account=${encodeURIComponent(allowedAccountId)}&company=${encodeURIComponent(foreignCompany)}`,
      { headers: { Cookie: cookieHeader(jar) } }
    );
    const body = await res.json().catch(() => ({}));
    if (
      !ok(
        "Account+foreign company mismatch → 403",
        res.status === 403,
        `status=${res.status} code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  // allAccounts forbidden for end user
  {
    const res = await fetch(`${BASE}/api/warehouse/inventory-daily-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({ allAccounts: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (
      !ok(
        "allAccounts without internal Bearer → 403",
        res.status === 403,
        `status=${res.status} code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  // User with empty membership
  {
    const emptyEmail = "e2e-authz-empty@orionshop.local";
    const emptyPassword = "OrionE2eAuthzEmpty!7.1.C";
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let emptyUser = listed?.users?.find((u) => u.email?.toLowerCase() === emptyEmail);
    if (!emptyUser) {
      const created = await admin.auth.admin.createUser({
        email: emptyEmail,
        password: emptyPassword,
        email_confirm: true,
        app_metadata: { orion: { company_ids: [] } },
      });
      emptyUser = created.data.user;
    } else {
      await admin.auth.admin.updateUserById(emptyUser.id, {
        password: emptyPassword,
        app_metadata: { ...(emptyUser.app_metadata ?? {}), orion: { company_ids: [] } },
      });
    }

    const emptyJar = await login(emptyEmail, emptyPassword);
    const res = await fetch(`${BASE}/api/companies`, {
      headers: { Cookie: cookieHeader(emptyJar) },
    });
    const body = await res.json().catch(() => ({}));
    if (
      !ok(
        "Empty membership → 403 AUTHZ_NO_MEMBERSHIP",
        res.status === 403 && body.code === "AUTHZ_NO_MEMBERSHIP",
        `status=${res.status} code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`RESULT: FAIL (${failures} checks)`);
    process.exit(1);
  }
  console.log("RESULT: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
