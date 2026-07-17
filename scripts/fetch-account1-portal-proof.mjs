#!/usr/bin/env node
/**
 * Fetch Account 1 (Wildberries Default) raw API data for portal proof window.
 * Usage: npx tsx scripts/fetch-account1-portal-proof.mjs
 */
import { mkdir, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

const ACCOUNT = "1";
const FROM = "2026-06-15";
const TO = "2026-07-11";
const OUT = "exports/wb-raw-account1-portal-proof";

const WB_STATISTICS = "https://statistics-api.wildberries.ru";
const WB_FINANCE = "https://finance-api.wildberries.ru";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, token, init = {}) {
  for (let attempt = 1; attempt <= 15; attempt++) {
    await sleep(attempt === 1 ? 500 : 5000);
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: token, "Content-Type": "application/json", ...init.headers },
    });
    const text = await res.text();
    if (res.status === 429) {
      console.log(`  429 — wait (attempt ${attempt})`);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    return text.trim() ? JSON.parse(text) : null;
  }
  throw new Error("Rate limit exceeded after retries");
}

async function fetchFinancePaginated(token) {
  const all = [];
  let rrdid = 0;
  let page = 0;
  while (true) {
    page += 1;
    const params = new URLSearchParams({ dateFrom: FROM, dateTo: TO, limit: "100000", rrdid: String(rrdid) });
    const url = `${WB_STATISTICS}/api/v5/supplier/reportDetailByPeriod?${params}`;
    console.log(`Finance page ${page} rrdid=${rrdid}`);
    const batch = await fetchWithRetry(url, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1].rrd_id;
    console.log(`  +${batch.length} rows (total ${all.length})`);
    if (last === rrdid) break;
    rrdid = last;
  }
  return all;
}

async function fetchSalesReportsList(token, period) {
  const body = { dateFrom: FROM, dateTo: TO, period, limit: 1000, offset: 0 };
  const url = `${WB_FINANCE}/api/finance/v1/sales-reports/list`;
  console.log(`Sales-reports/list period=${period}`);
  return fetchWithRetry(url, token, { method: "POST", body: JSON.stringify(body) });
}

async function fetchStatisticsPaginated(token, path, dateFrom) {
  const all = [];
  let cursor = dateFrom;
  let page = 0;
  while (true) {
    page += 1;
    const params = new URLSearchParams({ dateFrom: cursor, flag: "0" });
    const url = `${WB_STATISTICS}${path}?${params}`;
    console.log(`${path} page ${page} from=${cursor}`);
    const batch = await fetchWithRetry(url, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1].lastChangeDate;
    console.log(`  +${batch.length} (total ${all.length}) lastChange=${last}`);
    if (batch.length < 80000 && last === cursor) break;
    if (!last || last === cursor) break;
    cursor = last;
    if (page > 50) break;
  }
  return all;
}

async function main() {
  loadEnv();
  await mkdir(resolve(OUT), { recursive: true });
  const account = await getMarketplaceAccountForSync(ACCOUNT);
  console.log(`Account: ${account.displayName ?? ACCOUNT}`);

  const finance = await fetchFinancePaginated(account.apiKey);
  await writeFile(
    resolve(OUT, "finance.json"),
    JSON.stringify({ metadata: { accountId: ACCOUNT, from: FROM, to: TO, rowCount: finance.length }, data: finance }, null, 2)
  );

  const daily = await fetchSalesReportsList(account.apiKey, "daily");
  await writeFile(
    resolve(OUT, "sales-reports-list-daily.json"),
    JSON.stringify({ metadata: { accountId: ACCOUNT, from: FROM, to: TO }, data: daily }, null, 2)
  );

  const weekly = await fetchSalesReportsList(account.apiKey, "weekly");
  await writeFile(
    resolve(OUT, "sales-reports-list-weekly.json"),
    JSON.stringify({ metadata: { accountId: ACCOUNT, from: FROM, to: TO }, data: weekly }, null, 2)
  );

  const sales = await fetchStatisticsPaginated(account.apiKey, "/api/v1/supplier/sales", `${FROM}T00:00:00`);
  await writeFile(
    resolve(OUT, "sales.json"),
    JSON.stringify({ metadata: { accountId: ACCOUNT, from: FROM, to: TO, rowCount: sales.length }, data: sales }, null, 2)
  );

  const orders = await fetchStatisticsPaginated(account.apiKey, "/api/v1/supplier/orders", `${FROM}T00:00:00`);
  await writeFile(
    resolve(OUT, "orders.json"),
    JSON.stringify({ metadata: { accountId: ACCOUNT, from: FROM, to: TO, rowCount: orders.length }, data: orders }, null, 2)
  );

  console.log(`Done → ${OUT}/`);
  console.log(
    `Finance: ${finance.length}, daily: ${daily?.length ?? 0}, weekly: ${weekly?.length ?? 0}, sales: ${sales.length}, orders: ${orders.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
