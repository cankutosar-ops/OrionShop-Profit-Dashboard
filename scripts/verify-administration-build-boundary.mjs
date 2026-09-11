/**
 * Administration client/server boundary validation.
 * Run: npm run verify:administration-build-boundary
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const root = resolve(process.cwd());
const adminComponents = walk(resolve(root, "src/components/administration"));
const adminPages = walk(resolve(root, "src/app/administration"));

const FORBIDDEN = [
  { re: /from\s+["']@\/services\//, label: "server service import" },
  { re: /from\s+["']@\/services\/marketplace-account-service["']/, label: "marketplace-account-service" },
  { re: /from\s+["']@\/services\/account-lifecycle-service["']/, label: "account-lifecycle-service" },
  { re: /from\s+["']next\/server["']/, label: "next/server" },
  { re: /from\s+["']@\/lib\/credentials/, label: "credentials" },
  { re: /from\s+["']@\/lib\/credentials\/encryption["']/, label: "encryption" },
  { re: /from\s+["']crypto["']|from\s+["']node:crypto["']/, label: "node crypto" },
];

console.log("=== Administration Build Boundary ===\n");

console.log("--- Client-safe type modules ---");
for (const rel of [
  "src/lib/administration/user-types.ts",
  "src/lib/administration/platform-settings-document.ts",
  "src/lib/administration/security-types.ts",
  "src/lib/administration/audit-types.ts",
]) {
  check(rel, existsSync(resolve(root, rel)));
  const src = readFileSync(resolve(root, rel), "utf8");
  check(
    `${rel} has no server/service imports`,
    !src.includes("@/services/") &&
      !src.includes("next/server") &&
      !src.includes("@/lib/supabase/admin") &&
      !src.includes("@/lib/credentials")
  );
}

console.log("\n--- Administration UI files ---");
const files = [...adminComponents, ...adminPages];
check("Administration files discovered", files.length > 0, String(files.length));

const offenders = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const isClient =
    src.includes('"use client"') ||
    src.includes("'use client'") ||
    file.includes(`${join("src", "components", "administration")}`);
  if (!isClient) continue;
  for (const rule of FORBIDDEN) {
    if (rule.re.test(src)) {
      offenders.push(`${relative(root, file)} → ${rule.label}`);
    }
  }
}

check(
  "No Administration client/component forbidden imports",
  offenders.length === 0,
  offenders.length ? offenders.join("; ") : "clean"
);

console.log("\n--- Value imports that previously broke build ---");
const access = readFileSync(
  resolve(root, "src/components/administration/marketplace-access-table.tsx"),
  "utf8"
);
check(
  "marketplace-access-table uses lib user-types",
  access.includes("@/lib/administration/user-types") &&
    !access.includes("@/services/administration-user-service")
);
const settings = readFileSync(
  resolve(root, "src/components/administration/settings-panel.tsx"),
  "utf8"
);
check(
  "settings-panel uses lib platform-settings-document",
  settings.includes("@/lib/administration/platform-settings-document") &&
    !settings.includes("@/services/administration-platform-settings-service")
);

console.log("\n--- API routes still own server services ---");
const usersRoute = readFileSync(
  resolve(root, "src/app/api/administration/users/route.ts"),
  "utf8"
);
check(
  "Users API still uses administration-user-service",
  usersRoute.includes("@/services/administration-user-service")
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
