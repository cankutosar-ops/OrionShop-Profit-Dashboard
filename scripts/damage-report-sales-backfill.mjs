#!/usr/bin/env node
/**
 * Damage Report — controlled 365-day sales history backfill (SKU-scoped upsert).
 *
 * Usage:
 *   npx tsx scripts/damage-report-sales-backfill.mjs --pilot
 *   npx tsx scripts/damage-report-sales-backfill.mjs --continue
 *   npx tsx scripts/damage-report-sales-backfill.mjs --audit-only
 *   npx tsx scripts/damage-report-sales-backfill.mjs --account 1 --pilot
 *
 * Safety: sequential, rate-limit aware, resumable, idempotent upsert on (account, srid).
 * Does NOT calculate compensation. Does NOT create stub products.
 * Does NOT modify Financial Engine formulas.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { mapApiSaleToDb, toDateString, isWithinDateRange } from "../src/lib/wildberries/mappers.ts";
import { runWithSyncExecutionContext } from "../src/lib/commercial-continuity/sync-execution-context.ts";
import { assertSyncNotRunning } from "../src/services/sync-job-service.ts";
import {
  markAccountSyncStarted,
  markAccountSyncFinished,
} from "../src/services/marketplace-account-service.ts";
import {
  ACCOUNT_FILE_MAP,
  DEFAULTS,
  DAMAGE_BACKFILL_DIR,
  loadEnv,
  sleep,
  addDays,
  daysBetween,
  loadProgress,
  saveProgress,
  acquireLock,
  releaseLock,
  batchKey,
  datesToBatches,
  parseDamageExcel,
  isRateLimitedError,
  isRetryableServerError,
  pickPilotSkus,
  missingDays,
} from "./lib/damage-report-sales-backfill.mjs";

function parseArgs(argv) {
  const args = {
    pilot: false,
    continueAll: false,
    auditOnly: false,
    account: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pilot") args.pilot = true;
    else if (a === "--continue") args.continueAll = true;
    else if (a === "--audit-only") args.auditOnly = true;
    else if (a === "--account") args.account = String(argv[++i]);
  }
  if (!args.pilot && !args.continueAll && !args.auditOnly) {
    args.pilot = true;
  }
  return args;
}

async function loadCatalog(supabase, accountId) {
  const map = new Map();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("id,nm_id,supplier_article,category_id")
      .eq("marketplace_account_id", accountId)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const p of data) map.set(Number(p.nm_id), p);
    if (data.length < page) break;
    from += page;
  }
  return map;
}

async function loadAccountSaleDays(supabase, accountId, start, end) {
  const days = new Set();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("wb_sales")
      .select("sale_date")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", start)
      .lte("sale_date", end)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (r.sale_date) days.add(String(r.sale_date).slice(0, 10));
    }
    if (data.length < page) break;
    from += page;
  }
  return days;
}

async function skuSalesStats(supabase, accountId, nmId, start, end) {
  let from = 0;
  const page = 1000;
  let count = 0;
  let units = 0;
  let minD = null;
  let maxD = null;
  for (;;) {
    const { data, error } = await supabase
      .from("wb_sales")
      .select("sale_date,quantity,is_return")
      .eq("marketplace_account_id", accountId)
      .eq("nm_id", nmId)
      .eq("is_return", false)
      .gte("sale_date", start)
      .lte("sale_date", end)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      count += 1;
      units += Number(r.quantity ?? 1);
      const d = String(r.sale_date).slice(0, 10);
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }
    if (data.length < page) break;
    from += page;
  }
  return { count, units, minD, maxD };
}

async function skuHasAnySalesInWindow(supabase, accountId, nmId, start, end) {
  const { count, error } = await supabase
    .from("wb_sales")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .eq("nm_id", nmId)
    .gte("sale_date", start)
    .lte("sale_date", end);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function saleDayBounds(coveredDays) {
  const sorted = [...coveredDays].sort();
  if (!sorted.length) return null;
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

async function upsertScopedSales(supabase, accountId, sales, catalogByNm) {
  const includeRevenue = !(
    await supabase.from("wb_sales").select("price_with_disc").limit(1)
  ).error;
  const includeWarehouse = !(await supabase.from("wb_sales").select("warehouse").limit(1))
    .error;

  const payloads = [];
  let skippedNoProduct = 0;
  for (const sale of sales) {
    const product = catalogByNm.get(Number(sale.nmId));
    if (!product) {
      skippedNoProduct += 1;
      continue;
    }
    const mapped = mapApiSaleToDb(sale, String(product.id));
    const row = { ...mapped, marketplace_account_id: accountId };
    if (!includeRevenue) {
      delete row.price_with_disc;
      delete row.for_pay;
    }
    if (!includeWarehouse) delete row.warehouse;
    payloads.push(row);
  }

  const byKey = new Map();
  const errors = [];
  for (const row of payloads) {
    const saleId = row.sale_id;
    if (!saleId) {
      errors.push("wb_sales row missing sale_id — skipped to avoid SRID overwrite");
      continue;
    }
    byKey.set(`${row.marketplace_account_id}\0${saleId}`, row);
  }
  const deduped = [...byKey.values()];

  let upserted = 0;
  const batchSize = 200;
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    const { error } = await supabase.from("wb_sales").upsert(batch, {
      onConflict: "marketplace_account_id,sale_id",
    });
    if (error) errors.push(error.message);
    else upserted += batch.length;
  }
  return { upserted, skippedNoProduct, rawFiltered: sales.length, errors };
}

async function fetchBatchWithRetries(sync, accountId, batch, metrics) {
  let attempt429 = 0;
  let attempt5xx = 0;

  while (true) {
    metrics.apiRequests += 1;
    try {
      const result = await runWithSyncExecutionContext(
        {
          wb429MaxRetries: 0,
          wb429HonorServerRetry: true,
          marketplaceAccountId: accountId,
        },
        async () => {
          const client = sync.getApiClient();
          return client.fetchSales(`${batch.from}T00:00:00`);
        }
      );
      metrics.successfulRequests += 1;
      return { ok: true, sales: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRateLimitedError(message)) {
        metrics.responses429 += 1;
        metrics.totalRetries += 1;
        attempt429 += 1;
        if (attempt429 > DEFAULTS.max429Attempts) {
          return { ok: false, rateLimited: true, message, attempt429, attempt5xx };
        }
        const wait =
          DEFAULTS.retry429ScheduleMs[attempt429 - 1] ??
          DEFAULTS.retry429ScheduleMs[DEFAULTS.retry429ScheduleMs.length - 1];
        const jitter = Math.floor(Math.random() * 5_000);
        console.log(
          `  429 on ${batch.label} — wait ${Math.round((wait + jitter) / 1000)}s (attempt ${attempt429}/${DEFAULTS.max429Attempts})`
        );
        await sleep(wait + jitter);
        continue;
      }
      if (isRetryableServerError(message)) {
        metrics.otherRetryableErrors += 1;
        metrics.totalRetries += 1;
        attempt5xx += 1;
        if (attempt5xx > DEFAULTS.max5xxAttempts) {
          return { ok: false, rateLimited: false, message, attempt429, attempt5xx };
        }
        const wait =
          DEFAULTS.retry5xxScheduleMs[attempt5xx - 1] ??
          DEFAULTS.retry5xxScheduleMs[DEFAULTS.retry5xxScheduleMs.length - 1];
        console.log(
          `  ${message.slice(0, 80)} — wait ${Math.round(wait / 1000)}s (5xx attempt ${attempt5xx})`
        );
        await sleep(wait);
        continue;
      }
      return { ok: false, rateLimited: false, message, attempt429, attempt5xx };
    }
  }
}

async function runAccount(opts) {
  const { mapping, mode, pilotOnly } = opts;
  const accountId = mapping.marketplaceAccountId;
  const supabase = createAdminClient();

  const { data: accountRow, error: accErr } = await supabase
    .from("marketplace_accounts")
    .select("id,account_name,company_id,seller_id,is_active,sync_enabled")
    .eq("id", accountId)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!accountRow) {
    return {
      stopped: true,
      reason: `marketplace_accounts id=${accountId} not found`,
      mapping,
    };
  }

  const parsed = parseDamageExcel(mapping.file);
  const catalog = await loadCatalog(supabase, accountId);
  const catalogSet = new Set([...catalog.keys()]);

  const salesPresence = new Map();
  for (const sku of parsed.skus) {
    if (!sku.referenceDate) continue;
    salesPresence.set(
      sku.nmId,
      await skuHasAnySalesInWindow(
        supabase,
        accountId,
        sku.nmId,
        sku.requiredStart,
        sku.requiredEnd
      )
    );
  }

  /**
   * Always upsert ALL Excel damage nmIds for this account (not the full catalog).
   * Pilot only selects 3–5 SKUs for validation reporting; API batches are account-day
   * gaps, so limiting upsert to pilot SKUs would permanently skip peers on resume.
   */
  const allSkus = parsed.skus;
  const pilotSkus = pickPilotSkus(
    parsed.skus,
    catalogSet,
    salesPresence,
    DEFAULTS.pilotSkuLimit
  );
  const scopeSkus = allSkus;

  const progress = loadProgress(accountId);
  progress.meta.mode = mode;
  progress.meta.legalName = mapping.legalName;
  progress.meta.accountName = accountRow.account_name;
  progress.meta.file = mapping.file;
  progress.meta.mappingEvidence = mapping.mappingEvidence;
  progress.meta.scopeNmIds = scopeSkus.map((s) => s.nmId);
  progress.meta.pilotSkuNmIds = pilotSkus.map((s) => s.nmId);
  progress.meta.pilot = pilotOnly;

  const scopedWithRef = scopeSkus.filter((s) => s.referenceDate);
  if (!scopedWithRef.length && !opts.auditOnly) {
    saveProgress(accountId, progress);
    return {
      stopped: false,
      accountId,
      accountName: accountRow.account_name,
      legalName: mapping.legalName,
      note: "No SKUs with reference dates in scope",
      scopeSkus,
      pilotSkus,
      parsed,
      progress,
      batchesPlanned: [],
      batchesRun: [],
    };
  }

  const unionStart = scopedWithRef.map((s) => s.requiredStart).sort()[0];
  const unionEnd = scopedWithRef
    .map((s) => s.requiredEnd)
    .sort()
    .at(-1);

  const coveredDays = await loadAccountSaleDays(supabase, accountId, unionStart, unionEnd);
  const syncedEra = saleDayBounds(coveredDays);
  const missing = missingDays(
    unionStart,
    unionEnd,
    coveredDays,
    progress.completedBatches,
    syncedEra
  );
  let batches = datesToBatches(missing, DEFAULTS.batchDays);

  // Resume: skip completed; prefer pending then failed not completed
  batches = batches.filter((b) => !progress.completedBatches[b.key]);

  const runResult = {
    stopped: false,
    accountId,
    accountName: accountRow.account_name,
    legalName: mapping.legalName,
    scopeSkus,
    pilotSkus,
    parsedCount: parsed.skus.length,
    unionStart,
    unionEnd,
    missingDayCount: missing.length,
    batchesPlanned: batches.map((b) => b.key),
    batchesRun: [],
    rateLimited: false,
    progress,
  };

  if (opts.auditOnly) {
    saveProgress(accountId, progress);
    return runResult;
  }

  if (!batches.length) {
    console.log(`[account ${accountId}] No missing calendar days to fetch for scoped SKUs.`);
    progress.metrics.periodsSkippedAlreadyComplete += 1;
    saveProgress(accountId, progress);
    return runResult;
  }

  acquireLock(accountId);
  let syncMarked = false;
  try {
    await assertSyncNotRunning(accountId);
    await markAccountSyncStarted(accountId);
    syncMarked = true;

    const sync = await createWbSyncService(accountId);
    const nmAllow = new Set(scopeSkus.map((s) => s.nmId));
    const metrics = progress.metrics;

    for (let i = 0; i < batches.length; i++) {
      if (DEFAULTS.maxBatches > 0 && runResult.batchesRun.length >= DEFAULTS.maxBatches) {
        runResult.stopped = true;
        runResult.stopReason = `DAMAGE_BACKFILL_MAX_BATCHES=${DEFAULTS.maxBatches} reached`;
        console.log(
          `[account ${accountId}] stopping after ${DEFAULTS.maxBatches} batch(es) (DAMAGE_BACKFILL_MAX_BATCHES)`
        );
        break;
      }
      const batch = batches[i];
      console.log(
        `[account ${accountId}] batch ${i + 1}/${batches.length}: ${batch.label} (damage nmIds=${nmAllow.size})`
      );

      const fetched = await fetchBatchWithRetries(sync, accountId, batch, metrics);
      if (!fetched.ok) {
        progress.failedBatches[batch.key] = {
          status: fetched.rateLimited ? "rate_limited" : "failed",
          error_message: fetched.message,
          attempt_count: (fetched.attempt429 || 0) + (fetched.attempt5xx || 0),
          last_attempt_at: new Date().toISOString(),
          period_start: batch.from,
          period_end: batch.to,
        };
        saveProgress(accountId, progress);
        runResult.batchesRun.push({ ...batch, ok: false, ...fetched });
        if (fetched.rateLimited) {
          runResult.rateLimited = true;
          runResult.stopped = true;
          runResult.stopReason = fetched.message;
          break;
        }
        runResult.stopped = true;
        runResult.stopReason = fetched.message;
        break;
      }

      const inRange = fetched.sales.filter((s) =>
        isWithinDateRange(toDateString(s.date), batch.from, batch.to)
      );
      const scoped = inRange.filter((s) => nmAllow.has(Number(s.nmId)));
      metrics.rowsReceived += scoped.length;

      const upsert = await upsertScopedSales(supabase, accountId, scoped, catalog);
      metrics.rowsUpserted += upsert.upserted;
      if (upsert.errors.length) {
        progress.failedBatches[batch.key] = {
          status: "failed",
          error_message: upsert.errors.join("; "),
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
          period_start: batch.from,
          period_end: batch.to,
          rows_received: scoped.length,
        };
        saveProgress(accountId, progress);
        runResult.batchesRun.push({ ...batch, ok: false, upsert });
        runResult.stopped = true;
        runResult.stopReason = upsert.errors.join("; ");
        break;
      }

      progress.completedBatches[batch.key] = {
        status: "completed",
        completed_at: new Date().toISOString(),
        period_start: batch.from,
        period_end: batch.to,
        rows_received: scoped.length,
        rows_upserted: upsert.upserted,
        skipped_no_product: upsert.skippedNoProduct,
        api_raw_in_range: inRange.length,
      };
      delete progress.failedBatches[batch.key];
      metrics.periodsBackfilled += 1;
      saveProgress(accountId, progress);
      runResult.batchesRun.push({
        ...batch,
        ok: true,
        scopedRows: scoped.length,
        upserted: upsert.upserted,
        skippedNoProduct: upsert.skippedNoProduct,
        apiRawInRange: inRange.length,
      });

      if (DEFAULTS.maxBatches > 0 && runResult.batchesRun.length >= DEFAULTS.maxBatches) {
        runResult.stopped = true;
        runResult.stopReason = `DAMAGE_BACKFILL_MAX_BATCHES=${DEFAULTS.maxBatches} reached`;
        console.log(
          `[account ${accountId}] stopping after ${DEFAULTS.maxBatches} batch(es) (DAMAGE_BACKFILL_MAX_BATCHES)`
        );
        break;
      }

      if (i < batches.length - 1) {
        console.log(
          `  success cooldown ${Math.round(DEFAULTS.successDelayMs / 1000)}s before next batch...`
        );
        await sleep(DEFAULTS.successDelayMs);
      }
    }

    await markAccountSyncFinished(accountId, runResult.rateLimited ? "warning" : "success");
    syncMarked = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    runResult.stopped = true;
    runResult.stopReason = message;
    if (syncMarked) {
      await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
    }
  } finally {
    releaseLock(accountId);
  }

  saveProgress(accountId, progress);
  return runResult;
}

