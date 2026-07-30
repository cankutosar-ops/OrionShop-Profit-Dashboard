#!/usr/bin/env node
/**
 * One-time Historical Inventory Recovery (preservation only).
 *
 * - Downloads STOCK_HISTORY_DAILY_CSV for every WB marketplace account
 * - Archives per-day: raw.csv, inventory.xlsx, summary.json
 * - NO database writes, NO app/production changes
 *
 * Usage: npx tsx scripts/recover-historical-inventory.mjs
 */
import { createHash, randomUUID } from "crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
} from "fs";
import { resolve, join } from "path";
import { execFileSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const BASE = "https://seller-analytics-api.wildberries.ru";
const ROOT = resolve(process.cwd(), "exports/historical-inventory");
const START = "2026-07-17";
/** Inclusive end date (Moscow calendar "today" from env or local). */
const END = process.env.RECOVERY_END_DATE || formatDateLocal(new Date());

function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function parseWbDateHeader(h) {
  // DD.MM.YYYY → YYYY-MM-DD
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(h).trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toWbDateHeader(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function eachIsoDay(startIso, endIso) {
  const out = [];
  const cur = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function detectSep(headerLine) {
  return headerLine.includes(";") ? ";" : ",";
}

function splitCsvLine(line, sep) {
  if (sep === ";") {
    return line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
  }
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseWideCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [], dateCols: [], sep: "," };
  const sep = detectSep(lines[0]);
  const headers = splitCsvLine(lines[0], sep);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
  const dateCols = headers.filter((h) => parseWbDateHeader(h));
  return { headers, rows, dateCols, sep };
}

function unzipViaPowerShell(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "pipe" }
  );
  return readdirSync(destDir)
    .filter((n) => n.toLowerCase().endsWith(".csv"))
    .map((n) => ({ name: n, path: join(destDir, n) }));
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeDayCsv(path, records) {
  const header = [
    "Snapshot Date",
    "Warehouse",
    "Seller SKU",
    "WB SKU (NmID)",
    "Size",
    "ChrtID",
    "Quantity",
  ];
  const lines = [header.join(",")];
  for (const r of records) {
    lines.push(
      [
        r.snapshotDate,
        r.warehouse,
        r.sellerSku,
        r.nmId,
        r.size,
        r.chrtId,
        r.quantity,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(path, lines.join("\n"), "utf8");
}

async function writeDayExcel(path, records) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Orion Historical Inventory Recovery";
  wb.created = new Date();
  const ws = wb.addWorksheet("Inventory");
  ws.columns = [
    { header: "Snapshot Date", key: "snapshotDate", width: 14 },
    { header: "Warehouse", key: "warehouse", width: 28 },
    { header: "Seller SKU", key: "sellerSku", width: 22 },
    { header: "WB SKU (NmID)", key: "nmId", width: 14 },
    { header: "Size", key: "size", width: 12 },
    { header: "Quantity", key: "quantity", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of records) {
    ws.addRow({
      snapshotDate: r.snapshotDate,
      warehouse: r.warehouse,
      sellerSku: r.sellerSku,
      nmId: r.nmId,
      size: r.size,
      quantity: r.quantity,
    });
  }
  await wb.xlsx.writeFile(path);
}

function buildSummary(snapshotDate, records, validation) {
  const warehouseTotalsMap = new Map();
  const skuSet = new Set();
  const skuSizeSet = new Set();
  const skuQty = new Map();

  let totalQty = 0;
  for (const r of records) {
    totalQty += r.quantity;
    warehouseTotalsMap.set(r.warehouse, (warehouseTotalsMap.get(r.warehouse) || 0) + r.quantity);
    skuSet.add(String(r.nmId));
    skuSizeSet.add(`${r.nmId}|${r.size}|${r.chrtId}`);
    const skuKey = `${r.sellerSku || r.nmId}|${r.nmId}`;
    skuQty.set(skuKey, (skuQty.get(skuKey) || 0) + r.quantity);
  }

  const warehouseTotals = [...warehouseTotalsMap.entries()]
    .map(([warehouse, quantity]) => ({ warehouse, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.warehouse.localeCompare(b.warehouse, "ru"));

  const top100Skus = [...skuQty.entries()]
    .map(([key, quantity]) => {
      const [sellerSku, nmId] = key.split("|");
      return { sellerSku, nmId, quantity };
    })
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 100);

  return {
    snapshotDate,
    totalQuantity: totalQty,
    warehouseCount: warehouseTotalsMap.size,
    warehouseTotals,
    skuCount: skuSet.size,
    skuSizeCount: skuSizeSet.size,
    recordCount: records.length,
    top100Skus,
    validation,
  };
}

function validateRecords(records) {
  const errors = [];
  const keySet = new Set();
  let dupes = 0;
  for (const r of records) {
    const key = `${r.warehouse}|${r.sellerSku}|${r.nmId}|${r.size}|${r.chrtId}`;
    if (keySet.has(key)) dupes += 1;
    else keySet.add(key);
    if (!r.warehouse) errors.push("empty warehouse");
    if (r.nmId == null || r.nmId === "") errors.push("empty nmId");
    if (r.size == null || r.size === "") errors.push("empty size");
    if (typeof r.quantity !== "number" || Number.isNaN(r.quantity)) errors.push("non-numeric quantity");
  }
  return {
    ok: dupes === 0 && errors.length === 0,
    duplicateWarehouseSkuSize: dupes,
    emptyWarehouse: records.filter((r) => !r.warehouse).length,
    emptySku: records.filter((r) => r.nmId == null || r.nmId === "").length,
    emptySize: records.filter((r) => !r.size).length,
    nonNumericQuantity: records.filter(
      (r) => typeof r.quantity !== "number" || Number.isNaN(r.quantity)
    ).length,
    sampleErrors: [...new Set(errors)].slice(0, 10),
  };
}

function sortRecords(records) {
  return records.sort((a, b) => {
    const w = a.warehouse.localeCompare(b.warehouse, "ru");
    if (w) return w;
    const s = String(a.sellerSku).localeCompare(String(b.sellerSku), "ru");
    if (s) return s;
    return String(a.size).localeCompare(String(b.size), "ru");
  });
}

function rowsForDate(parsed, dateIso) {
  const header = toWbDateHeader(dateIso);
  const idx = Object.fromEntries(parsed.headers.map((h, i) => [h, i]));
  const dateIdx = idx[header];
  if (dateIdx == null) return null;

  const records = [];
  for (const row of parsed.rows) {
    const qtyRaw = row[dateIdx];
    const quantity = Number(String(qtyRaw ?? "0").replace(",", ".").replace(/\s/g, "")) || 0;
    records.push({
      snapshotDate: dateIso,
      warehouse: row[idx.OfficeName] ?? "",
      sellerSku: row[idx.VendorCode] ?? "",
      nmId: row[idx.NmID] ?? "",
      size: row[idx.SizeName] ?? "",
      chrtId: row[idx.ChrtID] ?? "",
      quantity,
    });
  }
  return sortRecords(records);
}

async function downloadStockHistoryDaily({ apiKey, start, end, label }) {
  const reportId = randomUUID();
  const body = {
    id: reportId,
    reportType: "STOCK_HISTORY_DAILY_CSV",
    userReportName: `Orion-hist-recovery-${label}-${start}_${end}`,
    params: {
      currentPeriod: { start, end },
      stockType: "wb",
      skipDeletedNm: false,
    },
  };

  const createRes = await fetch(`${BASE}/api/v2/nm-report/downloads`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const createText = await createRes.text();
  if (createRes.status >= 400) {
    throw new Error(`Create failed HTTP ${createRes.status}: ${createText.slice(0, 400)}`);
  }

  let meta = null;
  for (let attempt = 1; attempt <= 60; attempt++) {
    await sleep(attempt === 1 ? 12_000 : 20_000);
    const listRes = await fetch(
      `${BASE}/api/v2/nm-report/downloads?filter[downloadIds]=${reportId}`,
      { headers: { Authorization: apiKey } }
    );
    const listText = await listRes.text();
    let parsed;
    try {
      parsed = JSON.parse(listText);
    } catch {
      continue;
    }
    const rows = Array.isArray(parsed?.data) ? parsed.data : [];
    meta = rows.find((r) => r.id === reportId) ?? rows[0] ?? null;
    const status = meta?.status;
    console.log(`  poll ${attempt}: ${status}`);
    if (status === "SUCCESS") break;
    if (status === "FAILED") {
      throw new Error(`Report FAILED: ${JSON.stringify(meta)}`);
    }
  }
  if (meta?.status !== "SUCCESS") {
    throw new Error(`Report not ready: ${JSON.stringify(meta)}`);
  }

  await sleep(3_000);
  const fileRes = await fetch(`${BASE}/api/v2/nm-report/downloads/file/${reportId}`, {
    headers: { Authorization: apiKey },
  });
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (fileRes.status >= 400 || buf.length < 20) {
    throw new Error(`Download failed HTTP ${fileRes.status}: ${buf.toString("utf8").slice(0, 300)}`);
  }

  return { reportId, body, meta, zipBuffer: buf, zipSha256: sha256(buf) };
}

async function recoverAccount(account) {
  const accountDir = join(ROOT, `account-${account.id}`);
  const sourceDir = join(accountDir, "_source");
  mkdirSync(sourceDir, { recursive: true });

  console.log(`\n=== Account ${account.id} (${account.account_name}) ${START} → ${END} ===`);

  const expectedDays = eachIsoDay(START, END);
  const accountReport = {
    accountId: String(account.id),
    accountName: account.account_name,
    start: START,
    end: END,
    expectedDays,
    recoveredDays: [],
    missingDates: [],
    downloadFailures: [],
    files: [],
    totals: {
      inventoryRecords: 0,
      warehouses: new Set(),
      skus: new Set(),
      skuSizes: new Set(),
    },
  };

  let download;
  try {
    download = await downloadStockHistoryDaily({
      apiKey: account.apiKey,
      start: START,
      end: END,
      label: String(account.id),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  DOWNLOAD FAILED: ${msg}`);
    accountReport.downloadFailures.push({ phase: "range-download", error: msg });
    accountReport.missingDates = [...expectedDays];
    return accountReport;
  }

  const zipPath = join(sourceDir, `STOCK_HISTORY_DAILY_${download.reportId}.zip`);
  writeFileSync(zipPath, download.zipBuffer);
  writeFileSync(
    join(sourceDir, "request.json"),
    JSON.stringify(
      {
        reportId: download.reportId,
        request: download.body,
        meta: download.meta,
        zipSha256: download.zipSha256,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const extractDir = join(sourceDir, `extracted-${download.reportId}`);
  const csvFiles = unzipViaPowerShell(zipPath, extractDir);
  if (!csvFiles.length) {
    accountReport.downloadFailures.push({ phase: "unzip", error: "No CSV in ZIP" });
    accountReport.missingDates = [...expectedDays];
    return accountReport;
  }

  const wideCsvPath = csvFiles[0].path;
  const wideText = readFileSync(wideCsvPath, "utf8");
  const wideCopy = join(sourceDir, "STOCK_HISTORY_DAILY_wide.csv");
  copyFileSync(wideCsvPath, wideCopy);
  writeFileSync(
    join(sourceDir, "wide-sha256.txt"),
    sha256(Buffer.from(wideText, "utf8"))
  );

  const parsed = parseWideCsv(wideText);
  const availableIso = new Set(parsed.dateCols.map(parseWbDateHeader).filter(Boolean));
  console.log(`  CSV dates: ${[...availableIso].sort().join(", ")}`);
  console.log(`  Wide rows: ${parsed.rows.length}`);

  for (const day of expectedDays) {
    const dayDir = join(accountDir, day);
    mkdirSync(dayDir, { recursive: true });

    if (!availableIso.has(day)) {
      console.warn(`  MISSING date column: ${day}`);
      accountReport.missingDates.push(day);
      writeFileSync(
        join(dayDir, "summary.json"),
        JSON.stringify(
          {
            snapshotDate: day,
            error: "Date column missing from STOCK_HISTORY_DAILY_CSV",
            availableDates: [...availableIso].sort(),
          },
          null,
          2
        )
      );
      continue;
    }

    const records = rowsForDate(parsed, day);
    const validation = validateRecords(records);
    const summary = buildSummary(day, records, validation);

    writeDayCsv(join(dayDir, "raw.csv"), records);
    await writeDayExcel(join(dayDir, "inventory.xlsx"), records);
    writeFileSync(join(dayDir, "summary.json"), JSON.stringify(summary, null, 2));

    // Also keep a pointer to the immutable wide source for this day
    writeFileSync(
      join(dayDir, "source-ref.json"),
      JSON.stringify(
        {
          reportId: download.reportId,
          zipSha256: download.zipSha256,
          wideCsvRelative: `_source/STOCK_HISTORY_DAILY_wide.csv`,
          dateColumn: toWbDateHeader(day),
        },
        null,
        2
      )
    );

    accountReport.recoveredDays.push(day);
    accountReport.files.push(
      `account-${account.id}/${day}/raw.csv`,
      `account-${account.id}/${day}/inventory.xlsx`,
      `account-${account.id}/${day}/summary.json`
    );
    accountReport.totals.inventoryRecords += records.length;
    for (const r of records) {
      accountReport.totals.warehouses.add(r.warehouse);
      accountReport.totals.skus.add(String(r.nmId));
      accountReport.totals.skuSizes.add(`${r.nmId}|${r.size}`);
    }

    console.log(
      `  ${day}: records=${records.length} qty=${summary.totalQuantity} warehouses=${summary.warehouseCount} valid=${validation.ok}`
    );
  }

  // Serialize Sets for JSON
  accountReport.totals = {
    inventoryRecords: accountReport.totals.inventoryRecords,
    warehouseCount: accountReport.totals.warehouses.size,
    warehouses: [...accountReport.totals.warehouses].sort((a, b) => a.localeCompare(b, "ru")),
    skuCount: accountReport.totals.skus.size,
    skuSizeCount: accountReport.totals.skuSizes.size,
  };

  writeFileSync(join(accountDir, "account-report.json"), JSON.stringify(accountReport, null, 2));
  return accountReport;
}

async function main() {
  mkdirSync(ROOT, { recursive: true });

  const { getMarketplaceAccountForSync } = await import(
    "../src/services/marketplace-account-service.ts"
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const sb = createClient(url, key);
  const { data: accountsRaw, error } = await sb
    .from("marketplace_accounts")
    .select("id, account_name, marketplace, is_active")
    .eq("marketplace", "wildberries")
    .eq("is_active", true)
    .order("id");

  // Preserve real seller accounts only (skip local verify-flow fixtures).
  const accounts = (accountsRaw || []).filter(
    (a) => !/verify\s*flow\s*test/i.test(String(a.account_name || ""))
  );

  if (error || !accounts?.length) {
    console.error("No active WB accounts:", error?.message);
    process.exit(1);
  }

  console.log(`Recovery window: ${START} → ${END}`);
  console.log(
    `Accounts: ${accounts.map((a) => `${a.id}:${a.account_name}`).join(", ")}`
  );

  const finalReport = {
    startedAt: new Date().toISOString(),
    start: START,
    end: END,
    accounts: [],
    recoveredDays: [],
    recoveredFiles: [],
    totalInventoryRecords: 0,
    warehouses: [],
    skuCount: 0,
    skuSizeCount: 0,
    missingDates: [],
    downloadFailures: [],
  };

  const allWarehouses = new Set();
  const allSkus = new Set();
  const allSkuSizes = new Set();

  for (let i = 0; i < accounts.length; i++) {
    if (i > 0) {
      console.log("Waiting 25s between accounts (rate limit)...");
      await sleep(25_000);
    }
    const syncAccount = await getMarketplaceAccountForSync(String(accounts[i].id));
    const report = await recoverAccount({
      id: accounts[i].id,
      account_name: accounts[i].account_name,
      apiKey: syncAccount.apiKey,
    });

    finalReport.accounts.push({
      accountId: report.accountId,
      accountName: report.accountName,
      recoveredDays: report.recoveredDays,
      missingDates: report.missingDates,
      downloadFailures: report.downloadFailures,
      totals: report.totals,
    });
    finalReport.recoveredDays.push(
      ...report.recoveredDays.map((d) => ({ accountId: report.accountId, date: d }))
    );
    finalReport.recoveredFiles.push(...report.files);
    finalReport.totalInventoryRecords += report.totals.inventoryRecords || 0;
    finalReport.missingDates.push(
      ...report.missingDates.map((d) => ({ accountId: report.accountId, date: d }))
    );
    finalReport.downloadFailures.push(
      ...report.downloadFailures.map((f) => ({ accountId: report.accountId, ...f }))
    );
    for (const w of report.totals.warehouses || []) allWarehouses.add(w);
    // sku sets only on account totals as counts — rebuild from account reports if needed
    if (report.totals.skuCount) {
      /* counts aggregated below from account reports */
    }
  }

  // Aggregate SKU counts as sum of unique per account (not cross-account unique — report both)
  finalReport.warehouses = [...allWarehouses].sort((a, b) => a.localeCompare(b, "ru"));
  finalReport.warehouseCount = finalReport.warehouses.length;
  finalReport.skuCount = finalReport.accounts.reduce((s, a) => s + (a.totals?.skuCount || 0), 0);
  finalReport.skuSizeCount = finalReport.accounts.reduce(
    (s, a) => s + (a.totals?.skuSizeCount || 0),
    0
  );
  finalReport.finishedAt = new Date().toISOString();

  const reportPath = join(ROOT, "RECOVERY_REPORT.json");
  writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));

  // Markdown report
  const md = `# Historical Inventory Recovery Report

**Started:** ${finalReport.startedAt}  
**Finished:** ${finalReport.finishedAt}  
**Range:** ${START} → ${END}  
**Source:** STOCK_HISTORY_DAILY_CSV (\`seller-analytics-api.wildberries.ru\`)

## Accounts

${finalReport.accounts
  .map(
    (a) => `### Account ${a.accountId} — ${a.accountName}

- Recovered days: ${a.recoveredDays.join(", ") || "(none)"}
- Missing dates: ${a.missingDates.join(", ") || "(none)"}
- Download failures: ${a.downloadFailures.length ? JSON.stringify(a.downloadFailures) : "(none)"}
- Inventory records: ${a.totals?.inventoryRecords ?? 0}
- Warehouses: ${a.totals?.warehouseCount ?? 0}
- SKU count: ${a.totals?.skuCount ?? 0}
- SKU+Size count: ${a.totals?.skuSizeCount ?? 0}
`
  )
  .join("\n")}

## Totals

| Metric | Value |
|--------|-------|
| Recovered day-folders | ${finalReport.recoveredDays.length} |
| Recovered files | ${finalReport.recoveredFiles.length} |
| Total inventory records | ${finalReport.totalInventoryRecords} |
| Warehouses (union) | ${finalReport.warehouseCount} |
| SKU count (sum of accounts) | ${finalReport.skuCount} |
| SKU+Size count (sum of accounts) | ${finalReport.skuSizeCount} |
| Missing dates | ${finalReport.missingDates.length ? JSON.stringify(finalReport.missingDates) : "none"} |
| Download failures | ${finalReport.downloadFailures.length ? JSON.stringify(finalReport.downloadFailures) : "none"} |

## Output layout

\`exports/historical-inventory/account-{id}/{YYYY-MM-DD}/{raw.csv,inventory.xlsx,summary.json}\`

Immutable WB source per account: \`account-{id}/_source/\`
`;

  writeFileSync(join(ROOT, "RECOVERY_REPORT.md"), md);
  console.log("\nWrote", reportPath);
  console.log("Wrote", join(ROOT, "RECOVERY_REPORT.md"));
  console.log(
    JSON.stringify(
      {
        recoveredDayFolders: finalReport.recoveredDays.length,
        files: finalReport.recoveredFiles.length,
        records: finalReport.totalInventoryRecords,
        missing: finalReport.missingDates.length,
        failures: finalReport.downloadFailures.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
