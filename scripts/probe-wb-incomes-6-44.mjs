#!/usr/bin/env node
/**
 * Sprint 6.44 — probe WB incomes / supplies endpoints.
 * Usage: npx tsx scripts/probe-wb-incomes-6-44.mjs [marketplaceAccountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Supabase not configured");
  process.exit(1);
}

const sb = createClient(url, key);
let accountId = process.argv[2];

if (!accountId) {
  const { data: accounts, error } = await sb
    .from("marketplace_accounts")
    .select("id, account_name, marketplace, is_active")
    .eq("marketplace", "wildberries")
    .eq("is_active", true)
    .limit(5);
  if (error || !accounts?.length) {
    console.error("No WB accounts:", error?.message);
    process.exit(1);
  }
  console.log("Accounts:");
  for (const a of accounts) console.log(`  ${a.id}  ${a.account_name}`);
  accountId = String(accounts[0].id);
}

console.log(`\nProbing for account ${accountId}`);
const account = await getMarketplaceAccountForSync(accountId);
const auth = { Authorization: account.apiKey, "Content-Type": "application/json" };

const probes = [
  {
    name: "stats incomes (flag=0)",
    method: "GET",
    url: "https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=2024-01-01&flag=0",
  },
  {
    name: "stats incomes (no flag)",
    method: "GET",
    url: "https://statistics-api.wildberries.ru/api/v1/supplier/incomes?dateFrom=2024-01-01",
  },
  {
    name: "legacy suppliers-stats incomes",
    method: "GET",
    url: "https://suppliers-stats.wildberries.ru/api/v1/supplier/incomes?dateFrom=2024-01-01",
  },
  {
    name: "stats stocks control",
    method: "GET",
    url: "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2019-01-01&flag=0",
  },
  {
    name: "supplies-api warehouses",
    method: "GET",
    url: "https://supplies-api.wildberries.ru/api/v1/warehouses",
  },
  {
    name: "supplies-api list (POST)",
    method: "POST",
    url: "https://supplies-api.wildberries.ru/api/v1/supplies?limit=20&offset=0",
    body: {
      statusIDs: [4, 5],
      dates: [
        {
          from: "2024-01-01T00:00:00Z",
          till: "2026-07-20T23:59:59Z",
          type: "factDate",
        },
      ],
    },
  },
  {
    name: "supplies-api list empty body",
    method: "POST",
    url: "https://supplies-api.wildberries.ru/api/v1/supplies?limit=20&offset=0",
    body: {},
  },
];

for (const probe of probes) {
  const started = Date.now();
  try {
    const res = await fetch(probe.url, {
      method: probe.method,
      headers: auth,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    });
    const text = await res.text();
    const ms = Date.now() - started;
    let preview = text.slice(0, 280).replace(/\s+/g, " ");
    let count = null;
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) count = json.length;
      else if (json && typeof json === "object") preview = JSON.stringify(json).slice(0, 280);
    } catch {
      /* keep text preview */
    }
    console.log(`\n[${probe.name}] ${probe.method} → HTTP ${res.status} (${ms}ms)`);
    if (count !== null) console.log(`  array length: ${count}`);
    console.log(`  ${preview}`);
  } catch (err) {
    console.log(`\n[${probe.name}] ERROR: ${err instanceof Error ? err.message : err}`);
  }
}
