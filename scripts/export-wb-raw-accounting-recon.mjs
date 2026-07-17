#!/usr/bin/env node
/**
 * Temporary — export raw Wildberries API responses for accounting reconciliation.
 * Does NOT modify application data or sync pipelines.
 *
 * Usage:
 *   npx tsx scripts/export-wb-raw-accounting-recon.mjs [accountId] [from] [to] [outputDir]
 *
 * Default: account 1, 2026-06-18 → 2026-06-29, exports/wb-raw-2026-06-18_2026-06-29/
 */
import { mkdir, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
const WB_FINANCE_API = "https://finance-api.wildberries.ru";
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 4;
const RETRY_WAIT_MS = 65000;

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildEnvelope({ endpointUrl, method, requestParameters, accountId, dateRange, data, extra = {} }) {
  const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  return {
    metadata: {
      endpointUrl,
      method,
      requestParameters,
      accountId,
      dateRange,
      exportedAt: new Date().toISOString(),
      rowCount: rows,
      ...extra,
    },
    data,
  };
}

async function createRawClient(token) {
  let lastRequestAt = 0;

  async function request(baseUrl, path, init = {}) {
    let attempt = 0;

    while (true) {
      attempt += 1;
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < RATE_LIMIT_MS) await sleep(RATE_LIMIT_MS - elapsed);

      const url = `${baseUrl}${path}`;
      const method = init.method ?? "GET";
      console.log(`  ${method} ${url}${attempt > 1 ? ` (retry ${attempt})` : ""}`);

      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      lastRequestAt = Date.now();
      const text = await response.text();

      if (response.status === 429 && attempt < MAX_RETRIES) {
        console.log(`  … rate limited, waiting ${RETRY_WAIT_MS / 1000}s`);
        await sleep(RETRY_WAIT_MS);
        continue;
      }

      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        err.statusCode = response.status;
        err.url = url;
        err.body = text;
        throw err;
      }

      if (response.status === 204 || !text.trim()) {
        return [];
      }

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }

  return { request };
}

/** Statistics API: paginate by lastChangeDate from dateFrom (no dateTo on API). */
async function fetchStatisticsPaginated(client, path, dateFromIso) {
  const all = [];
  let cursor = dateFromIso;
  let page = 0;

  while (true) {
    page += 1;
    const params = new URLSearchParams({ dateFrom: cursor, flag: "0" });
    const url = `${WB_STATISTICS_API}${path}?${params.toString()}`;
    const batch = await client.request(WB_STATISTICS_API, `${path}?${params.toString()}`);

    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    cursor = batch[batch.length - 1].lastChangeDate;
    if (batch.length < 80000) break;
  }

  return { rows: all, pages: page, dateFromCursor: dateFromIso };
}

/** v5 reportDetailByPeriod — full pagination by rrd_id. */
async function fetchReportDetailByPeriod(client, dateFrom, dateTo) {
  const all = [];
  let rrdid = 0;
  let page = 0;

  while (true) {
    page += 1;
    const params = new URLSearchParams({
      dateFrom,
      dateTo,
      limit: "100000",
      rrdid: String(rrdid),
    });
    const batch = await client.request(
      WB_STATISTICS_API,
      `/api/v5/supplier/reportDetailByPeriod?${params.toString()}`
    );

    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    const lastRrd = batch[batch.length - 1].rrd_id;
    if (lastRrd === rrdid) break;
    rrdid = lastRrd;
  }

  return { rows: all, pages: page };
}

