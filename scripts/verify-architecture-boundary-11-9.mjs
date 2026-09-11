/**
 * Sprint 11.9 — Project-wide architecture boundary certification.
 * Client components must not import server/runtime modules.
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
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const root = resolve(process.cwd());
const componentFiles = walk(resolve(root, "src/components"));

const FORBIDDEN = [
  { id: "services", re: /from\s+["']@\/services\// },
  { id: "credentials", re: /from\s+["']@\/lib\/credentials(\/|["'])/ },
  { id: "encryption", re: /from\s+["']@\/lib\/credentials\/encryption["']/ },
  { id: "next/server", re: /from\s+["']next\/server["']/ },
  { id: "node:crypto", re: /from\s+["'](?:node:)?crypto["']/ },
  { id: "supabase/admin", re: /from\s+["']@\/lib\/supabase\/admin["']/ },
  { id: "profit-engine", re: /from\s+["']@\/lib\/profit-engine-model-b["']/ },
  { id: "warehouse-runtime", re: /from\s+["']@\/services\/(historical-warehouse|inventory-daily|warehouse-ops|warehouse-control)/ },
  { id: "marketplace-runtime", re: /from\s+["']@\/services\/marketplace-account-service["']/ },
];

console.log("=== Sprint 11.9 — Architecture Boundary Certification ===\n");

  const offenders = [];
for (const file of componentFiles) {
  const src = readFileSync(file, "utf8");
  if (!/["']use client["']/.test(src)) continue;

  for (const rule of FORBIDDEN) {
    if (rule.re.test(src)) {
      offenders.push(`${relative(root, file)} → ${rule.id}`);
    }
  }
}

check(
  "No client-boundary component forbidden imports",
  offenders.length === 0,
  offenders.length ? offenders.slice(0, 20).join("; ") + (offenders.length > 20 ? ` …(+${offenders.length - 20})` : "") : "clean"
);

// Pages under app that are "use client"
const appFiles = walk(resolve(root, "src/app")).filter((f) => {
  const src = readFileSync(f, "utf8");
  return /["']use client["']/.test(src);
});
const appOffenders = [];
for (const file of appFiles) {
  const src = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.re.test(src)) {
      appOffenders.push(`${relative(root, file)} → ${rule.id}`);
    }
  }
}
check(
  "No use-client app pages with forbidden imports",
  appOffenders.length === 0,
  appOffenders.length ? appOffenders.join("; ") : "clean"
);

check(
  "instrumentation uses Node-only scheduler bootstrap",
  existsSync(resolve(root, "src/instrumentation.ts")) &&
    readFileSync(resolve(root, "src/instrumentation.ts"), "utf8").includes(
      "inventory-snapshot-continuity-scheduler"
    ) &&
    !readFileSync(resolve(root, "src/instrumentation.ts"), "utf8").includes(
      "inventory-snapshot-continuity-service"
    )
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
