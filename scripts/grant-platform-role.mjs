/**
 * Set the platform role on a Supabase Auth user (app_metadata.orion.role).
 *
 * Administration (`/administration` + `/api/administration/*`) requires the
 * `administrator` role. Roles can normally be assigned from Administration → Users,
 * but the first administrator has to be bootstrapped here.
 *
 * Usage:
 *   node scripts/grant-platform-role.mjs --email user@example.com --role administrator
 *   node scripts/grant-platform-role.mjs --email user@example.com --role viewer
 *
 * Writes only Supabase Auth user metadata. Never prints secrets or tokens.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORM_ROLES = ["administrator", "manager", "operator", "viewer"];

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

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const email = (arg("--email") || "").trim().toLowerCase();
const role = (arg("--role") || "administrator").trim().toLowerCase();

if (!email) {
  console.error(
    "Usage: node scripts/grant-platform-role.mjs --email user@example.com --role administrator"
  );
  process.exit(1);
}
if (!PLATFORM_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Expected one of: ${PLATFORM_ROLES.join(", ")}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const match = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === target
    );
    if (match) return match;
    if (!data?.users?.length || data.users.length < 200) return null;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`No Supabase Auth user found for ${email}`);
  process.exit(1);
}

const appMetadata = user.app_metadata ?? {};
const orion = { ...(appMetadata.orion ?? appMetadata.tenant ?? {}) };
orion.role = role;

const { error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...appMetadata, orion },
});
if (error) {
  console.error(`Failed to set role: ${error.message}`);
  process.exit(1);
}

const companyIds = Array.isArray(orion.company_ids) ? orion.company_ids.length : 0;
console.log(`OK  ${email} → role=${role} (company memberships: ${companyIds})`);
if (companyIds === 0) {
  console.log(
    "NOTE  This user still has no company membership. Run: node scripts/grant-tenant-access.mjs --email " +
      email
  );
}
console.log("NOTE  The user must sign out and back in for the new claim to reach their JWT.");
