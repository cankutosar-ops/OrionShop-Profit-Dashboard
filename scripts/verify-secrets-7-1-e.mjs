/**
 * Sprint 7.1.E — Secrets & credential hardening audit.
 *
 * Static checks (no live DB required). Optional: scan .next after production build.
 *
 * Usage: node scripts/verify-secrets-7-1-e.mjs
 *        node scripts/verify-secrets-7-1-e.mjs --with-build-scan
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const withBuildScan = process.argv.includes("--with-build-scan");

let failures = 0;
let warnings = 0;

function ok(label, pass, detail = "") {
  const mark = pass ? "PASS" : "FAIL";
  if (!pass) failures += 1;
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function warn(label, detail = "") {
  warnings += 1;
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ""}`);
}

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

function walk(dir, out = [], { skip = [] } = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (skip.includes(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out, { skip });
    else out.push(full);
  }
  return out;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".next-dev",
  ".git",
  "playwright-report",
  "test-results",
  "coverage",
  ".perf",
  "dist",
  "out",
]);

function listSourceFiles() {
  const files = [];
  function rec(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) rec(full);
      else if (/\.(ts|tsx|js|mjs|cjs|json|md|sql|yml|yaml|env\.example|env\.e2e\.example)$/i.test(name)) {
        files.push(full);
      }
    }
  }
  rec(root);
  return files;
}

console.log("=== Sprint 7.1.E — Secrets audit ===\n");

// --- 1. Hardcoded JWT / key material in source ---
{
  const jwtRe = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
  const privateKeyRe = /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/;
  const offenders = [];
  for (const file of listSourceFiles()) {
    const rel = path.relative(root, file);
    if (rel.startsWith("docs") && rel.includes("99-legacy")) continue;
    if (rel.includes("verify-secrets-7-1-e")) continue;
    const text = fs.readFileSync(file, "utf8");
    if (jwtRe.test(text) || privateKeyRe.test(text)) {
      offenders.push(rel);
    }
  }
  ok("No hardcoded JWTs / private keys in tracked source", offenders.length === 0, offenders.join(", ") || "clean");
}

// --- 2. .env.example must not contain real-looking secrets ---
{
  const examplePath = path.join(root, ".env.example");
  const text = fs.readFileSync(examplePath, "utf8");
  const bad = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!value) continue;
    if (/^eyJ[A-Za-z0-9_-]{20,}/.test(value)) bad.push(key);
    if (value.length > 80 && !/your-|changeme|example|placeholder/i.test(value)) bad.push(key);
  }
  ok(".env.example has no production-looking secret values", bad.length === 0, bad.join(", ") || "placeholders only");
}

// --- 3. .gitignore covers env / credentials ---
{
  const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  ok(".gitignore ignores .env.*", gi.includes(".env.*") || gi.includes(".env*.local"));
  ok(".gitignore ignores credentials.json", gi.includes("credentials.json"));
  ok(".gitignore keeps .env.example", gi.includes("!.env.example"));
}

// --- 4. Encryption requires dedicated key in production ---
{
  const enc = fs.readFileSync(path.join(root, "src/lib/credentials/encryption.ts"), "utf8");
  ok(
    "encryption.ts requires MARKETPLACE_CREDENTIALS_KEY in production",
    enc.includes("MARKETPLACE_CREDENTIALS_KEY") && enc.includes("isProductionRuntime")
  );
  ok(
    "encryption.ts has no silent empty-key encrypt path",
    !/deriveKey\(\)[\s\S]*return Buffer\.alloc\(32,\s*0\)/.test(enc)
  );
}

// --- 5. Internal API secret hardening ---
{
  const secrets = fs.readFileSync(path.join(root, "src/lib/security/secrets.ts"), "utf8");
  const gate = fs.readFileSync(path.join(root, "src/lib/security/containment-gate.ts"), "utf8");
  ok(
    "secrets.ts requires INTERNAL_API_SECRET in production",
    secrets.includes("INTERNAL_API_SECRET") && secrets.includes("isProductionRuntime")
  );
  ok("containment-gate uses resolveInternalApiSecret helpers", gate.includes("resolveInternalApiSecret") || gate.includes("tryResolveInternalApiSecret"));
}

// --- 6. Admin client never falls back to anon ---
{
  const admin = fs.readFileSync(path.join(root, "src/lib/supabase/admin.ts"), "utf8");
  ok(
    "admin client refuses anon fallback",
    admin.includes("SUPABASE_SERVICE_ROLE_KEY") && /Anon fallback is disabled|service_role/i.test(admin)
  );
}

// --- 7. Schema probe never uses anon ---
{
  const probe = fs.readFileSync(path.join(root, "src/lib/schema-compatibility-check.ts"), "utf8");
  ok(
    "schema probe uses service_role only (no anon fallback)",
    probe.includes("SUPABASE_SERVICE_ROLE_KEY") && !/ANON_KEY/.test(probe)
  );
}

// --- 8. Public account mapping never returns ciphertext ---
{
  const svc = fs.readFileSync(path.join(root, "src/services/marketplace-account-service.ts"), "utf8");
  const publicFn = svc.match(/function toPublicAccount[\s\S]*?^}/m)?.[0] ?? "";
  ok(
    "toPublicAccount exposes has_api_key, not ciphertext field",
    publicFn.includes("has_api_key") && !/api_key_encrypted\s*:/.test(publicFn.replace(/api_key_encrypted\?:\s*string/g, ""))
  );
  ok(
    "getMarketplaceAccountForSync omits ciphertext from cached object",
    svc.includes("delete safeRow.api_key_encrypted") || svc.includes("api_key_encrypted: _omitCiphertext")
  );
}

// --- 9. Client boundary: no service_role / encryption key in client components ---
{
  const clientFiles = walk(path.join(root, "src"), [], {
    skip: [...SKIP_DIRS],
  }).filter((f) => /\.(tsx|ts)$/.test(f));
  const dangerous = [];
  const patterns = [
    /SUPABASE_SERVICE_ROLE_KEY/,
    /MARKETPLACE_CREDENTIALS_KEY/,
    /INTERNAL_API_SECRET/,
    /decryptCredential/,
    /createAdminClient/,
  ];
  for (const file of clientFiles) {
    const text = fs.readFileSync(file, "utf8");
    const isClient =
      text.startsWith('"use client"') ||
      text.startsWith("'use client'") ||
      /["']use client["']/.test(text.slice(0, 200));
    if (!isClient) continue;
    for (const re of patterns) {
      if (re.test(text)) {
        dangerous.push(`${path.relative(root, file)} (${re})`);
      }
    }
  }
  ok("No private secrets/APIs in 'use client' modules", dangerous.length === 0, dangerous.join("; ") || "clean");
}

// --- 10. NEXT_PUBLIC_* inventory (must be non-secret) ---
{
  const allowedPublic = new Set([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_APP_LOCALE",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_PERF_AUDIT",
  ]);
  const found = new Set();
  for (const file of listSourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
      found.add(m[0]);
    }
  }
  const unexpected = [...found].filter((k) => !allowedPublic.has(k));
  ok(
    "NEXT_PUBLIC_* set is allowlisted (no private keys)",
    unexpected.length === 0,
    unexpected.length ? unexpected.join(", ") : [...found].join(", ")
  );
}

// --- 11. Local env presence (informational) ---
{
  const hasCredKey = Boolean(process.env.MARKETPLACE_CREDENTIALS_KEY?.trim());
  const hasInternal = Boolean(process.env.INTERNAL_API_SECRET?.trim());
  const hasService = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY !== "your-service-role-key"
  );
  if (!hasCredKey) warn("MARKETPLACE_CREDENTIALS_KEY unset locally (required in production)");
  if (!hasInternal) warn("INTERNAL_API_SECRET unset locally (required in production; falls back to service_role in non-prod)");
  if (!hasService) warn("SUPABASE_SERVICE_ROLE_KEY missing/placeholder");
  ok("Service role key configured for this environment", hasService, hasService ? "present" : "missing");
}

// --- 12. Optional production build client-bundle scan ---
if (withBuildScan) {
  console.log("\n--- Production build + client bundle scan ---");
  let built = false;
  try {
    execSync("npx next build", {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ORION_SECRETS_BUILD: "1" },
    });
    built = true;
    ok("Production webpack build succeeded (ORION_SECRETS_BUILD=1)", true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (fs.existsSync(path.join(root, ".next", "static"))) {
      warn("npm/next build blocked or failed; scanning existing .next output", msg.slice(0, 120));
      ok("Existing .next client output present for scan", true);
    } else {
      ok("Production webpack build succeeded (ORION_SECRETS_BUILD=1)", false, msg.slice(0, 200));
    }
  }

  const nextDir = path.join(root, ".next");
  if (fs.existsSync(nextDir)) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
    const credKey = process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ?? "";
    const internal = process.env.INTERNAL_API_SECRET?.trim() ?? "";
    const needles = [
      ["service key value", serviceKey.length > 20 ? serviceKey : null],
      ["MARKETPLACE_CREDENTIALS_KEY value", credKey.length > 8 ? credKey : null],
      ["INTERNAL_API_SECRET value", internal.length > 8 ? internal : null],
    ].filter(([, v]) => v);

    // Literal env *names* may appear in server chunks; scan browser static only for values.
    const clientChunks = walk(path.join(nextDir, "static"), []).filter((f) => /\.(js|json)$/.test(f));
    const hits = [];
    for (const file of clientChunks) {
      let text = "";
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const [label, needle] of needles) {
        if (needle && text.includes(needle)) {
          hits.push(`${label} in ${path.relative(root, file)}`);
        }
      }
    }
    ok(
      "Client bundles do not embed private secret values",
      hits.length === 0,
      hits.slice(0, 5).join("; ") || (built ? "clean" : "clean (existing .next)")
    );
  }
} else {
  console.log("\n(skip build scan — pass --with-build-scan to include)");
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s), ${warnings} warning(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
