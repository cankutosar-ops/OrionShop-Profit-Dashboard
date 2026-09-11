#!/usr/bin/env node
/**
 * Read-only Account 1/2 Finance + JWT claim audit.
 * Never prints tokens. Never writes DB/progress. Never calls Wildberries.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && process.env[t.slice(0, i).trim()] == null) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}

function decodeJwtPayload(token) {
  const parts = String(token).split(".");
  if (parts.length < 2) throw new Error("JWT does not have a payload segment");
  const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return JSON.parse(Buffer.from(padded + pad, "base64").toString("utf8"));
}

loadEnv();

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { decryptCredential } = await import("../src/lib/credentials/encryption.ts");
const { inspectWbTokenAccessClaims } = await import("../src/lib/wildberries/finance-v1.ts");

const sb = createAdminClient();

const { data: accounts, error: accountError } = await sb
  .from("marketplace_accounts")
  .select("id, account_name, api_key_encrypted")
  .in("id", ["1", "2"]);
if (accountError) throw accountError;

const claims = [];
for (const row of accounts ?? []) {
  const encrypted = row.api_key_encrypted?.trim();
  if (!encrypted) {
    claims.push({ accountId: String(row.id), error: "no_encrypted_key" });
    continue;
  }
  const token = decryptCredential(encrypted);
  const payload = decodeJwtPayload(token);
  const inspected = inspectWbTokenAccessClaims(payload);
  claims.push({
    accountId: String(row.id),
    accountName: row.account_name ?? null,
    rawKeys: Object.keys(payload).sort(),
    hasForField: Object.prototype.hasOwnProperty.call(payload, "for"),
    ...inspected,
    financeCategory: inspected.hasFinanceCategory === null ? "NOT PROVEN" : inspected.hasFinanceCategory,
    statisticsCategory:
      inspected.hasStatisticsCategory === null ? "NOT PROVEN" : inspected.hasStatisticsCategory,
    v1Verdict: inspected.financeV1Ready ? "READY" : "NOT READY — NEW TOKEN REQUIRED",
  });
}

async function snapshot(accountId) {
  const { count, error: countError } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  if (countError) throw countError;

  const { data: maxRow, error: maxError } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;

  const { data: minRow, error: minError } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (minError) throw minError;

  return {
    accountId,
    rowCount: count ?? 0,
    minOperationDate: minRow?.operation_date ? String(minRow.operation_date).slice(0, 10) : null,
    maxOperationDate: maxRow?.operation_date ? String(maxRow.operation_date).slice(0, 10) : null,
  };
}

const [account1, account2] = await Promise.all([snapshot("1"), snapshot("2")]);

async function loadSourceKeys(accountId) {
  const keys = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", accountId)
      .not("source_key", "is", null)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) keys.push(String(row.source_key));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return keys;
}

const [keys1, keys2] = await Promise.all([loadSourceKeys("1"), loadSourceKeys("2")]);
function duplicateCount(keys) {
  const seen = new Map();
  let dups = 0;
  for (const key of keys) {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 2) dups += 1;
  }
  return { unique: seen.size, duplicates: dups };
}
const d1 = duplicateCount(keys1);
const d2 = duplicateCount(keys2);
const set1 = new Set(keys1);
let overlap = 0;
for (const key of new Set(keys2)) {
  if (set1.has(key)) overlap += 1;
}

console.log(
  JSON.stringify(
    {
      tokenClaims: claims,
      financeSnapshots: { account1, account2 },
      sourceKeyUniques: {
        account1: d1,
        account2: d2,
      },
      crossAccountSourceKeyOverlap: overlap,
    },
    null,
    2
  )
);
