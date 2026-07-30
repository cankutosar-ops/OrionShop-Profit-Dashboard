/**
 * Create / reset an administrator Auth user and grant all companies.
 * Usage: node scripts/create-admin-user.mjs --email someone@example.com
 * Prints a one-time temporary password to stdout (not written to disk).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
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

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const email = (arg("--email") || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/create-admin-user.mjs --email you@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || serviceKey === "your-service-role-key") {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const tempPassword = `${crypto.randomBytes(18).toString("base64url")}!A1`;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listError) throw listError;

let user = listed?.users?.find((u) => u.email?.toLowerCase() === email);
let created = false;

if (user) {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: tempPassword,
    email_confirm: true,
  });
  if (error) throw error;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
  created = true;
}

const { data: companies, error: companyError } = await admin.from("companies").select("id");
if (companyError) throw companyError;
const companyIds = (companies ?? []).map((c) => String(c.id));

const prev = user.app_metadata ?? {};
const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: {
    ...prev,
    orion: {
      company_ids: companyIds,
      role: "administrator",
    },
  },
});
if (metaError) throw metaError;

console.log("");
console.log(created ? "Created administrator account." : "Updated existing account (password reset + grants).");
console.log(`Email:     ${email}`);
console.log(`User ID:   ${user.id}`);
console.log(`Companies: ${companyIds.length ? companyIds.join(", ") : "(none found)"}`);
console.log("");
console.log("Temporary password (copy now — not saved to any file):");
console.log(tempPassword);
console.log("");
console.log("Sign in at /login, then change this password in Supabase Dashboard → Authentication → Users");
console.log("or via a password-reset email if you enable that flow later.");
