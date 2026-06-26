#!/usr/bin/env node
/**
 * Sprint 2 stepped sync — one entity at a time, 2-minute timeout per step.
 * Usage: npx tsx scripts/sprint2-sync-stepped.mjs [dateFrom] [dateTo]
 */

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

const TIMEOUT_MS = 2 * 60 * 1000;
const ENTITIES = ["products", "orders", "sales", "finance", "stock"];

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function ts() {
  return new Date().toISOString();
}

function runEntity(entity, from, to) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    console.log(`\n[${ts()}] START ${entity}`);

    const child = spawn(
      "npx",
      ["tsx", "scripts/run-sprint2-sync-direct.mjs", from, to, entity],
      {
        cwd: process.cwd(),
        env: { ...process.env, SYNC_LOG: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
      resolveRun({
        entity,
        status: "TIMEOUT",
        durationMs: Date.now() - started,
        recordsProcessed: null,
        error: `Aborted after ${TIMEOUT_MS / 1000}s`,
      });
    }, TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;

      let result = null;
      const jsonMatch = stdout.match(/\{\s*"entity"[\s\S]*?\}\s*$/m);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch {
          // ignore
        }
      }

      let recordsProcessed = result?.recordsProcessed ?? null;
      let recordsInserted = result?.recordsInserted ?? null;
      let recordsUpdated = result?.recordsUpdated ?? null;

      if (recordsProcessed == null) {
        const procMatch = stdout.match(/"recordsProcessed":\s*(\d+)/);
        if (procMatch) recordsProcessed = Number(procMatch[1]);
        const endMatch = stdout.match(/"processed":(\d+)/g);
        if (endMatch?.length && recordsProcessed == null) {
          const last = endMatch[endMatch.length - 1].match(/(\d+)/);
          recordsProcessed = last ? Number(last[1]) : null;
        }
      }
      if (recordsInserted == null) {
        const insMatch = stdout.match(/"recordsInserted":\s*(\d+)/);
        if (insMatch) recordsInserted = Number(insMatch[1]);
      }
      if (recordsUpdated == null) {
        const updMatch = stdout.match(/"recordsUpdated":\s*(\d+)/);
        if (updMatch) recordsUpdated = Number(updMatch[1]);
      }

      if (code === 0) {
        resolveRun({
          entity,
          status: "PASS",
          durationMs,
          recordsProcessed: recordsProcessed ?? 0,
          recordsInserted,
          recordsUpdated,
          errors: result?.errors?.length ?? 0,
        });
      } else {
        resolveRun({
          entity,
          status: "FAIL",
          durationMs,
          recordsProcessed,
          recordsInserted,
          recordsUpdated,
          error: stderr.slice(-300) || stdout.slice(-300) || `exit ${code}`,
        });
      }
    });
  });
}

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  console.log(`Sprint 2 stepped sync (${from} → ${to}), timeout ${TIMEOUT_MS / 1000}s per step`);

  const summary = [];

  for (const entity of ENTITIES) {
    const row = await runEntity(entity, from, to);
    summary.push(row);

    const label = row.status === "TIMEOUT" ? "TIMEOUT" : row.status;
    console.log(`[${ts()}] ${entity.toUpperCase()}: ${label}`);
    console.log(`  duration: ${(row.durationMs / 1000).toFixed(1)}s`);
    console.log(`  rows processed: ${row.recordsProcessed ?? "n/a"}`);
    if (row.recordsInserted != null) console.log(`  inserted: ${row.recordsInserted}, updated: ${row.recordsUpdated}`);
    if (row.error) console.log(`  note: ${row.error}`);
  }

  console.log("\n=== FINAL SUMMARY ===");
  console.log("step       | result   | duration | rows processed");
  console.log("-----------|----------|----------|---------------");
  for (const row of summary) {
    const dur = `${(row.durationMs / 1000).toFixed(1)}s`.padStart(8);
    const proc = String(row.recordsProcessed ?? "n/a").padStart(14);
    console.log(`${row.entity.padEnd(10)} | ${row.status.padEnd(8)} | ${dur} | ${proc}`);
  }

  const hung = summary.filter((r) => r.status === "TIMEOUT").map((r) => r.entity);
  if (hung.length) {
    console.log(`\nSteps exceeding ${TIMEOUT_MS / 1000}s: ${hung.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
