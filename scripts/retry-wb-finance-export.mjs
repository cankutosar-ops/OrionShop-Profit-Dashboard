#!/usr/bin/env node
/**
 * Temporary — retry finance.json + sales.json export with extended backoff.
 * Usage: npx tsx scripts/retry-wb-finance-export.mjs [accountId] [from] [to] [outputDir] [initialWaitSec]
 */
import { spawn } from "child_process";
import { resolve } from "path";

const accountId = process.argv[2] ?? "2";
const from = process.argv[3] ?? "2026-06-30";
const to = process.argv[4] ?? "2026-07-05";
const outputDir = process.argv[5] ?? "exports/wb-raw-2026-06-30_2026-07-05";
const initialWaitSec = Number(process.argv[6] ?? 1800);

function runExport(only) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "npx",
      [
        "tsx",
        "scripts/export-wb-raw-accounting-recon.mjs",
        accountId,
        from,
        to,
        outputDir,
        `--only=${only}`,
      ],
      { cwd: resolve(process.cwd()), stdio: "inherit", shell: true },
    );
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${only} exit ${code}`))));
  });
}

async function hasRows(filename) {
  const { readFile } = await import("fs/promises");
  const raw = JSON.parse(await readFile(resolve(outputDir, filename), "utf8"));
  return Array.isArray(raw.data) && raw.data.length > 0 && !raw.metadata?.error;
}

async function main() {
  console.log(`Initial wait ${initialWaitSec}s before retry…`);
  await new Promise((r) => setTimeout(r, initialWaitSec * 1000));

  for (const file of ["finance.json", "sales.json"]) {
    for (let attempt = 1; attempt <= 8; attempt++) {
      console.log(`\n=== ${file} attempt ${attempt}/8 ===`);
      try {
        await runExport(file);
      } catch (e) {
        console.error(e.message);
      }
      if (await hasRows(file)) {
        console.log(`✓ ${file} has data`);
        break;
      }
      const wait = Math.min(300, 60 * attempt);
      console.log(`No data yet, waiting ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
