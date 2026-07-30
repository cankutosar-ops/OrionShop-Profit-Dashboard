#!/usr/bin/env node
/**
 * Sprint 9.6 — STOCK_HISTORY_DAILY_CSV live validation (research only).
 * Does NOT modify business logic or create production features.
 *
 * Usage: npx tsx scripts/validate-stock-history-daily-csv-9-6.mjs [marketplaceAccountId]
 */
import { createHash, randomUUID } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import { readdirSync } from "fs";

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
const OUT_DIR = resolve(process.cwd(), "exports/stock-history-validation-9-6");
mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const files = [];
  for (const name of readdirSync(destDir)) {
    const full = join(destDir, name);
    files.push({ name, content: readFileSync(full) });
  }
  return files;
}

function parseCsvPreview(text, maxRows = 8) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [], lineCount: 0 };
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (line) => {
    // naive CSV/TSV split — enough for column discovery
    if (sep === ";") return line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
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
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1, 1 + maxRows).map(split);
  return { headers, rows, lineCount: lines.length - 1, separator: sep };
}

async function main() {
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
  let accountId = process.argv[2];
  if (!accountId) {
    const { data } = await sb
      .from("marketplace_accounts")
      .select("id, account_name")
      .eq("marketplace", "wildberries")
      .eq("is_active", true)
      .limit(1);
    accountId = String(data?.[0]?.id ?? "1");
  }

  const account = await getMarketplaceAccountForSync(accountId);
  const auth = { Authorization: account.apiKey, "Content-Type": "application/json" };

  const evidence = {
    sprint: "9.6",
    accountId: String(accountId),
    accountName: account.account_name ?? null,
    baseUrl: BASE,
    startedAt: new Date().toISOString(),
    probes: [],
  };

  async function probe(name, method, path, body) {
    const started = Date.now();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: auth,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const entry = {
      name,
      method,
      path,
      status: res.status,
      ms: Date.now() - started,
      bodyPreview: text.slice(0, 500),
    };
    evidence.probes.push(entry);
    console.log(`[${name}] ${method} ${path} → ${res.status} (${entry.ms}ms)`);
    console.log(text.slice(0, 300));
    return { res, text };
  }

  // 1) List existing reports (auth / permission check)
  await probe("list-downloads", "GET", "/api/v2/nm-report/downloads");

  // 2) Create STOCK_HISTORY_DAILY_CSV for Jul 17 – Jul 25 (pre-today window inside 3 months)
  const reportId = randomUUID();
  const createBody = {
    id: reportId,
    reportType: "STOCK_HISTORY_DAILY_CSV",
    userReportName: `Orion-9.6-validation-${reportId.slice(0, 8)}`,
    params: {
      currentPeriod: {
        start: "2026-07-17",
        end: "2026-07-25",
      },
      stockType: "wb",
      skipDeletedNm: false,
    },
  };

  writeFileSync(
    join(OUT_DIR, "create-request.json"),
    JSON.stringify(createBody, null, 2),
    "utf8"
  );

  const create = await probe(
    "create-STOCK_HISTORY_DAILY_CSV",
    "POST",
    "/api/v2/nm-report/downloads",
    createBody
  );

  evidence.reportId = reportId;
  evidence.createStatus = create.res.status;
  evidence.createResponse = create.text.slice(0, 1000);

  if (create.res.status >= 400) {
    // Try alternate param shapes documented elsewhere
    const altBodies = [
      {
        id: randomUUID(),
        reportType: "STOCK_HISTORY_DAILY_CSV",
        userReportName: "Orion-9.6-alt-startEnd",
        params: {
          startDate: "2026-07-17",
          endDate: "2026-07-25",
          stockType: "wb",
          skipDeletedNm: false,
        },
      },
      {
        id: randomUUID(),
        reportType: "STOCK_HISTORY_REPORT_CSV",
        userReportName: "Orion-9.6-STOCK_HISTORY_REPORT_CSV",
        params: {
          currentPeriod: { start: "2026-07-17", end: "2026-07-25" },
          stockType: "wb",
          skipDeletedNm: false,
          availabilityFilters: [],
          orderBy: { field: "nmId", mode: "asc" },
        },
      },
    ];

    for (const body of altBodies) {
      await sleep(21_000);
      const r = await probe(
        `create-alt-${body.reportType}`,
        "POST",
        "/api/v2/nm-report/downloads",
        body
      );
      if (r.res.status < 400) {
        evidence.reportId = body.id;
        evidence.createStatus = r.res.status;
        evidence.createResponse = r.text.slice(0, 1000);
        evidence.usedAlternateBody = body;
        break;
      }
    }
  }

  if (evidence.createStatus >= 400) {
    evidence.finishedAt = new Date().toISOString();
    evidence.verdict = "CREATE_FAILED";
    writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.error("Report create failed — see evidence.json");
    process.exit(2);
  }

  // 3) Poll
  let finalStatus = null;
  let reportMeta = null;
  for (let attempt = 1; attempt <= 40; attempt++) {
    await sleep(attempt === 1 ? 15_000 : 25_000);
    const list = await fetch(
      `${BASE}/api/v2/nm-report/downloads?filter[downloadIds]=${evidence.reportId}`,
      { headers: auth }
    );
    const listText = await list.text();
    console.log(`[poll ${attempt}] HTTP ${list.status}`);
    let parsed;
    try {
      parsed = JSON.parse(listText);
    } catch {
      evidence.probes.push({
        name: `poll-${attempt}`,
        status: list.status,
        bodyPreview: listText.slice(0, 400),
      });
      continue;
    }
    const rows = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    reportMeta = rows.find((r) => r.id === evidence.reportId) ?? rows[0] ?? null;
    finalStatus = reportMeta?.status ?? null;
    console.log(`  status=${finalStatus} size=${reportMeta?.size ?? "?"}`);
    evidence.probes.push({
      name: `poll-${attempt}`,
      status: list.status,
      reportStatus: finalStatus,
      meta: reportMeta,
    });
    if (finalStatus === "SUCCESS" || finalStatus === "FAILED") break;
  }

  evidence.pollFinalStatus = finalStatus;
  evidence.reportMeta = reportMeta;

  if (finalStatus !== "SUCCESS") {
    evidence.finishedAt = new Date().toISOString();
    evidence.verdict = `POLL_${finalStatus || "TIMEOUT"}`;
    writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.error("Report not SUCCESS — see evidence.json");
    process.exit(3);
  }

  // 4) Download
  await sleep(5_000);
  const fileRes = await fetch(
    `${BASE}/api/v2/nm-report/downloads/file/${evidence.reportId}`,
    { headers: { Authorization: account.apiKey } }
  );
  const ab = Buffer.from(await fileRes.arrayBuffer());
  console.log(`[download] HTTP ${fileRes.status} bytes=${ab.length}`);
  evidence.downloadStatus = fileRes.status;
  evidence.downloadBytes = ab.length;
  evidence.downloadSha256 = createHash("sha256").update(ab).digest("hex");

  if (fileRes.status >= 400 || ab.length < 10) {
    evidence.downloadPreview = ab.toString("utf8").slice(0, 500);
    evidence.finishedAt = new Date().toISOString();
    evidence.verdict = "DOWNLOAD_FAILED";
    writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
    process.exit(4);
  }

  const zipPath = join(OUT_DIR, `STOCK_HISTORY_DAILY_${evidence.reportId}.zip`);
  writeFileSync(zipPath, ab);
  evidence.zipPath = zipPath;

  const extractDir = join(OUT_DIR, `extracted-${evidence.reportId}`);
  const files = unzipViaPowerShell(zipPath, extractDir);
  evidence.zipEntries = files.map((f) => ({ name: f.name, bytes: f.content.length }));

  const csvAnalyses = [];
  for (const f of files) {
    const outName = f.name.replace(/[\\/]/g, "_");
    const csvPath = join(OUT_DIR, outName);
    writeFileSync(csvPath, f.content);
    const text = f.content.toString("utf8");
    const preview = parseCsvPreview(text, 10);
    const analysis = {
      fileName: f.name,
      savedAs: csvPath,
      bytes: f.content.length,
      sha256: createHash("sha256").update(f.content).digest("hex"),
      headers: preview.headers,
      separator: preview.separator,
      dataRowCountApprox: preview.lineCount,
      sampleRows: preview.rows,
    };
    csvAnalyses.push(analysis);
    console.log(`\nCSV ${f.name}`);
    console.log(`  headers (${preview.headers.length}): ${preview.headers.join(" | ")}`);
    console.log(`  rows≈${preview.lineCount}`);
  }

  evidence.csvAnalyses = csvAnalyses;

  // Granularity heuristics
  const allHeaders = csvAnalyses.flatMap((c) => c.headers.map((h) => h.toLowerCase()));
  const has = (re) => allHeaders.some((h) => re.test(h));
  evidence.granularityHeuristics = {
    hasDate: has(/date|день|дата|dt|period/),
    hasWarehouse: has(/warehouse|office|склад|region/),
    hasNmId: has(/nm.?id|артикул.?wb|nmid/),
    hasVendorCode: has(/vendor|sa.?name|артикул.?продав|supplier/),
    hasSize: has(/size|размер|tech.?size|chrt/),
    hasBarcode: has(/barcode|баркод/),
    hasQuantity: has(/qty|quantity|остат|stock|count/),
  };

  evidence.finishedAt = new Date().toISOString();
  evidence.verdict = "SUCCESS";
  writeFileSync(join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("\nWrote", join(OUT_DIR, "evidence.json"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
