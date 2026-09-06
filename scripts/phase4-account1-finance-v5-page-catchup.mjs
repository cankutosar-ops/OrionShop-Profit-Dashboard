#!/usr/bin/env node
/**
 * PHASE 4 — Account 1 Finance Statistics V5 page-wake catch-up.
 * Persists each page before advancing cursor. Waits server Retry / Reset between pages.
 * Does NOT touch Account 2.
 *
 * Usage: npx tsx scripts/phase4-account1-finance-v5-page-catchup.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ACCOUNT_ID = "1";
const DATE_FROM = "2026-08-24";
const DATE_TO = "2026-09-06";
const PROGRESS = resolve("exports/finance-backfill/account-1-phase4-finance-catchup.json");
const DEFAULT_WAIT_MS = 900_000; // ~15m when Retry/Reset missing but Remaining=0

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(name), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
      }
    } catch {
      /* optional */
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
  if (!existsSync(PROGRESS)) {
    return { accountId: ACCOUNT_ID, from: DATE_FROM, to: DATE_TO, rrdId: 0, pages: 0, upserted: 0 };
  }
  return JSON.parse(readFileSync(PROGRESS, "utf8"));
}

function save(p) {
  mkdirSync(resolve("exports/finance-backfill"), { recursive: true });
  writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

async function snap(sb) {
  const { count } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", ACCOUNT_ID);
  const { data } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", ACCOUNT_ID)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    max: data?.operation_date ? String(data.operation_date).slice(0, 10) : null,
  };
}

async function main() {
  loadEnv();
  const maxPages = Number(process.env.A1_FINANCE_MAX_PAGES || "3");
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
  const { computeFinancePageWaitMs } = await import("../src/lib/wildberries/rate-limit-retry.ts");

  const sb = createAdminClient();
  const a2Before = await snap(
    // reuse shape
    sb
  );
  // Account 2 integrity check
  const { count: a2c } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", "2");
  const { data: a2m } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", "2")
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const a2Snap = {
    count: a2c ?? 0,
    max: a2m?.operation_date ? String(a2m.operation_date).slice(0, 10) : null,
  };

  const svc = await createWbSyncService(ACCOUNT_ID);
  let progress = loadProgress();
  const before = await snap(sb);
  console.log(JSON.stringify({ before, a2Snap, rrdId: progress.rrdId }));

  for (let i = 0; i < maxPages; i += 1) {
    const rrdId = Number(progress.rrdId ?? 0);
    console.log(JSON.stringify({ action: "page", rrdId, loop: i + 1 }));
    let result;
    try {
      result = await svc.syncFinancePage(DATE_FROM, DATE_TO, rrdId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ failed: msg.slice(0, 400), rrdIdUnchanged: rrdId }));
      if (/429/.test(msg)) {
        console.log(JSON.stringify({ waitMs: DEFAULT_WAIT_MS, reason: "429" }));
        await sleep(DEFAULT_WAIT_MS);
        continue;
      }
      break;
    }

    const errors = result.errors ?? [];
    if (errors.some((e) => /429/.test(String(e)))) {
      console.log(JSON.stringify({ failed: "429_in_result", errors, rrdIdUnchanged: rrdId }));
      await sleep(DEFAULT_WAIT_MS);
      continue;
    }

    const page = result.page;
    const processed = result.recordsProcessed ?? 0;
    const upserted = result.recordsUpdated ?? 0;
    progress.pages += 1;
    progress.upserted += upserted;

    if (processed === 0 && !page?.hasMore) {
      progress.done = true;
      save(progress);
      console.log(JSON.stringify({ outcome: "empty_terminal", after: await snap(sb) }));
      break;
    }

    if (page?.hasMore && page.lastRrdId != null) {
      progress.rrdId = page.lastRrdId;
      save(progress);
      const waitMs = Math.max(
        DEFAULT_WAIT_MS,
        computeFinancePageWaitMs({
          remaining: page.rateLimit?.remaining ?? 0,
          resetSeconds: page.rateLimit?.resetSeconds ?? null,
          lastFinanceRequestAtMs: Date.now(),
        })
      );
      console.log(
        JSON.stringify({
          outcome: "page_ok_has_more",
          nextRrdId: page.lastRrdId,
          processed,
          upserted,
          waitMs,
          after: await snap(sb),
        })
      );
      await sleep(waitMs);
      continue;
    }

    progress.rrdId = 0;
    progress.done = true;
    save(progress);
    console.log(
      JSON.stringify({
        outcome: "complete",
        processed,
        upserted,
        after: await snap(sb),
      })
    );
    break;
  }

  const after = await snap(sb);
  const { count: a2c2 } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", "2");
  console.log(
    JSON.stringify({
      a1: { before, after },
      a2Unchanged: a2c2 === a2Snap.count,
      progress,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
