import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const staticRoot = resolve(root, process.env.TAX_BUILD_DIR ?? ".next-tax-build", "static");
if (!existsSync(staticRoot)) throw new Error("Production static bundle not found");

const names = ["SUPABASE_SERVICE_ROLE_KEY", "MARKETPLACE_CREDENTIALS_KEY", "INTERNAL_API_SECRET"];
const lines = existsSync(resolve(root, ".env.local"))
  ? readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/) : [];
const secrets = names.map((name) => {
  const line = lines.find((item) => item.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") ?? "";
}).filter((value) => value.length > 8);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(js|json)$/.test(entry.name) ? [path] : [];
  });
}

const chunks = files(staticRoot);
let hits = 0;
for (const file of chunks) {
  const source = readFileSync(file, "utf8");
  for (const secret of secrets) if (source.includes(secret)) hits++;
}
if (hits) throw new Error(`Private secret material found in ${hits} browser bundle locations`);
console.log(`Browser bundle secret scan passed (${chunks.length} files, ${secrets.length} configured private values)`);