/** Finance API v1 sales-reports/detailed — paginate by rrdId. */
async function fetchSalesReportsDetailedV1(client, dateFrom, dateTo, period) {
  const all = [];
  let rrdId = 0;
  let page = 0;

  while (true) {
    page += 1;
    const body = { dateFrom, dateTo, period, limit: 100000, rrdId };
    const batch = await client.request(WB_FINANCE_API, "/api/finance/v1/sales-reports/detailed", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    const last = batch[batch.length - 1]?.rrdId ?? batch[batch.length - 1]?.rrd_id;
    if (last == null || last === rrdId) break;
    rrdId = last;
  }

  return { rows: all, pages: page, period };
}

/** Finance API v1 sales-reports/list — offset pagination. */
async function fetchSalesReportsList(client, dateFrom, dateTo, period) {
  const all = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const body = { dateFrom, dateTo, period, limit, offset };
    const batch = await client.request(WB_FINANCE_API, "/api/finance/v1/sales-reports/list", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return { rows: all, period };
}

async function writeExport(outputDir, filename, envelope) {
  const path = join(outputDir, filename);
  await writeFile(path, JSON.stringify(envelope, null, 2), "utf8");
  console.log(`  ✓ ${filename} (${envelope.metadata.rowCount} rows)`);
  return path;
}

async function tryExport(outputDir, filename, buildEnvelopeFn, context) {
  try {
    const envelope = await buildEnvelopeFn();
    await writeExport(outputDir, filename, envelope);
    return { ok: true, filename };
  } catch (error) {
    const envelope = {
      metadata: {
        endpointUrl: error.url ?? "unknown",
        method: context?.method ?? "unknown",
        requestParameters: context?.requestParameters ?? {},
        accountId: context?.accountId,
        dateRange: context?.dateRange,
        exportedAt: new Date().toISOString(),
        rowCount: 0,
        error: error.message,
        statusCode: error.statusCode ?? null,
        responseBodyPreview: typeof error.body === "string" ? error.body.slice(0, 2000) : null,
      },
      data: null,
    };
    await writeExport(outputDir, filename, envelope);
    console.log(`  ⚠ ${filename} — API error recorded in file`);
    return { ok: false, filename, error: error.message };
  }
}

async function main() {
  loadEnv();

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const accountId = positional[0] ?? "1";
  const from = positional[1] ?? "2026-06-18";
  const to = positional[2] ?? "2026-06-29";
  const outputDir =
    positional[3] ?? join(process.cwd(), "exports", `wb-raw-${from}_${to}`);
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyFiles = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()) : null;
  const shouldRun = (filename) => !onlyFiles || onlyFiles.includes(filename);

  const dateRange = { from, to };
  console.log(`WB raw export — account ${accountId} | ${from} → ${to}`);
  if (onlyFiles) console.log(`Partial export: ${onlyFiles.join(", ")}`);
  console.log(`Output: ${outputDir}\n`);

  const account = await getMarketplaceAccountForSync(accountId);
  const client = await createRawClient(account.apiKey);
  await mkdir(outputDir, { recursive: true });

  const statisticsDateFrom = `${from}T00:00:00`;
  const results = [];
  const ctx = { accountId, dateRange };

  // 1. Orders API
  if (shouldRun("orders.json")) {
  results.push(
    await tryExport(outputDir, "orders.json", async () => {
      const { rows, pages } = await fetchStatisticsPaginated(
        client,
        "/api/v1/supplier/orders",
        statisticsDateFrom
      );
      return buildEnvelope({
        endpointUrl: `${WB_STATISTICS_API}/api/v1/supplier/orders`,
        method: "GET",
        requestParameters: { dateFrom: statisticsDateFrom, flag: "0", pagination: "lastChangeDate" },
        accountId,
        dateRange,
        data: rows,
        extra: {
          note:
            "Statistics API has no dateTo. Full paginated response from dateFrom cursor. No client-side filtering applied.",
          paginationPages: pages,
        },
      });
    }, { ...ctx, method: "GET", requestParameters: { dateFrom: statisticsDateFrom, flag: "0" } })
  );
  }

  // 2. Sales API
  if (shouldRun("sales.json")) {
  results.push(
    await tryExport(outputDir, "sales.json", async () => {
      const { rows, pages } = await fetchStatisticsPaginated(
        client,
        "/api/v1/supplier/sales",
        statisticsDateFrom
      );
      return buildEnvelope({
        endpointUrl: `${WB_STATISTICS_API}/api/v1/supplier/sales`,
        method: "GET",
        requestParameters: { dateFrom: statisticsDateFrom, flag: "0", pagination: "lastChangeDate" },
        accountId,
        dateRange,
        data: rows,
        extra: {
          note:
            "Statistics API has no dateTo. Full paginated response from dateFrom cursor. No client-side filtering applied.",
          paginationPages: pages,
        },
      });
    }, { ...ctx, method: "GET", requestParameters: { dateFrom: statisticsDateFrom, flag: "0" } })
  );
  }

  // 3. Financial report v5 (reportDetailByPeriod) — finance.json
  if (shouldRun("finance.json")) {
  results.push(
    await tryExport(outputDir, "finance.json", async () => {
      const { rows, pages } = await fetchReportDetailByPeriod(client, from, to);
      return buildEnvelope({
        endpointUrl: `${WB_STATISTICS_API}/api/v5/supplier/reportDetailByPeriod`,
        method: "GET",
        requestParameters: { dateFrom: from, dateTo: to, limit: "100000", rrdid: "0 (paginated)" },
        accountId,
        dateRange,
        data: rows,
        extra: { paginationPages: pages, apiVersion: "v5 (deprecated 2026-07-15)" },
      });
    }, { ...ctx, method: "GET", requestParameters: { dateFrom: from, dateTo: to } })
  );
  }

  // 4. Settlement — sales reports list (weekly)
  if (shouldRun("sales-reports-list-weekly.json")) {
  results.push(
    await tryExport(outputDir, "sales-reports-list-weekly.json", async () => {
      const { rows, period } = await fetchSalesReportsList(client, from, to, "weekly");
      return buildEnvelope({
        endpointUrl: `${WB_FINANCE_API}/api/finance/v1/sales-reports/list`,
        method: "POST",
        requestParameters: { dateFrom: from, dateTo: to, period, limit: 1000, offset: 0 },
        accountId,
        dateRange,
        data: rows,
        extra: { description: "Weekly realization report summaries incl. bankPaymentSum" },
      });
    }, { ...ctx, method: "POST", requestParameters: { dateFrom: from, dateTo: to, period: "weekly" } })
  );
  }

  // 4b. Settlement — sales reports list (daily)
  if (shouldRun("sales-reports-list-daily.json")) {
  results.push(
    await tryExport(outputDir, "sales-reports-list-daily.json", async () => {
      const { rows, period } = await fetchSalesReportsList(client, from, to, "daily");
      return buildEnvelope({
        endpointUrl: `${WB_FINANCE_API}/api/finance/v1/sales-reports/list`,
        method: "POST",
        requestParameters: { dateFrom: from, dateTo: to, period, limit: 1000, offset: 0 },
        accountId,
        dateRange,
        data: rows,
        extra: { description: "Daily realization report summaries incl. bankPaymentSum" },
      });
    }, { ...ctx, method: "POST", requestParameters: { dateFrom: from, dateTo: to, period: "daily" } })
  );
  }

  // 4c. Finance v1 detailed (parallel to v5)
  if (shouldRun("sales-reports-detailed-v1-weekly.json")) {
  results.push(
    await tryExport(outputDir, "sales-reports-detailed-v1-weekly.json", async () => {
      const { rows, pages, period } = await fetchSalesReportsDetailedV1(client, from, to, "weekly");
      return buildEnvelope({
        endpointUrl: `${WB_FINANCE_API}/api/finance/v1/sales-reports/detailed`,
        method: "POST",
        requestParameters: {
          dateFrom: from,
          dateTo: to,
          period: "weekly",
          limit: 100000,
          rrdId: 0,
        },
        accountId,
        dateRange,
        data: rows,
        extra: { paginationPages: pages, apiVersion: "v1" },
      });
    }, { ...ctx, method: "POST", requestParameters: { dateFrom: from, dateTo: to, period: "weekly" } })
  );
  }

  // 4d. Account balance snapshot (point-in-time, not period-filtered)
  if (shouldRun("account-balance.json")) {
  results.push(
    await tryExport(outputDir, "account-balance.json", async () => {
      const data = await client.request(WB_FINANCE_API, "/api/v1/account/balance");
      return buildEnvelope({
        endpointUrl: `${WB_FINANCE_API}/api/v1/account/balance`,
        method: "GET",
        requestParameters: {},
        accountId,
        dateRange,
        data,
        extra: {
          note: "Point-in-time balance snapshot at export time; not filtered by date range.",
        },
      });
    }, { ...ctx, method: "GET", requestParameters: {} })
  );
  }

  // Manifest
  const manifest = {
    accountId,
    accountName: account.account_name,
    dateRange,
    exportedAt: new Date().toISOString(),
    outputDir,
    files: results,
    notes: [
      "Raw API responses only — no transformations, filtering, or field mapping.",
      "orders.json and sales.json: Statistics API paginates from dateFrom; may include rows with dates outside the requested range.",
      "finance.json: reportDetailByPeriod filtered by dateFrom/dateTo on WB side.",
      "Settlement files use Finance API v1 (Personal/Service token with Finance scope).",
    ],
  };

  await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\n✓ Export complete → ${outputDir}`);
  console.log(`  manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
