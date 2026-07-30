/**
 * Sprint 7.1.B — Authentication smoke validation (API-level).
 * Requires a running app (default http://localhost:3000).
 *
 * Usage: node scripts/verify-auth-7-1-b.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
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
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function ensureE2EUser() {
  let email = process.env.E2E_USER_EMAIL?.trim();
  let password = process.env.E2E_USER_PASSWORD ?? "";
  if (email && password) return { email, password, provisioned: false };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || serviceKey === "your-service-role-key") {
    return null;
  }

  email = email || "e2e-auth@orionshop.local";
  password = password || `E2eAuth!${Date.now().toString(36)}`;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    // Password may be unknown — update it for this verification run.
    await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to provision e2e user: ${error.message}`);
  }

  process.env.E2E_USER_EMAIL = email;
  process.env.E2E_USER_PASSWORD = password;
  console.log(`INFO  Provisioned E2E auth user ${email} (ephemeral password for this run)`);
  return { email, password, provisioned: true };
}

async function main() {
  let failures = 0;

  {
    const res = await fetch(`${BASE}/api/companies`, { redirect: "manual" });
    const body = await res.json().catch(() => ({}));
    if (!ok("API without session returns 401", res.status === 401, `status=${res.status} code=${body.code}`)) {
      failures += 1;
    }
    if (
      !ok(
        "401 code is CONTAINMENT_GATE or AUTH_REQUIRED",
        ["CONTAINMENT_GATE", "AUTH_REQUIRED"].includes(body.code),
        `code=${body.code}`
      )
    ) {
      failures += 1;
    }
  }

  {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (!ok("GET /login is reachable", res.status === 200, `status=${res.status}`)) failures += 1;
  }

  {
    const res = await fetch(`${BASE}/`, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    const redirected =
      (res.status === 307 || res.status === 302 || res.status === 303) && loc.includes("/login");
    if (!ok("GET / redirects to /login when anonymous", redirected, `status=${res.status} loc=${loc}`)) {
      failures += 1;
    }
  }

  {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-xyz" }),
    });
    if (!ok("Invalid login returns 401", res.status === 401, `status=${res.status}`)) failures += 1;
  }

  let creds = null;
  try {
    creds = await ensureE2EUser();
  } catch (err) {
    console.log(`FAIL  Provision E2E user — ${err instanceof Error ? err.message : err}`);
    failures += 1;
  }

  if (creds) {
    const jar = new Map();
    function storeCookies(res) {
      const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      for (const c of raw) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    }
    function cookieHeader() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }

    {
      const res = await fetch(`${BASE}/login`);
      storeCookies(res);
    }

    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(),
      },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    storeCookies(loginRes);
    const loginBody = await loginRes.json().catch(() => ({}));
    if (
      !ok(
        "Valid login succeeds",
        loginRes.status === 200 && loginBody.authenticated === true,
        `status=${loginRes.status} body=${JSON.stringify(loginBody).slice(0, 120)}`
      )
    ) {
      failures += 1;
    }

    const sessionRes = await fetch(`${BASE}/api/auth/session`, {
      headers: { Cookie: cookieHeader() },
    });
    storeCookies(sessionRes);
    const sessionBody = await sessionRes.json().catch(() => ({}));
    if (
      !ok(
        "Session endpoint authenticated",
        sessionRes.status === 200 && sessionBody.authenticated === true,
        `status=${sessionRes.status}`
      )
    ) {
      failures += 1;
    }

    const companiesRes = await fetch(`${BASE}/api/companies`, {
      headers: { Cookie: cookieHeader() },
    });
    if (!ok("Protected API works with session cookies", companiesRes.status === 200, `status=${companiesRes.status}`)) {
      failures += 1;
    }

    const logoutRes = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookieHeader(), Accept: "application/json" },
      redirect: "manual",
    });
    storeCookies(logoutRes);
    if (
      !ok(
        "Logout accepted",
        logoutRes.status === 200 || logoutRes.status === 303 || logoutRes.status === 302,
        `status=${logoutRes.status}`
      )
    ) {
      failures += 1;
    }

    const afterRes = await fetch(`${BASE}/api/auth/session`, {
      headers: { Cookie: cookieHeader() },
    });
    if (!ok("Session invalid after logout", afterRes.status === 401, `status=${afterRes.status}`)) {
      failures += 1;
    }
  } else {
    console.log("SKIP  Valid login/session/logout — missing Supabase admin credentials");
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
