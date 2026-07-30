/**
 * One-shot: replace requireAuth with authorize on protected API routes.
 * Manual follow-up still needed for scope binding (marketplaceAccountId).
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

const files = walk(root).filter((f) => !f.includes(`${path.sep}auth${path.sep}`));

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("requireAuth")) {
    console.log("SKIP (no requireAuth)", path.relative(process.cwd(), f));
    continue;
  }
  if (s.includes("@/lib/security/authorize")) {
    console.log("SKIP (already)", path.relative(process.cwd(), f));
    continue;
  }

  s = s.replace(
    /import \{ requireAuth, isAuthFailure \} from "@\/lib\/security\/require-auth";\r?\n/,
    'import { authorize, isAuthzFailure } from "@/lib/security/authorize";\n'
  );

  // Replace auth gate blocks
  s = s.replace(
    /const auth = await requireAuth\(request\);\r?\n\s*if \(isAuthFailure\(auth\)\) return auth;/g,
    "const authz = await authorize(request);\n  if (isAuthzFailure(authz)) return authz;"
  );

  fs.writeFileSync(f, s);
  console.log("PATCH", path.relative(process.cwd(), f));
}
