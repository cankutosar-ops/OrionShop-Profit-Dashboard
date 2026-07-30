/**
 * Provision a stable E2E auth user and write .env.e2e.local (gitignored via .env*).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
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

const email = process.env.E2E_USER_EMAIL?.trim() || "e2e-auth@orionshop.local";
const password = process.env.E2E_USER_PASSWORD || "OrionE2eAuth!7.1.B";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log("updated", existing.id);
} else {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log("created", created.user?.id);
}

const out = path.join(root, ".env.e2e.local");
fs.writeFileSync(
  out,
  [
    "# Local e2e auth — do not commit",
    `E2E_USER_EMAIL=${email}`,
    `E2E_USER_PASSWORD=${password}`,
    "E2E_SKIP_WEBSERVER=1",
    "",
  ].join("\n")
);
console.log("wrote", out);

// Sprint 7.1.C — grant all companies so smoke/contracts keep working.
const grant = spawnSync(
  process.execPath,
  [path.join(root, "scripts/grant-tenant-access.mjs"), "--email", email],
  { cwd: root, stdio: "inherit" }
);
if (grant.status !== 0) {
  console.warn("grant-tenant-access exited", grant.status);
}
