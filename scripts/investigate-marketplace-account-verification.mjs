#!/usr/bin/env node
/**
 * Temporary — verify which marketplace account owns General Financial Report №772388604.
 * Read-only. No application code changes.
 *
 * Usage:
 *   npx tsx scripts/investigate-marketplace-account-verification.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import * as XLSX from "xlsx";

const TARGET_REPORT_ID = 772388604;
const DATE_FROM = "2026-06-30";
const DATE_TO = "2026-07-05";
const OUTPUT_MD = "exports/marketplace-account-verification.md";
const OUTPUT_JSON = "exports/marketplace-account-verification.json";

const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
const WB_FINANCE_API = "https://finance-api.wildberries.ru";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wbRequest(token, baseUrl, path, init = {}) {
  await sleep(2000);
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: token, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function fetchFinanceSample(token, dateFrom, dateTo, limit = 500) {
  const params = new URLSearchParams({ dateFrom, dateTo, limit: String(limit), rrdid: "0" });
  const rows = await wbRequest(token, WB_STATISTICS_API, `/api/v5/supplier/reportDetailByPeriod?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchSalesReportsList(token, dateFrom, dateTo) {
  const rows = await wbRequest(token, WB_FINANCE_API, "/api/finance/v1/sales-reports/list", {
    method: "POST",
    body: JSON.stringify({ dateFrom, dateTo, period: "weekly", limit: 1000, offset: 0 }),
  });
  return Array.isArray(rows) ? rows : [];
}

async function fetchSalesSample(token, dateFrom) {
  const params = new URLSearchParams({ dateFrom: `${dateFrom}T00:00:00`, flag: "0" });
  const rows = await wbRequest(token, WB_STATISTICS_API, `/api/v1/supplier/sales?${params}`);
  return Array.isArray(rows) ? rows.slice(0, 500) : [];
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function sample(arr, n = 5) {
  return arr.slice(0, n);
}

function loadExcelEvidence() {
  const paths = [
    resolve(process.cwd(), "exports/general-financial-report.xlsx"),
    "c:/Users/User/Downloads/Еженедельный детализированный отчет №772388604_68674 - 1.xlsx",
  ];
  for (const p of paths) {
    try {
      const wb = XLSX.readFile(p);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      return {
        path: p,
        rowCount: rows.length,
        brands: uniq(rows.map((r) => r["Бренд"])),
        barcodes: uniq(rows.map((r) => String(r["Баркод"] ?? ""))),
        articles: uniq(rows.map((r) => r["Артикул поставщика"])),
        srids: uniq(rows.map((r) => r["Srid"] ?? r["srid"])),
        operations: uniq(rows.map((r) => r["Обоснование для оплаты"])),
        saleDates: uniq(rows.map((r) => String(r["Дата продажи"] ?? "").slice(0, 10))),
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function getAccountWithKey(supabase, decryptCredential, accountRow, companyName) {
  const encrypted = accountRow.api_key_encrypted?.trim();
  let apiKey = null;
  let decryptError = null;
  if (encrypted) {
    try {
      apiKey = decryptCredential(encrypted);
    } catch (e) {
      decryptError = e.message;
    }
  }

  const jwt = apiKey ? decodeJwtPayload(apiKey) : null;

  return {
    internalAccountId: String(accountRow.id),
    displayName: accountRow.account_name,
    marketplace: accountRow.marketplace,
    configuredSellerId: accountRow.seller_id,
    company: companyName,
    isActive: accountRow.is_active,
    syncEnabled: accountRow.sync_enabled,
    lastSyncAt: accountRow.last_sync_at,
    lastSuccessfulSync: accountRow.last_successful_sync_at,
    lastSyncStatus: accountRow.last_sync_status,
    hasApiKey: Boolean(encrypted),
    decryptError,
    apiTokenOwner: jwt
      ? {
          sid: jwt.sid ?? null,
          uid: jwt.uid ?? null,
          sub: jwt.sub ?? null,
          exp: jwt.exp ?? null,
          iat: jwt.iat ?? null,
          rawKeys: Object.keys(jwt),
        }
      : null,
    apiKey,
  };
}

async function queryDbEvidence(supabase, accountId) {
  const [{ data: finance }, { data: sales }, { data: products }] = await Promise.all([
    supabase
      .from("wb_finance")
      .select("brand_name, barcode, srid, sa_name, realizationreport_id")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", DATE_FROM)
      .lte("operation_date", DATE_TO)
      .limit(2000),
    supabase
      .from("wb_sales")
      .select("brand, barcode, srid, supplier_article")
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", `${DATE_FROM}T00:00:00`)
      .lte("sale_date", `${DATE_TO}T23:59:59`)
      .limit(2000),
    supabase
      .from("products")
      .select("brand_id, supplier_article, brands(name)")
      .eq("marketplace_account_id", accountId)
      .limit(500),
  ]);

  const financeRows = finance ?? [];
  const salesRows = sales ?? [];

  return {
    dbFinanceRowCount: financeRows.length,
    dbSalesRowCount: salesRows.length,
    dbBrandsFinance: uniq(financeRows.map((r) => r.brand_name)),
    dbBrandsSales: uniq(salesRows.map((r) => r.brand)),
    dbBrandsProducts: uniq((products ?? []).map((r) => r.brands?.name)),
    dbBarcodesFinance: uniq(financeRows.map((r) => r.barcode)),
    dbBarcodesSales: uniq(salesRows.map((r) => r.barcode)),
    dbSridsFinance: uniq(financeRows.map((r) => r.srid)),
    dbSridsSales: uniq(salesRows.map((r) => r.srid)),
    dbReportIds: uniq(financeRows.map((r) => r.realizationreport_id)).sort((a, b) => a - b),
    dbArticlesFinance: uniq(financeRows.map((r) => r.sa_name)),
    dbArticlesSales: uniq(salesRows.map((r) => r.supplier_article)),
    dbArticlesProducts: uniq((products ?? []).map((r) => r.supplier_article)),
  };
}

function scoreAgainstExcel(accountEvidence, excel) {
  if (!excel) return { score: 0, matches: {} };
  const matches = {
    reportId772388604: accountEvidence.reportIds.includes(TARGET_REPORT_ID),
    brandOverlap: accountEvidence.brands.filter((b) => excel.brands.includes(b)),
    barcodeOverlap: accountEvidence.barcodes.filter((b) => excel.barcodes.includes(b)),
    sridOverlap: accountEvidence.srids.filter((s) => excel.srids.includes(s)),
    articleOverlap: accountEvidence.articles.filter((a) => excel.articles.includes(a)),
    configuredSeller68674: String(accountEvidence.configuredSellerId ?? "") === "68674",
    jwtSid68674: String(accountEvidence.apiTokenOwner?.sid ?? "") === "68674",
  };
  let score = 0;
  if (matches.reportId772388604) score += 1000;
  score += matches.brandOverlap.length * 100;
  score += matches.barcodeOverlap.length * 50;
  score += matches.sridOverlap.length * 50;
  score += matches.articleOverlap.length * 20;
  if (matches.configuredSeller68674) score += 200;
  if (matches.jwtSid68674) score += 200;
  return { score, matches };
}

async function main() {
  loadEnv();

  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { listCompanies } = await import("../src/services/marketplace-account-service.ts");
  const { decryptCredential } = await import("../src/lib/credentials/encryption.ts");

  const supabase = createAdminClient();
  const companies = await listCompanies();
  const excel = loadExcelEvidence();

  const accounts = [];
  for (const company of companies) {
    for (const pub of company.accounts) {
      const { data: row } = await supabase
        .from("marketplace_accounts")
        .select("*")
        .eq("id", pub.id)
        .maybeSingle();
      if (!row) continue;

      const base = await getAccountWithKey(supabase, decryptCredential, row, company.name);
      const db = await queryDbEvidence(supabase, base.internalAccountId);

      let live = {
        apiAccessible: false,
        apiError: null,
        reportIds: [],
        sellerFinanceNames: [],
        brandsFinance: [],
        brandsSales: [],
        barcodesFinance: [],
        barcodesSales: [],
        sridsFinance: [],
        sridsSales: [],
        articlesFinance: [],
        articlesSales: [],
        financeRowCount: 0,
        salesRowCount: 0,
      };

      if (base.apiKey && base.marketplace === "wildberries") {
        try {
          const financeRows = await fetchFinanceSample(base.apiKey, DATE_FROM, DATE_TO);
          const salesRows = await fetchSalesSample(base.apiKey, DATE_FROM);
          const reportList = await fetchSalesReportsList(base.apiKey, DATE_FROM, DATE_TO);

          live = {
            apiAccessible: true,
            apiError: null,
            reportIds: uniq(financeRows.map((r) => r.realizationreport_id)).sort((a, b) => a - b),
            sellerFinanceNames: uniq(reportList.map((r) => r.sellerFinanceName)),
            brandsFinance: uniq(financeRows.map((r) => r.brand_name)),
            brandsSales: uniq(salesRows.map((r) => r.brand)),
            barcodesFinance: uniq(financeRows.map((r) => r.barcode)),
            barcodesSales: uniq(salesRows.map((r) => String(r.barcode ?? ""))),
            sridsFinance: uniq(financeRows.map((r) => r.srid)),
            sridsSales: uniq(salesRows.map((r) => r.srid ?? r.saleID)),
            articlesFinance: uniq(financeRows.map((r) => r.sa_name)),
            articlesSales: uniq(salesRows.map((r) => r.supplierArticle)),
            financeRowCount: financeRows.length,
            salesRowCount: salesRows.length,
            reportListIds: uniq(reportList.map((r) => r.reportId)).sort((a, b) => a - b),
          };
        } catch (e) {
          live.apiError = e.message;
        }
      }

      const combined = {
        reportIds: uniq([...db.dbReportIds, ...live.reportIds, ...(live.reportListIds ?? [])]).sort(
          (a, b) => a - b,
        ),
        brands: uniq([
          ...db.dbBrandsFinance,
          ...db.dbBrandsSales,
          ...db.dbBrandsProducts,
          ...live.brandsFinance,
          ...live.brandsSales,
        ]),
        barcodes: uniq([
          ...db.dbBarcodesFinance,
          ...db.dbBarcodesSales,
          ...live.barcodesFinance,
          ...live.barcodesSales,
        ]),
        srids: uniq([...db.dbSridsFinance, ...db.dbSridsSales, ...live.sridsFinance, ...live.sridsSales]),
        articles: uniq([
          ...db.dbArticlesFinance,
          ...db.dbArticlesSales,
          ...db.dbArticlesProducts,
          ...live.articlesFinance,
          ...live.articlesSales,
        ]),
      };

      const { score, matches } = scoreAgainstExcel(
        { ...combined, configuredSellerId: base.configuredSellerId, apiTokenOwner: base.apiTokenOwner },
        excel,
      );

      accounts.push({
        ...base,
        apiKey: undefined,
        db,
        live,
        combined: {
          reportIds: combined.reportIds,
          brandCount: combined.brands.length,
          brands: sample(combined.brands, 10),
          barcodeCount: combined.barcodes.length,
          exampleBarcodes: sample(combined.barcodes, 5),
          sridCount: combined.srids.length,
          exampleSrids: sample(combined.srids, 5),
          articleCount: combined.articles.length,
          exampleArticles: sample(combined.articles, 5),
        },
        excelMatch: { score, ...matches },
      });
    }
  }

  accounts.sort((a, b) => b.excelMatch.score - a.excelMatch.score);

  const top = accounts[0];
  const conclusion =
    top && top.excelMatch.score > 0
      ? {
          mostLikelyAccountId: top.internalAccountId,
          displayName: top.displayName,
          score: top.excelMatch.score,
          evidence: top.excelMatch.matches,
          note: "Based on highest evidence score only.",
        }
      : {
          mostLikelyAccountId: null,
          note: "No account produced positive evidence match against Excel report №772388604.",
        };

  const report = {
    generatedAt: new Date().toISOString(),
    targetReportId: TARGET_REPORT_ID,
    excelEvidence: excel,
    accounts,
    conclusion,
  };

  mkdirSync(dirname(resolve(OUTPUT_MD)), { recursive: true });
  writeFileSync(resolve(OUTPUT_JSON), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(OUTPUT_MD), buildMarkdown(report), "utf8");

  console.log(`Wrote ${OUTPUT_MD}`);
  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Accounts investigated: ${accounts.length}`);
  console.log(`Conclusion:`, JSON.stringify(conclusion, null, 2));
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Marketplace Account Verification");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Target General Financial Report: **№${report.targetReportId}**`);
  lines.push("");

  if (report.excelEvidence) {
    lines.push("## Excel evidence (General Financial Report)");
    lines.push("");
    lines.push(`Source: \`${report.excelEvidence.path}\``);
    lines.push(`Rows: ${report.excelEvidence.rowCount}`);
    lines.push(`Brands: ${report.excelEvidence.brands.join(", ")}`);
    lines.push(`Articles: ${report.excelEvidence.articles.join(", ")}`);
    lines.push(`Barcodes: ${report.excelEvidence.barcodes.slice(0, 5).join(", ")}…`);
    lines.push(`SRIDs: ${report.excelEvidence.srids.slice(0, 3).join(", ")}…`);
    lines.push(`Filename suffix _68674 may indicate WB supplier ID 68674`);
    lines.push("");
  }

  for (const a of report.accounts) {
    lines.push(`## Account ${a.internalAccountId}: ${a.displayName}`);
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Company | ${a.company} |`);
    lines.push(`| Marketplace | ${a.marketplace} |`);
    lines.push(`| Configured seller_id | ${a.configuredSellerId ?? "—"} |`);
    lines.push(`| Last successful sync | ${a.lastSuccessfulSync ?? "—"} |`);
    lines.push(`| Last sync status | ${a.lastSyncStatus ?? "—"} |`);
    lines.push(`| API accessible | ${a.live.apiAccessible ? "yes" : "no"}${a.live.apiError ? ` (${a.live.apiError})` : ""} |`);
    if (a.apiTokenOwner) {
      lines.push(`| JWT sid | ${a.apiTokenOwner.sid ?? "—"} |`);
      lines.push(`| JWT uid | ${a.apiTokenOwner.uid ?? "—"} |`);
    }
    if (a.live.sellerFinanceNames?.length) {
      lines.push(`| Seller finance name (API) | ${a.live.sellerFinanceNames.join("; ")} |`);
    }
    lines.push(`| Report IDs (combined) | ${a.combined.reportIds.join(", ") || "—"} |`);
    lines.push(`| Has report ${report.targetReportId} | ${a.excelMatch.matches.reportId772388604 ? "**YES**" : "no"} |`);
    lines.push(`| Brands (sample) | ${a.combined.brands.join(", ") || "—"} |`);
    lines.push(`| Example barcodes | ${a.combined.exampleBarcodes.join(", ") || "—"} |`);
    lines.push(`| Example SRIDs | ${a.combined.exampleSrids.join(", ") || "—"} |`);
    lines.push(`| Example articles | ${a.combined.exampleArticles.join(", ") || "—"} |`);
    lines.push("");
    lines.push("### Excel match evidence");
    lines.push("");
    lines.push(`- Score: **${a.excelMatch.score}**`);
    lines.push(`- Report ID 772388604: ${a.excelMatch.matches.reportId772388604}`);
    lines.push(`- Brand overlap: ${a.excelMatch.matches.brandOverlap.join(", ") || "none"}`);
    lines.push(`- Barcode overlap: ${a.excelMatch.matches.barcodeOverlap.join(", ") || "none"}`);
    lines.push(`- SRID overlap: ${a.excelMatch.matches.sridOverlap.join(", ") || "none"}`);
    lines.push(`- Article overlap: ${a.excelMatch.matches.articleOverlap.join(", ") || "none"}`);
    lines.push(`- configured seller_id = 68674: ${a.excelMatch.matches.configuredSeller68674}`);
    lines.push(`- JWT sid = 68674: ${a.excelMatch.matches.jwtSid68674}`);
    lines.push("");
  }

  lines.push("## Conclusion");
  lines.push("");
  if (report.conclusion.mostLikelyAccountId) {
    lines.push(
      `**Most likely owner:** Account **${report.conclusion.mostLikelyAccountId}** (${report.conclusion.displayName}) — evidence score **${report.conclusion.score}**`,
    );
    lines.push("");
    lines.push("Evidence:");
    lines.push("```json");
    lines.push(JSON.stringify(report.conclusion.evidence, null, 2));
    lines.push("```");
  } else {
    lines.push(`**No account matched** General Financial Report №${report.targetReportId} on available evidence.`);
  }
  lines.push("");

  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
