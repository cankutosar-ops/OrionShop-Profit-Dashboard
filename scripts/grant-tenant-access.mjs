/**
 * Grant all companies (or listed IDs) to a Supabase Auth user via app_metadata.orion.
 * Usage:
 *   node scripts/grant-tenant-access.mjs --email e2e-auth@orionshop.local
 *   node scripts/grant-tenant-access.mjs --email user@x.com --company-ids id1,id2
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

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const email = (arg("--email") || process.env.E2E_USER_EMAIL || "").trim();
const companyIdsArg = arg("--company-ids");

if (!email) {
  console.error("Usage: node scripts/grant-tenant-access.mjs --email user@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listError) throw listError;
const user = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

let companyIds = companyIdsArg
  ? companyIdsArg.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

if (companyIds.length === 0) {
  const { data: companies, error } = await admin.from("companies").select("id");
  if (error) throw error;
  companyIds = (companies ?? []).map((c) => String(c.id));
}

const prev = user.app_metadata ?? {};
const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: {
    ...prev,
    orion: {
      company_ids: companyIds,
    },
  },
});
if (updateError) throw updateError;

console.log(`Granted ${companyIds.length} company(ies) to ${email} (${user.id})`);
console.log(companyIds.join(", ") || "(none)");
