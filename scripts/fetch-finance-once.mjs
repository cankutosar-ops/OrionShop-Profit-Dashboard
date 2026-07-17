#!/usr/bin/env node
/** Temporary — single finance fetch with small limit to probe rate limit. */
import { writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

const FROM = "2026-06-30";
const TO = "2026-07-05";
const OUT = "exports/wb-raw-2026-06-30_2026-07-05/finance.json";
const ACCOUNT = "2";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnv();
  const account = await getMarketplaceAccountForSync(ACCOUNT);
  const all = [];
  let rrdid = 0;
  let page = 0;

  while (true) {
    page += 1;
    const params = new URLSearchParams({ dateFrom: FROM, dateTo: TO, limit: "500", rrdid: String(rrdid) });
    const url = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?${params}`;
    console.log(`GET page ${page} rrdid=${rrdid}`);

    let attempt = 0;
    let batch = null;
    while (attempt < 12) {
      attempt += 1;
      await sleep(3000);
      const res = await fetch(url, { headers: { Authorization: account.apiKey } });
      const text = await res.text();
      if (res.status === 429) {
        const wait = Math.min(120000, 15000 * attempt);
        console.log(`429 — wait ${wait / 1000}s (attempt ${attempt})`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
      batch = text.trim() ? JSON.parse(text) : [];
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1].rrd_id;
    if (last === rrdid) break;
    rrdid = last;
    await sleep(3000);
  }

  const envelope = {
    metadata: {
      endpointUrl: `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod`,
      method: "GET",
      requestParameters: { dateFrom: FROM, dateTo: TO, limit: "500 (paginated)", rrdid: "0 (paginated)" },
      accountId: ACCOUNT,
      dateRange: { from: FROM, to: TO },
      exportedAt: new Date().toISOString(),
      rowCount: all.length,
      paginationPages: page,
      apiVersion: "v5 (deprecated 2026-07-15)",
    },
    data: all,
  };

  await writeFile(resolve(OUT), JSON.stringify(envelope, null, 2), "utf8");
  console.log(`Wrote ${all.length} rows → ${OUT}`);
  const ids = [...new Set(all.map((r) => r.realizationreport_id))].sort((a, b) => a - b);
  console.log("report ids", ids);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
