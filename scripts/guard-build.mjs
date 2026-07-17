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
