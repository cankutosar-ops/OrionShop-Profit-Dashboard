/**
 * One-shot: inject requireAuth into protected API route handlers.
 * Skips /api/auth/* (session is public-introspection but still uses getAuthUser).
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

const importLine =
  'import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";\n';

const files = walk(root).filter((f) => !f.includes(`${path.sep}auth${path.sep}`));

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (s.includes("requireAuth") || s.includes("isAuthFailure")) {
    console.log("SKIP", path.relative(process.cwd(), f));
    continue;
  }

  if (!s.includes("@/lib/security/require-auth")) {
    const m = s.match(/^(import .+;\r?\n)+/m);
    if (m) s = s.slice(0, m[0].length) + importLine + s.slice(m[0].length);
    else s = importLine + s;
  }

  s = s.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\(\)/g,
    "export async function $1(request: Request)"
  );
  s = s.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\(_request: Request\)/g,
    "export async function $1(request: Request)"
  );

  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const re = new RegExp(
      `export async function ${method}\\(request: Request(?:,\\s*[^)]+)?\\)\\s*\\{\\s*(try\\s*\\{)?`
    );
    s = s.replace(re, (match, tryBlock) => {
      if (match.includes("requireAuth")) return match;
      const guard =
        "const auth = await requireAuth(request);\n  if (isAuthFailure(auth)) return auth;\n  ";
      if (tryBlock) {
        return match.replace(tryBlock, `try {\n    ${guard}`);
      }
      return `${match}\n  ${guard}`;
    });
  }

  fs.writeFileSync(f, s);
  console.log("PATCH", path.relative(process.cwd(), f));
}
