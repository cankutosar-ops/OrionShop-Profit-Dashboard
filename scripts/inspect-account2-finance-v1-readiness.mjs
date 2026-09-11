#!/usr/bin/env node
/**
 * Read-only Account 2 Finance V1 readiness inspect.
 * Decodes JWT claims locally. Never prints the token. Never calls Wildberries.
 * Database: SELECT only.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function decodeJwtPayload(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return null;
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}

loadEnv();

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { decryptCredential } = await import("../src/lib/credentials/encryption.ts");
const { inspectWbTokenAccessClaims } = await import("../src/lib/wildberries/finance-v1.ts");

const sb = createAdminClient();

async function financeSnapshot(accountId) {
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

async function loadAccountSourceKeys(accountId) {
  const keys = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", accountId)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (row.source_key) keys.push(String(row.source_key));
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return keys;
}

function duplicateCount(keys) {
  const seen = new Map();
  let duplicates = 0;
  for (const key of keys) {
    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
    if (next === 2) duplicates += 1;
  }
  return { uniqueKeys: seen.size, duplicateKeyCount: duplicates };
}

const { data: account, error: accountError } = await sb
  .from("marketplace_accounts")
  .select("id, account_name, marketplace, sync_enabled, api_key_encrypted")
  .eq("id", "2")
  .maybeSingle();
if (accountError) throw accountError;
if (!account) throw new Error("Account 2 not found");

const encrypted = String(account.api_key_encrypted ?? "").trim();
if (!encrypted) throw new Error("Account 2 has no encrypted API key");

let claims;
try {
  const token = decryptCredential(encrypted);
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== "object") {
    throw new Error("JWT payload missing");
  }
  claims = inspectWbTokenAccessClaims(payload);
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      reason: err instanceof Error ? err.message : "token inspect failed",
      wildberriesHttp: 0,
    })
  );
  process.exit(2);
}

const [account2, account1, keys2, keys1] = await Promise.all([
  financeSnapshot("2"),
  financeSnapshot("1"),
  loadAccountSourceKeys("2"),
  loadAccountSourceKeys("1"),
]);

const dup2 = duplicateCount(keys2);
const dup1 = duplicateCount(keys1);
const set1 = new Set(keys1);
let crossAccountOverlap = 0;
for (const key of new Set(keys2)) {
  if (set1.has(key)) crossAccountOverlap += 1;
}

console.log(
  JSON.stringify(
    {
      wildberriesHttp: 0,
      dbWrites: 0,
      account2: {
        id: account.id,
        accountName: account.account_name,
        marketplace: account.marketplace,
        syncEnabled: account.sync_enabled,
        token: {
          type: claims.tokenType,
          acc: claims.acc,
          for: claims.for,
          t: claims.t,
          bitmaskS: claims.s,
          financeBit13: claims.hasFinanceCategory,
          statisticsBit5: claims.hasStatisticsCategory,
          financeV1Ready: claims.financeV1Ready,
          verdict: claims.financeV1Ready ? "READY" : "NOT READY — NEW TOKEN REQUIRED",
          financeBit13Proven:
            claims.hasFinanceCategory === true
              ? "YES"
              : claims.hasFinanceCategory === false
                ? "NO"
                : "NOT PROVEN",
        },
        finance: account2,
        sourceKeys: dup2,
      },
      account1: {
        finance: account1,
        sourceKeys: dup1,
      },
      crossAccountSourceKeyOverlap: crossAccountOverlap,
      uniqueIndexExpected: "idx_wb_finance_account_source_key / idx_wb_finance_account_source_key_atomic",
    },
    null,
    2
  )
);
