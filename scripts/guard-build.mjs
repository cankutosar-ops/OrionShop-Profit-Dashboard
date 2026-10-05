#!/usr/bin/env node
/**
 * Refuse production builds while the dev server is running.
 * next build and next dev must not share the same distDir output tree.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const lockFile = resolve(process.cwd(), ".dev-server.lock.json");

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Production must compile its browser-visible Supabase configuration.
  // Ignore commands skip previews; also stop forced preview builds here.
  if (process.env.NETLIFY === "true" && ["deploy-preview", "branch-deploy"].includes(process.env.CONTEXT)) {
    console.error("Build blocked: publish this dashboard only from main in the Netlify Production context.");
    process.exit(1);
  }
  if (process.env.NETLIFY === "true" && process.env.CONTEXT === "production") {
    const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const missing = required.filter((name) => !process.env[name]?.trim());
    if (missing.length) {
      console.error(`Build blocked: missing Netlify Production configuration: ${missing.join(", ")}`);
      process.exit(1);
    }
  }
  // Production intentionally returns 404 for /api/perf/*. Browser telemetry
  // must therefore remain explicitly opt-in. Fail the build if a future edit
  // re-enables client posts by default and recreates a production request loop.
  const [middlewareSource, perfClientSource] = await Promise.all([
    readFile(resolve(process.cwd(), "src/middleware.ts"), "utf8"),
    readFile(resolve(process.cwd(), "src/lib/perf/perf-client.ts"), "utf8"),
  ]);
  const perfApiHiddenInProduction =
    middlewareSource.includes('process.env.NODE_ENV === "production"') &&
    middlewareSource.includes('pathname.startsWith("/api/perf/")');
  const clientPerfExplicitlyOptIn = perfClientSource.includes(
    'process.env.NEXT_PUBLIC_PERF_AUDIT !== "1"'
  );
  if (perfApiHiddenInProduction && !clientPerfExplicitlyOptIn) {
    console.error(
      "✗ Build blocked: browser performance telemetry can call a production-disabled /api/perf endpoint."
    );
    console.error(
      'Keep client telemetry opt-in with NEXT_PUBLIC_PERF_AUDIT="1", or change the production API policy together.'
    );
    process.exit(1);
  }

  let lock = null;
  try {
    lock = JSON.parse(await readFile(lockFile, "utf8"));
  } catch {
    return;
  }

  const launcherAlive = isPidAlive(lock.pid);
  const childAlive = isPidAlive(lock.childPid);

  if (launcherAlive || childAlive) {
    console.error("✗ Build blocked: OrionShop dev server is running.");
    console.error(
      [
        `Launcher PID: ${lock.pid ?? "unknown"}${launcherAlive ? " (alive)" : ""}`,
        `Next PID: ${lock.childPid ?? "unknown"}${childAlive ? " (alive)" : ""}`,
        `Port: ${lock.port ?? "unknown"}`,
        `Started: ${lock.startedAt ?? "unknown"}`,
        "",
        "Stop the dev server before running npm run build.",
        "Dev uses .next-dev; production build writes .next — running both at once corrupts dev runtime.",
      ].join("\n")
    );
    process.exit(1);
  }
}

await main();
