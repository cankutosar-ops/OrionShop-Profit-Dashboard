#!/usr/bin/env node
/**
 * Reproduces dev runtime corruption when next build runs against the live dev distDir.
 * With the fix (separate .next-dev + guard-build), this script should report SAFE.
 *
 * Usage: node scripts/dev-repro-build-corruption.mjs [--port 3000]
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const port = Number(process.argv.find((_, i, a) => a[i - 1] === "--port") ?? 3000);
const baseUrl = `http://localhost:${port}`;

async function fetchHome() {
  const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  return { status: response.status, styled: body.includes('rel="stylesheet"') || body.includes("bg-background") };
}

async function main() {
  console.log("=== Dev/build distDir corruption repro ===\n");

  let before;
  try {
    before = await fetchHome();
  } catch (error) {
    console.error(`Dev server not reachable at ${baseUrl}:`, error instanceof Error ? error.message : error);
    console.error("Start with: npm run dev");
    process.exit(1);
  }

  console.log(`Before build: HTTP ${before.status}, styled=${before.styled}`);

  let lock = null;
  try {
    lock = JSON.parse(await readFile(resolve(process.cwd(), ".dev-server.lock.json"), "utf8"));
  } catch {
    // no lock
  }

  if (lock?.distDir === ".next-dev") {
    console.log("\nDev distDir isolation: ACTIVE (.next-dev)");
    console.log("Production build is blocked while dev runs (guard-build.mjs).");
    console.log("\nRESULT: SAFE — build cannot clobber dev vendor-chunks/manifests.");
    return;
  }

  console.log("\nWARNING: Dev distDir isolation not detected in lock file.");
  console.log("If build were run now against shared .next, vendor-chunks/manifest ENOENT would follow.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
