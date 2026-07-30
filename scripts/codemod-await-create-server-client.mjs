/**
 * Codemod: createServerClient() → await createServerClient()
 * and getClient helpers that call it become async.
 */
import fs from "fs";
import path from "path";

const roots = [
  path.join(process.cwd(), "src/services"),
  path.join(process.cwd(), "src/lib"),
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const skip = new Set([
  path.join(process.cwd(), "src/lib/supabase/server.ts"),
  path.join(process.cwd(), "src/lib/supabase/admin.ts"),
  path.join(process.cwd(), "src/lib/supabase/auth-server.ts"),
  path.join(process.cwd(), "src/middleware.ts"),
]);

for (const f of roots.flatMap((r) => walk(r))) {
  if (skip.has(f)) continue;
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("createServerClient(")) continue;
  // Don't touch @supabase/ssr import usages in middleware/auth-server (skipped)
  const before = s;
  s = s.replace(/(?<!await )createServerClient\(\)/g, "await createServerClient()");
  // Fix double await
  s = s.replace(/await await createServerClient\(\)/g, "await createServerClient()");
  if (s !== before) {
    fs.writeFileSync(f, s);
    console.log("awaited", path.relative(process.cwd(), f));
  }
}
