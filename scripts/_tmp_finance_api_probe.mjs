/**
 * READ-ONLY API probe: why finance sync stopped.
 * Does NOT write to DB. Does NOT run syncFinance.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { getMarketplaceAccountForSync } = await import(
  "../src/services/marketplace-account-service.ts"
);

const ACCOUNT = "1";
const PERIODS = [
  { from: "2026-07-01", to: "2026-07-05", label: "known_good_window" },
  { from: "2026-07-06", to: "2026-07-12", label: "backfill_tail_after_max_op" },
  { from: "2026-07-13", to: "2026-07-19", label: "audit_week_missing" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probeV5(apiKey, from, to) {
  const params = new URLSearchParams({
    dateFrom: from,
    dateTo: to,
    limit: "1000",
    rrdid: "0",
  });
  const url = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?${params}`;
  const started = Date.now();
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  const text = await res.text();
  const ms = Date.now() - started;
  let parsed = null;
  let parseError = null;
  try {
    parsed = text.trim() ? JSON.parse(text) : [];
  } catch (e) {
    parseError = String(e?.message ?? e);
  }
  const rows = Array.isArray(parsed) ? parsed : null;
  const maxRrDt = rows?.length
    ? rows.map((r) => r.rr_dt ?? r.rrDt ?? null).filter(Boolean).sort().at(-1)
    : null;
  const maxSale = rows?.length
    ? rows.map((r) => String(r.sale_dt ?? r.saleDt ?? "").slice(0, 10)).filter(Boolean).sort().at(-1)
    : null;
  return {
    endpoint: "GET statistics-api .../api/v5/supplier/reportDetailByPeriod",
    from,
    to,
    status: res.status,
    statusText: res.statusText,
    ms,
    contentType: res.headers.get("content-type"),
    xRatelimitRemaining: res.headers.get("x-ratelimit-remaining"),
    retryAfter: res.headers.get("retry-after"),
    bodyBytes: text.length,
    bodyPreview: text.slice(0, 400),
    parseError,
    isArray: Array.isArray(parsed),
    rowCount: rows?.length ?? null,
    errorObject: parsed && !Array.isArray(parsed) ? parsed : null,
    sampleRrDtMax: maxRrDt,
    sampleSaleDtMax: maxSale,
    sampleRrdId: rows?.[0]?.rrd_id ?? rows?.[0]?.rrdId ?? null,
  };
}

async function probeV1(apiKey, from, to) {
  const url = "https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed";
  const body = {
    dateFrom: from,
    dateTo: to,
    limit: 1000,
    rrdId: 0,
    period: "daily",
  };
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  let parsed = null;
  let parseError = null;
  try {
    parsed = text.trim() ? JSON.parse(text) : null;
  } catch (e) {
    parseError = String(e?.message ?? e);
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.report)
        ? parsed.report
        : null;
  return {
    endpoint: "POST finance-api .../api/finance/v1/sales-reports/detailed",
    from,
    to,
    requestBody: body,
    status: res.status,
    statusText: res.statusText,
    ms,
    contentType: res.headers.get("content-type"),
    bodyBytes: text.length,
    bodyPreview: text.slice(0, 500),
    parseError,
    rowCount: rows?.length ?? null,
    topLevelKeys: parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed)
      : Array.isArray(parsed)
        ? ["(array)"]
        : null,
  };
}

const account = await getMarketplaceAccountForSync(ACCOUNT);
const results = {
  probedAt: new Date().toISOString(),
  accountId: ACCOUNT,
  accountName: account.accountName ?? account.account_name ?? null,
  syncEnabled: account.syncEnabled ?? account.sync_enabled ?? null,
  note: "Read-only probes. No DB writes.",
  v5: [],
  v1: [],
};

for (const p of PERIODS) {
  console.log("probe v5", p.label, p.from, p.to);
  results.v5.push({ label: p.label, ...(await probeV5(account.apiKey, p.from, p.to)) });
  await sleep(6000);
}

// One v1 probe for the audit week
console.log("probe v1 audit week");
results.v1.push({
  label: "audit_week_missing",
  ...(await probeV1(account.apiKey, "2026-07-13", "2026-07-19")),
});

writeFileSync(
  "exports/finance-sync-api-probe-evidence.json",
  JSON.stringify(results, null, 2)
);
console.log(JSON.stringify(results, null, 2));
