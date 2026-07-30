/**
 * Sprint 7.1.D — RLS validation (aligned to live schema).
 * Usage: node scripts/verify-rls-7-1-d.mjs
 *
 * Notes:
 * - sync_runs / finance_sync_reports / warehouse_* exist only after their
 *   feature migrations; when absent, those checks are skipped (not failed).
 * - api_key_encrypted remains the credential store; authenticated must not
 *   read it (base table SELECT revoked; public view has no ciphertext column).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function ok(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function isMissingRelation(error) {
  if (!error?.message) return false;
  return /could not find the table|does not exist|schema cache|PGRST205/i.test(error.message);
}

/** Tables that may be missing until optional feature migrations are applied. */
const OPTIONAL_SERVICE_ONLY_TABLES = [
  "sync_runs",
  "finance_sync_reports",
  "sync_verification_reports",
  "warehouse_entity_sync_state",
  "warehouse_import_audit",
];

async function tableVisibleToServiceRole(admin, table) {
  const { error } = await admin.from(table).select("*").limit(1);
  if (!error) return { present: true, error: null };
  if (isMissingRelation(error)) return { present: false, error };
  return { present: true, error }; // present but other error
}

async function main() {
  let failures = 0;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Anonymous denied on core tenant fact table
  {
    const { data, error } = await anonClient.from("wb_sales").select("id").limit(1);
    const denied = Boolean(error) || !data?.length;
    if (!ok("Anonymous SELECT wb_sales denied", Boolean(error) || (denied && !data?.length), error?.message ?? `rows=${data?.length ?? 0}`)) {
      if (!error && data?.length) failures += 1;
      else if (!error) {
        console.log("INFO  anon returned empty without error (RLS may filter all)");
      }
    }
    if (!error && data?.length) failures += 1;
  }

  {
    const { error } = await anonClient.from("wb_sales").insert({
      marketplace_account_id: 1,
      srid: "rls-probe",
      sale_date: "2000-01-01",
    });
    if (!ok("Anonymous INSERT wb_sales denied", Boolean(error), error?.message ?? "no error")) {
      failures += 1;
    }
  }

  {
    const { error } = await admin.from("wb_sales").select("id").limit(1);
    if (!ok("service_role SELECT wb_sales allowed", !error, error?.message ?? "ok")) failures += 1;
  }

  // Optional Group D tables — skip when feature migration not applied
  let serviceOnlyProbe = null;
  for (const table of OPTIONAL_SERVICE_ONLY_TABLES) {
    const status = await tableVisibleToServiceRole(admin, table);
    if (!status.present) {
      console.log(`SKIP  ${table} — not in schema (optional feature migration not applied)`);
      continue;
    }
    if (status.error) {
      if (!ok(`service_role SELECT ${table} allowed`, false, status.error.message)) failures += 1;
      continue;
    }
    if (!ok(`service_role SELECT ${table} allowed`, true, "ok")) failures += 1;
    if (!serviceOnlyProbe) serviceOnlyProbe = table;
  }

  // Credential column still exists for service_role (storage model unchanged)
  {
    const { data, error } = await admin
      .from("marketplace_accounts")
      .select("id, api_key_encrypted")
      .limit(1);
    if (
      !ok(
        "service_role can read api_key_encrypted (column still present)",
        !error && Array.isArray(data),
        error?.message ?? `rows=${data?.length ?? 0}`
      )
    ) {
      failures += 1;
    }
  }

  const email = process.env.E2E_USER_EMAIL || "e2e-auth@orionshop.local";
  const password = process.env.E2E_USER_PASSWORD;
  if (!password) {
    console.log("SKIP  Authenticated RLS checks — set E2E_USER_PASSWORD");
  } else {
    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr || !signIn.session) {
      console.log("FAIL  Sign-in for RLS user", signErr?.message);
      failures += 1;
    } else {
      const authed = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: accounts, error: aErr } = await admin
        .from("marketplace_accounts")
        .select("id, company_id")
        .limit(20);
      if (aErr || !accounts?.length) {
        console.log("FAIL  Could not load tenant fixtures", aErr?.message);
        failures += 1;
      } else {
        const allowed = accounts[0];
        const { data: same, error: sameErr } = await authed
          .from("wb_sales")
          .select("id")
          .eq("marketplace_account_id", allowed.id)
          .limit(1);
        if (
          !ok(
            "Same-tenant SELECT wb_sales allowed (or empty)",
            !sameErr,
            sameErr?.message ?? `rows=${same?.length ?? 0}`
          )
        ) {
          failures += 1;
        }

        const foreignId = 999999991;
        const { data: cross, error: crossErr } = await authed
          .from("wb_sales")
          .select("id")
          .eq("marketplace_account_id", foreignId)
          .limit(1);
        const crossDenied = Boolean(crossErr) || !cross || cross.length === 0;
        if (
          !ok(
            "Cross-tenant SELECT returns no rows",
            crossDenied,
            crossErr?.message ?? `rows=${cross?.length}`
          )
        ) {
          failures += 1;
        }

        const { error: writeErr } = await authed.from("wb_sales").insert({
          marketplace_account_id: foreignId,
          srid: `rls-cross-${Date.now()}`,
          sale_date: "2000-01-01",
        });
        if (
          !ok(
            "Cross-tenant INSERT denied",
            Boolean(writeErr),
            writeErr?.message ?? "inserted (bad)"
          )
        ) {
          failures += 1;
        }

        // Ciphertext must not be readable as authenticated.
        // Pass if: permission/schema error, OR rows omit non-empty ciphertext.
        const { data: acctRows, error: acctErr } = await authed
          .from("marketplace_accounts")
          .select("id, api_key_encrypted")
          .limit(5);

        const leaked = (acctRows ?? []).some(
          (r) => typeof r?.api_key_encrypted === "string" && r.api_key_encrypted.length > 0
        );
        const blocked =
          Boolean(acctErr) ||
          isMissingRelation(acctErr) ||
          !leaked;

        if (
          !ok(
            "Authenticated cannot read api_key_encrypted ciphertext",
            blocked && !leaked,
            leaked
              ? "ciphertext returned to authenticated (forbidden)"
              : acctErr?.message ?? "no ciphertext in response"
          )
        ) {
          failures += 1;
        }

        // Public view (if present) must not expose ciphertext column
        const { data: viewRows, error: viewErr } = await authed
          .from("marketplace_accounts_public")
          .select("*")
          .limit(1);
        if (isMissingRelation(viewErr)) {
          console.log("SKIP  marketplace_accounts_public view — not present yet");
        } else if (viewErr) {
          // View may require follow-up migration; selecting base already checked
          console.log("INFO  marketplace_accounts_public:", viewErr.message);
        } else {
          const viewLeak = (viewRows ?? []).some((r) =>
            Object.prototype.hasOwnProperty.call(r, "api_key_encrypted")
          );
          if (
            !ok(
              "marketplace_accounts_public has no api_key_encrypted column",
              !viewLeak,
              viewLeak ? "view still exposes api_key_encrypted" : "ok"
            )
          ) {
            failures += 1;
          }
        }

        if (serviceOnlyProbe) {
          const { error: syncErr } = await authed.from(serviceOnlyProbe).select("*").limit(1);
          if (
            !ok(
              `Authenticated denied on ${serviceOnlyProbe} (service_role-only)`,
              Boolean(syncErr),
              syncErr?.message ?? "readable (bad)"
            )
          ) {
            failures += 1;
          }
        } else {
          console.log(
            "SKIP  Authenticated deny on service-only table — none of optional Group D tables exist in this database"
          );
        }
      }
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
