#!/usr/bin/env node
/**
 * Sprint 6.44 — deep probe supplies list/details/goods.
 * Usage: npx tsx scripts/probe-wb-supplies-6-44.mjs [marketplaceAccountId]
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const { getMarketplaceAccountForSync } = await import(
  "../src/services/marketplace-account-service.ts"
);

const accountId = process.argv[2] ?? "2";
const out = [];
function log(msg) {
  console.log(msg);
  out.push(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

log(`Account ${accountId}`);
const account = await getMarketplaceAccountForSync(accountId);
const auth = { Authorization: account.apiKey, "Content-Type": "application/json" };

await sleep(2500);

async function postList(body) {
  const res = await fetch(
    "https://supplies-api.wildberries.ru/api/v1/supplies?limit=50&offset=0",
    { method: "POST", headers: auth, body: JSON.stringify(body) }
  );
  const text = await res.text();
  log(`LIST ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let supplies = await postList({
  statusIDs: [4, 5, 6],
  dates: [{ from: "2024-01-01", till: "2026-07-20", type: "factDate" }],
});

if (!Array.isArray(supplies) || supplies.length === 0) {
  await sleep(2500);
  supplies = await postList({
    dates: [{ from: "2024-01-01", till: "2026-07-20", type: "createDate" }],
  });
}

if (!Array.isArray(supplies) || supplies.length === 0) {
  await sleep(2500);
  supplies = await postList({});
}

if (!Array.isArray(supplies) || supplies.length === 0) {
  log("NO_SUPPLIES");
  writeFileSync("exports/probe-supplies-6-44.txt", out.join("\n"));
  process.exit(0);
}

log(`COUNT ${supplies.length}`);
const first = supplies[0];
log(`FIRST_KEYS ${Object.keys(first).join(",")}`);
log(`FIRST ${JSON.stringify(first)}`);

const id = first.supplyID ?? first.preorderID;
const isPreorder = first.supplyID == null;
log(`ID ${id} isPreorder=${isPreorder}`);

await sleep(2500);
{
  const res = await fetch(
    `https://supplies-api.wildberries.ru/api/v1/supplies/${id}?isPreorderID=${isPreorder}`,
    { headers: auth }
  );
  const text = await res.text();
  log(`DETAILS ${res.status}: ${text.slice(0, 900)}`);
}

await sleep(2500);
{
  const res = await fetch(
    `https://supplies-api.wildberries.ru/api/v1/supplies/${id}/goods?limit=100&offset=0&isPreorderID=${isPreorder}`,
    { headers: auth }
  );
  const text = await res.text();
  log(`GOODS ${res.status}: ${text.slice(0, 1200)}`);
}

writeFileSync(resolve("exports/probe-supplies-6-44.txt"), out.join("\n"), "utf8");
log("WROTE exports/probe-supplies-6-44.txt");
