/**
 * Fix remaining _request handlers missing requireAuth after first inject pass.
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
  let changed = false;

  // Rename _request → request and inject guard when missing inside that function
  s = s.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\(_request: Request(,\s*[^)]+)?\)\s*\{([\s\S]*?)(?=\nexport async function |\nexport const |\n$)/g,
    (full, method, restArgs, body) => {
      changed = true;
      const args = restArgs || "";
      if (body.includes("requireAuth")) {
        return `export async function ${method}(request: Request${args}) {${body}`;
      }
      // Prefer insert after try {
      let newBody = body;
      if (/^\s*try\s*\{/.test(body)) {
        newBody = body.replace(
          /^\s*try\s*\{/,
          `  try {\n    const auth = await requireAuth(request);\n    if (isAuthFailure(auth)) return auth;\n`
        );
      } else {
        newBody = `\n  const auth = await requireAuth(request);\n  if (isAuthFailure(auth)) return auth;\n${body}`;
      }
      return `export async function ${method}(request: Request${args}) {${newBody}`;
    }
  );

  // Normalize indentation of auth guard lines
  s = s.replace(
    /const auth = await requireAuth\(request\);\r?\n\s*if \(isAuthFailure\(auth\)\) return auth;\r?\n\s*\r?\n/g,
    "const auth = await requireAuth(request);\n    if (isAuthFailure(auth)) return auth;\n\n    "
  );

  if (changed) {
    fs.writeFileSync(f, s);
    console.log("FIXED", path.relative(process.cwd(), f));
  }
}
