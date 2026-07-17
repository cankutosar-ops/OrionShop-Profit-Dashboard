import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const nextDir = resolve(process.cwd(), ".next");
const nextDevDir = resolve(process.cwd(), ".next-dev");
const lockFile = resolve(process.cwd(), ".dev-server.lock.json");

try {
  await rm(nextDir, { recursive: true, force: true });
  await rm(nextDevDir, { recursive: true, force: true });
  await rm(lockFile, { force: true });
  console.log("Removed .next and .next-dev caches.");
  console.log("Removed stale dev lock file.");
  console.log("Recovery complete. Start a single dev server with: npm run dev");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to remove dev caches: ${message}`);
  process.exit(1);
}
