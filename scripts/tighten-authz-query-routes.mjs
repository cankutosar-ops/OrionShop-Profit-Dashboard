/**
 * Tighten API routes: authorizeRequestScope + use authz.marketplaceAccountId.
 * Handles common query-param account patterns; body/POST routes need manual review.
 */
import fs from "fs";
import path from "path";

const root = path.join(process.cwd(), "src/app/api");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === "route.ts") acc.push(p);
  }
  return acc;
}

const QUERY_ACCOUNT_FILES = [
  "inventory/history/route.ts",
  "inventory/history/export/route.ts",
  "inventory/history/original/route.ts",
  "inventory/shipment-history/route.ts",
  "monitoring/production-health/route.ts",
  "monitoring/verification-history/route.ts",
  "sync/status/route.ts",
  "sync/verification/route.ts",
  "warehouse/foundation/route.ts",
];

for (const rel of QUERY_ACCOUNT_FILES) {
  const f = path.join(root, rel);
  let s = fs.readFileSync(f, "utf8");
  s = s.replace(
    'import { authorize, isAuthzFailure } from "@/lib/security/authorize";',
    'import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";'
  );
  s = s.replace(
    /const authz = await authorize\(request\);\r?\n\s*if \(isAuthzFailure\(authz\)\) return authz;/g,
    "const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });\n  if (isAuthzFailure(authz)) return authz;\n  const marketplaceAccountId = authz.marketplaceAccountId!;"
  );
  // Remove redundant query reads for marketplaceAccountId when we already bind from authz
  // Leave validation that checks empty — may duplicate; clean per file later
  fs.writeFileSync(f, s);
  console.log("QUERY", rel);
}
