#!/usr/bin/env node
/** Temporary — single finance API request, print headers + body, no retries. */
import { readFileSync } from "fs";
import { resolve } from "path";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const rrdid = process.argv[2] ?? "0";
const url = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=2026-06-30&dateTo=2026-07-05&limit=100000&rrdid=${rrdid}`;

const account = await getMarketplaceAccountForSync("2");
const res = await fetch(url, { headers: { Authorization: account.apiKey } });
const body = await res.text();

console.log(JSON.stringify({
  url,
  status: res.status,
  statusText: res.statusText,
  headers: Object.fromEntries(res.headers.entries()),
  retryAfter: res.headers.get("retry-after"),
  body,
}, null, 2));