async function buildAudit(accountId, mapping, accountName, allSkus) {
  const supabase = createAdminClient();
  const catalog = await loadCatalog(supabase, accountId);
  const rows = [];

  for (const sku of allSkus) {
    const inCatalog = catalog.has(sku.nmId);
    let status;
    let actualEarliest = null;
    let actualLatest = null;
    let salesRows = 0;
    let soldUnits = 0;
    let missingDayCount = null;
    let periodComplete = false;

    if (!sku.referenceDate) {
      status = "MISSING_REFERENCE_DATE";
    } else if (!inCatalog) {
      status = "MISSING_CATALOG_MAPPING";
      const stats = await skuSalesStats(
        supabase,
        accountId,
        sku.nmId,
        sku.requiredStart,
        sku.requiredEnd
      );
      salesRows = stats.count;
      soldUnits = stats.units;
      actualEarliest = stats.minD;
      actualLatest = stats.maxD;
    } else {
      const stats = await skuSalesStats(
        supabase,
        accountId,
        sku.nmId,
        sku.requiredStart,
        sku.requiredEnd
      );
      salesRows = stats.count;
      soldUnits = stats.units;
      actualEarliest = stats.minD;
      actualLatest = stats.maxD;

      const covered = await loadAccountSaleDays(
        supabase,
        accountId,
        sku.requiredStart,
        sku.requiredEnd
      );
      const progress = loadProgress(accountId);
      const missing = missingDays(
        sku.requiredStart,
        sku.requiredEnd,
        covered,
        progress.completedBatches,
        saleDayBounds(covered)
      );
      missingDayCount = missing.length;
      periodComplete = missing.length === 0;

      if (Object.values(progress.failedBatches).some((b) => b.status === "rate_limited")) {
        // keep more specific statuses below unless period complete
      }

      if (periodComplete) {
        status = salesRows === 0 ? "NO_SALES" : "COMPLETE";
      } else if (
        Object.values(progress.failedBatches).some((b) => b.status === "rate_limited")
      ) {
        status = "RATE_LIMITED";
      } else if (salesRows === 0) {
        status = "NO_SALES";
      } else {
        status = "PARTIAL";
      }
    }

    rows.push({
      marketplace_account_id: accountId,
      account_name: accountName,
      legal_name: mapping.legalName,
      nm_id: sku.nmId,
      seller_sku: sku.article,
      lost_quantity: sku.lostQty,
      reference_date: sku.referenceDate,
      required_start_date: sku.requiredStart,
      required_end_date: sku.requiredEnd,
      actual_earliest_sale_date: actualEarliest,
      actual_latest_sale_date: actualLatest,
      sales_rows: salesRows,
      sold_units: soldUnits,
      required_365_complete: periodComplete,
      missing_days: missingDayCount,
      in_catalog: inCatalog,
      status,
    });
  }

  const summary = {
    total_excel_skus: rows.length,
    COMPLETE: rows.filter((r) => r.status === "COMPLETE").length,
    PARTIAL: rows.filter((r) => r.status === "PARTIAL").length,
    NO_SALES: rows.filter((r) => r.status === "NO_SALES").length,
    MISSING_REFERENCE_DATE: rows.filter((r) => r.status === "MISSING_REFERENCE_DATE").length,
    MISSING_CATALOG_MAPPING: rows.filter((r) => r.status === "MISSING_CATALOG_MAPPING")
      .length,
    RATE_LIMITED: rows.filter((r) => r.status === "RATE_LIMITED").length,
  };

  return { rows, summary };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv);
  mkdirSync(DAMAGE_BACKFILL_DIR, { recursive: true });
  mkdirSync(resolve("exports/damage-report"), { recursive: true });

  const mappings = ACCOUNT_FILE_MAP.filter(
    (m) => !args.account || m.marketplaceAccountId === args.account
  );

  const mode = args.auditOnly ? "audit-only" : args.continueAll ? "continue" : "pilot";
  const pilotOnly = mode === "pilot";

  console.log(`Damage Report sales backfill — mode=${mode}`);
  console.log(
    `Config: batchDays=${DEFAULTS.batchDays}, successDelayMs=${DEFAULTS.successDelayMs}, max429=${DEFAULTS.max429Attempts}, maxBatches=${DEFAULTS.maxBatches || "unlimited"}`
  );

  const accountResults = [];
  for (const mapping of mappings) {
    console.log(`\n=== ${mapping.legalName} → account ${mapping.marketplaceAccountId} ===`);
    const result = await runAccount({
      mapping,
      mode,
      pilotOnly,
      auditOnly: args.auditOnly,
    });
    accountResults.push(result);
    if (result.rateLimited) {
      console.log(
        `Rate limited on account ${mapping.marketplaceAccountId} — stopping further accounts.`
      );
      break;
    }
  }

  // Full-SKU audit (all Excel SKUs, not just pilot scope)
  const audits = {};
  for (const mapping of mappings) {
    const parsed = parseDamageExcel(mapping.file);
    const accountName =
      accountResults.find((r) => r.accountId === mapping.marketplaceAccountId)?.accountName ??
      mapping.accountNameExpected;
    audits[mapping.marketplaceAccountId] = await buildAudit(
      mapping.marketplaceAccountId,
      mapping,
      accountName,
      parsed.skus
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    defaults: DEFAULTS,
    accountMapping: ACCOUNT_FILE_MAP,
    accountResults: accountResults.map((r) => ({
      accountId: r.accountId,
      accountName: r.accountName,
      legalName: r.legalName,
      stopped: r.stopped,
      stopReason: r.stopReason ?? null,
      rateLimited: r.rateLimited ?? false,
      parsedCount: r.parsedCount,
      scopeNmIds: r.scopeSkus?.map((s) => s.nmId) ?? r.progress?.meta?.scopeNmIds,
      pilotSkuNmIds: r.pilotSkus?.map((s) => s.nmId) ?? r.progress?.meta?.pilotSkuNmIds,
      unionStart: r.unionStart,
      unionEnd: r.unionEnd,
      missingDayCount: r.missingDayCount,
      batchesPlanned: r.batchesPlanned,
      batchesRun: r.batchesRun,
      metrics: r.progress?.metrics,
    })),
    audits,
  };

  const outPath = resolve(
    "exports/damage-report",
    `backfill-report-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(
    resolve("exports/damage-report/backfill-report-latest.json"),
    JSON.stringify(report, null, 2)
  );

  console.log(`\nWrote ${outPath}`);
  for (const [aid, audit] of Object.entries(audits)) {
    console.log(`Account ${aid} summary:`, audit.summary);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
