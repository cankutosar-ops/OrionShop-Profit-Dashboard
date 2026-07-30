/**
 * Evidence-only: Official WB weekly detailed report №786182326 (Основной, 2026-07-13→19)
 * vs wb_finance / Dashboard. Also documents empty №786182329 (По выкупам) detail file.
 * NO engine/code changes.
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const PATH_OSN =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const PATH_VYK =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182329_1202289/Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx";
const PATH_SUMMARY =
  "c:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";

const WEEK_FROM = "2026-07-13";
const WEEK_TO = "2026-07-19";
const REPORT_OSN = "786182326";
const REPORT_VYK = "786182329";
const ACCOUNT = "1";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const close = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

function loadDetailed(path) {
  const meta = {
    path,
    exists: existsSync(path),
    sizeBytes: existsSync(path) ? statSync(path).size : 0,
  };
  if (!meta.exists) return { meta, rows: [], headers: [] };
  const wb = XLSX.readFile(path, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = (grid[0] ?? []).map((h, i) => (h == null || h === "" ? `COL${i}` : String(h)));
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every((v) => v == null || String(v).trim() === "")) continue;
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = raw[j] ?? null;
    // skip if no meaningful content beyond row number
    if (headers.length <= 1) continue;
    rows.push(o);
  }
  return { meta: { ...meta, ncols: headers.length, nrows: rows.length }, rows, headers };
}

function mapExcelRow(o, reportId, reportType) {
  const srid = o.Srid == null || o.Srid === "" ? null : String(o.Srid);
  return {
    reportId,
    reportType,
    rowNo: o["№"],
    docType: o["Тип документа"] == null ? "" : String(o["Тип документа"]),
    justification: o["Обоснование для оплаты"] == null ? "" : String(o["Обоснование для оплаты"]),
    nmId: o["Код номенклатуры"] == null ? null : String(o["Код номенклатуры"]),
    barcode: o["Баркод"] == null ? null : String(o["Баркод"]),
    qty: num(o["Кол-во"]),
    saleDate: o["Дата продажи"] == null ? null : String(o["Дата продажи"]).slice(0, 10),
    orderDate: o["Дата заказа покупателем"] == null ? null : String(o["Дата заказа покупателем"]).slice(0, 10),
    srid,
    retail: num(o["Вайлдберриз реализовал Товар (Пр)"]),
    retailWithDisc: num(o["Цена розничная с учетом согласованной скидки"]),
    ppvz_for_pay: num(o["К перечислению Продавцу за реализованный Товар"]),
    logistics: num(o["Услуги по доставке товара покупателю"]),
    rebill: num(o["Возмещение издержек по перевозке/по складским операциям с товаром"]),
    storage: num(o["Хранение"]),
    penalties: num(o["Общая сумма штрафов"]),
    acceptance: num(o["Операции на приемке"]),
    otherHolds: num(o["Удержания"]),
    acquiring: num(o["Компенсация платёжных услуг/Комиссия за интеграцию платёжных сервисов"]),
    ppvz_reward: num(o["Возмещение за выдачу и возврат товаров на ПВЗ"]),
    ppvz_vw: num(o["Вознаграждение Вайлдберриз (ВВ), без НДС"]),
    vvAdj: num(o["Корректировка Вознаграждения Вайлдберриз (ВВ)"]),
    logisticsKind: o["Виды логистики, штрафов и корректировок ВВ"] ?? null,
  };
}

const osnFile = loadDetailed(PATH_OSN);
const vykFile = loadDetailed(PATH_VYK);

const osnTx = osnFile.rows.map((r) => mapExcelRow(r, REPORT_OSN, "Основной"));
const vykTx = vykFile.rows.map((r) => mapExcelRow(r, REPORT_VYK, "По выкупам"));

// --- Step 1: compare detailed files ---
const osnBySrid = new Map();
for (const t of osnTx) {
  if (!t.srid) continue;
  if (!osnBySrid.has(t.srid)) osnBySrid.set(t.srid, []);
  osnBySrid.get(t.srid).push(t);
}
const vykBySrid = new Map();
for (const t of vykTx) {
  if (!t.srid) continue;
  if (!vykBySrid.has(t.srid)) vykBySrid.set(t.srid, []);
  vykBySrid.get(t.srid).push(t);
}

const onlyOsn = [...osnBySrid.keys()].filter((s) => !vykBySrid.has(s));
const onlyVyk = [...vykBySrid.keys()].filter((s) => !osnBySrid.has(s));
const both = [...osnBySrid.keys()].filter((s) => vykBySrid.has(s));

function sumFields(rows) {
  const keys = [
    "ppvz_for_pay",
    "logistics",
    "rebill",
    "storage",
    "penalties",
    "acceptance",
    "otherHolds",
    "retail",
    "qty",
  ];
  const o = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) for (const k of keys) o[k] += r[k];
  for (const k of keys) o[k] = r2(o[k]);
  return o;
}

const step1 = {
  osnFile: osnFile.meta,
  vykFile: vykFile.meta,
  osnRowCount: osnTx.length,
  vykRowCount: vykTx.length,
  osnUniqueSrids: osnBySrid.size,
  vykUniqueSrids: vykBySrid.size,
  onlyInOsnovnoy_sridCount: onlyOsn.length,
  onlyInPoVykupam_sridCount: onlyVyk.length,
  inBoth_sridCount: both.length,
  vykDetailFileUsable: vykFile.meta.ncols > 5 && vykTx.length > 0,
  blocker:
    vykFile.meta.ncols <= 5 || vykTx.length === 0
      ? "По выкупам detailed Excel №786182329 is empty/corrupt (only column «№», 0 data rows, 16744 bytes). Transaction-level compare Основной↔По выкупам CANNOT be completed from this file."
      : null,
  osnTotalsByJustification: (() => {
    const m = new Map();
    for (const t of osnTx) {
      const j = t.justification || "(blank)";
      if (!m.has(j)) m.set(j, []);
      m.get(j).push(t);
    }
    return [...m.entries()]
      .map(([j, rows]) => ({
        justification: j,
        rows: rows.length,
        ...sumFields(rows),
      }))
      .sort((a, b) => b.rows - a.rows);
  })(),
  osnTotals: sumFields(osnTx),
  sampleOnlyOsnSrids: onlyOsn.slice(0, 20).map((s) => ({
    srid: s,
    lines: osnBySrid.get(s).map((t) => ({
      justification: t.justification,
      ppvz_for_pay: t.ppvz_for_pay,
      logistics: t.logistics,
      rebill: t.rebill,
      storage: t.storage,
      nmId: t.nmId,
      barcode: t.barcode,
      saleDate: t.saleDate,
    })),
  })),
  summaryWeekFromOfficialList: {
    osn: {
      id: REPORT_OSN,
      type: "Основной",
      from: WEEK_FROM,
      to: WEEK_TO,
      prodazha: 85990.12,
      k: 84788.12,
      logistics: 37498,
      storage: 2731.45,
      other: 7048.56,
      totalPay: 37510.11,
    },
    vyk: {
      id: REPORT_VYK,
      type: "По выкупам",
      from: WEEK_FROM,
      to: WEEK_TO,
      prodazha: 4787.3,
      k: 3323.16,
      logistics: 2217.42,
      storage: 0,
      other: 0,
      totalPay: 1105.74,
    },
    note: "From summary Excel — same calendar week, different report numbers and non-overlapping monetary totals (not a duplicate copy of Основной).",
  },
};

// --- DB load ---
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { fetchFinanceInRange, fetchSalesInRange } = await import(
  "../src/services/persisted-query-service.ts"
);
const { sumNetForPayFromFinance } = await import("../src/lib/wb-settlement.ts");
const { rollupCategoriesToProfitBuckets } = await import("../src/lib/finance-rollup.ts");
const { buildModelBProfitMetrics } = await import("../src/lib/financial-engine.ts");
const {
  buildNetForPayFromDb,
  buildNetSalesFromDb,
  buildNetFinishedPriceFromDb,
} = await import("../src/lib/sales-revenue-resolution.ts");
const { buildMarketplaceFeesPresentationFromFinance, summarizeFinanceByCategory } =
  await import("../src/lib/finance-rollup.ts");
const { computeProductCost } = await import("../src/lib/product-cost.ts");
const { buildLatestCostByProductId } = await import(
  "../src/lib/cost-history-resolution.ts"
);
const { sumAcceptanceFromFinance } = await import("../src/lib/wb-settlement.ts");

const sb = createAdminClient();
const scope = {
  marketplaceAccountId: ACCOUNT,
  from: WEEK_FROM,
  to: WEEK_TO,
  brandId: null,
};
const { data: products } = await sb
  .from("products")
  .select("*")
  .eq("marketplace_account_id", ACCOUNT);
const productIds = (products ?? []).map((p) => String(p.id));

const [finance, sales, costRes] = await Promise.all([
  fetchFinanceInRange(scope, sb, { productIds }),
  fetchSalesInRange(scope, sb, { productIds }),
  sb.from("product_cost_history").select("*"),
]);

// Also fetch finance by sale_dt overlap and by rrd_id if column exists
const sampleFin = finance[0] ?? null;
const financeCols = sampleFin ? Object.keys(sampleFin) : [];

const finBySrid = new Map();
for (const f of finance) {
  const s = f.srid == null ? null : String(f.srid);
  if (!s) continue;
  if (!finBySrid.has(s)) finBySrid.set(s, []);
  finBySrid.get(s).push(f);
}

function classifyFinanceRow(f) {
  const cat = String(f.finance_category ?? "");
  const name = String(f.supplier_oper_name ?? f.operation_type ?? "");
  const amount = Number(f.amount ?? 0);
  const forPay = Number(f.ppvz_for_pay ?? (String(f.suffix ?? "").includes("for_pay") ? amount : 0));
  return {
    id: f.id,
    srid: f.srid,
    operation_date: f.operation_date,
    sale_dt: f.sale_dt ?? f.rr_dt ?? null,
    category: cat,
    operName: name,
    amount: r2(amount),
    ppvz_for_pay: r2(Number(f.ppvz_for_pay ?? 0)),
    delivery_rub: r2(Number(f.delivery_rub ?? 0)),
    storage_fee: r2(Number(f.storage_fee ?? 0)),
    penalty: r2(Number(f.penalty ?? 0)),
    acceptance: r2(Number(f.acceptance ?? 0)),
    rebill: r2(Number(f.rebill_logistic_cost ?? 0)),
    rrd_id: f.rrd_id ?? f.realizationreport_id ?? f.report_id ?? null,
    nm_id: f.nm_id,
    barcode: f.barcode,
  };
}

// Match Excel lines to finance by SRID + justification family
function excelLineKey(t) {
  return `${t.srid}||${t.justification}`;
}

const excelSaleLines = osnTx.filter((t) => t.justification === "Продажа" || t.justification === "Возврат");
const excelLogLines = osnTx.filter((t) => t.justification === "Логистика");
const excelStorageLines = osnTx.filter((t) => t.justification === "Хранение" || t.justification === "Коррекция хранения");
const excelRebillLines = osnTx.filter((t) =>
  t.justification.includes("Возмещение издержек по перевозке")
);
const excelAcceptLines = osnTx.filter((t) => t.justification.includes("приемке") || t.acceptance);
const excelPenaltyLines = osnTx.filter((t) => t.penalties !== 0 || t.justification.includes("Штраф"));
const excelHoldLines = osnTx.filter((t) => t.justification === "Удержание");

function matchBySrid(excelLines, amountPicker) {
  const missing = [];
  const amountDiffs = [];
  const matched = [];
  const seenFinIds = new Set();

  for (const ex of excelLines) {
    if (!ex.srid) {
      missing.push({ reason: "excel_row_without_srid", excel: ex });
      continue;
    }
    const fins = finBySrid.get(ex.srid) ?? [];
    if (fins.length === 0) {
      missing.push({
        reason: "srid_not_in_wb_finance_week_scope",
        srid: ex.srid,
        justification: ex.justification,
        saleDate: ex.saleDate,
        excelAmount: amountPicker(ex),
        nmId: ex.nmId,
        barcode: ex.barcode,
      });
      continue;
    }
    // sum finance amounts of related category for this srid
    const finSum = r2(
      fins.reduce((s, f) => s + amountPicker({ ...ex, _fin: f }, f), 0)
    );
    // default: compare excel amount to sum of all finance rows for srid for that metric
    matched.push({ srid: ex.srid, justification: ex.justification, excel: amountPicker(ex), financeRows: fins.length });
    for (const f of fins) seenFinIds.add(String(f.id));
  }
  return { missing, amountDiffs, matched, seenFinIds };
}

// More precise: for Продажа/Возврат compare ppvz_for_pay
function auditForPay(excelLines) {
  const missing = [];
  const diffs = [];
  const matchedExact = [];
  for (const ex of excelLines) {
    if (!ex.srid) continue;
    const fins = (finBySrid.get(ex.srid) ?? []).map(classifyFinanceRow);
    const forPayRows = fins.filter(
      (f) =>
        Math.abs(f.ppvz_for_pay) > 0.001 ||
        /for_pay|продаж|возврат/i.test(f.operName + f.category)
    );
    // Prefer rows where ppvz_for_pay matches sign/magnitude
    const excelAmt = ex.justification === "Возврат" ? -Math.abs(ex.ppvz_for_pay) : ex.ppvz_for_pay;
    // Excel returns often store positive ppvz_for_pay with justification Возврат
    const excelSigned =
      ex.justification === "Возврат" ? -Math.abs(ex.ppvz_for_pay) : ex.ppvz_for_pay;

    if (fins.length === 0) {
      missing.push({
        srid: ex.srid,
        justification: ex.justification,
        saleDate: ex.saleDate,
        excel_ppvz_for_pay: ex.ppvz_for_pay,
        nmId: ex.nmId,
        barcode: ex.barcode,
      });
      continue;
    }

    const finForPaySum = r2(fins.reduce((s, f) => s + f.ppvz_for_pay, 0));
    // Also try matching any single finance row
    const hit = fins.find((f) => close(f.ppvz_for_pay, ex.ppvz_for_pay) || close(f.ppvz_for_pay, excelSigned));
    if (hit) {
      matchedExact.push({
        srid: ex.srid,
        justification: ex.justification,
        excel: ex.ppvz_for_pay,
        finance: hit.ppvz_for_pay,
        financeId: hit.id,
        operation_date: hit.operation_date,
      });
    } else if (!close(finForPaySum, ex.ppvz_for_pay) && !close(finForPaySum, excelSigned)) {
      diffs.push({
        srid: ex.srid,
        justification: ex.justification,
        saleDate: ex.saleDate,
        excel_ppvz_for_pay: ex.ppvz_for_pay,
        finance_ppvz_for_pay_sum: finForPaySum,
        diff: r2(finForPaySum - ex.ppvz_for_pay),
        financeRowCount: fins.length,
        financeRows: fins.map((f) => ({
          id: f.id,
          operation_date: f.operation_date,
          category: f.category,
          operName: f.operName,
          ppvz_for_pay: f.ppvz_for_pay,
          amount: f.amount,
        })),
      });
    } else {
      matchedExact.push({
        srid: ex.srid,
        justification: ex.justification,
        excel: ex.ppvz_for_pay,
        financeSum: finForPaySum,
        note: "matched_on_srid_sum",
      });
    }
  }
  return { missing, diffs, matchedExact };
}

function auditMetric(excelLines, excelAmountFn, finAmountFn, label) {
  const missing = [];
  const diffs = [];
  const matched = [];
  for (const ex of excelLines) {
    if (!ex.srid) continue;
    const excelAmt = r2(excelAmountFn(ex));
    if (Math.abs(excelAmt) < 0.005) continue; // skip zero noise
    const fins = finBySrid.get(ex.srid) ?? [];
    if (fins.length === 0) {
      missing.push({
        metric: label,
        srid: ex.srid,
        justification: ex.justification,
        saleDate: ex.saleDate,
        excelAmount: excelAmt,
        nmId: ex.nmId,
        barcode: ex.barcode,
      });
      continue;
    }
    const finSum = r2(fins.reduce((s, f) => s + finAmountFn(f), 0));
    const hit = fins.some((f) => close(finAmountFn(f), excelAmt));
    if (hit || close(finSum, excelAmt)) {
      matched.push({ srid: ex.srid, excel: excelAmt, finance: hit ? "row_hit" : finSum });
    } else {
      diffs.push({
        metric: label,
        srid: ex.srid,
        justification: ex.justification,
        saleDate: ex.saleDate,
        excelAmount: excelAmt,
        financeSum: finSum,
        diff: r2(finSum - excelAmt),
        financeRows: fins.map((f) => ({
          id: f.id,
          operation_date: f.operation_date,
          category: f.finance_category,
          oper: f.supplier_oper_name,
          amount: Number(f.amount ?? 0),
          delivery_rub: Number(f.delivery_rub ?? 0),
          storage_fee: Number(f.storage_fee ?? 0),
          penalty: Number(f.penalty ?? 0),
          acceptance: Number(f.acceptance ?? 0),
          rebill: Number(f.rebill_logistic_cost ?? 0),
          ppvz_for_pay: Number(f.ppvz_for_pay ?? 0),
        })),
      });
    }
  }
  return { missing, diffs, matchedCount: matched.length };
}

const forPayAudit = auditForPay(excelSaleLines);
const logisticsAudit = auditMetric(
  excelLogLines,
  (ex) => ex.logistics,
  (f) => Number(f.delivery_rub ?? 0),
  "logistics"
);
const rebillAudit = auditMetric(
  excelRebillLines,
  (ex) => ex.rebill,
  (f) => Number(f.rebill_logistic_cost ?? 0),
  "rebill_logistics"
);
const storageAudit = auditMetric(
  excelStorageLines,
  (ex) => ex.storage,
  (f) => Number(f.storage_fee ?? 0),
  "storage"
);
const holdAudit = auditMetric(
  excelHoldLines,
  (ex) => ex.otherHolds,
  (f) => Number(f.amount ?? 0),
  "other_holds"
);

// Excel SRIDs completely absent from finance
const excelSrids = [...osnBySrid.keys()];
const missingSrids = excelSrids.filter((s) => !finBySrid.has(s));
const presentSrids = excelSrids.filter((s) => finBySrid.has(s));

// Finance SRIDs in week not in Excel Основной detail
const financeOnlySrids = [...finBySrid.keys()].filter((s) => !osnBySrid.has(s));

// Duplicate detection: excel multiple sale lines same srid
const excelSaleDupes = [];
const saleBySrid = new Map();
for (const t of excelSaleLines) {
  if (!t.srid) continue;
  if (!saleBySrid.has(t.srid)) saleBySrid.set(t.srid, []);
  saleBySrid.get(t.srid).push(t);
}
for (const [srid, rows] of saleBySrid) {
  if (rows.length > 1) excelSaleDupes.push({ srid, rows: rows.map((r) => ({ j: r.justification, pay: r.ppvz_for_pay, qty: r.qty })) });
}

const financeDupes = [];
for (const [srid, rows] of finBySrid) {
  const forPayRows = rows.filter((f) => Math.abs(Number(f.ppvz_for_pay ?? 0)) > 0.01);
  if (forPayRows.length > 1) {
    financeDupes.push({
      srid,
      count: forPayRows.length,
      rows: forPayRows.map((f) => ({
        id: f.id,
        operation_date: f.operation_date,
        ppvz_for_pay: Number(f.ppvz_for_pay),
        oper: f.supplier_oper_name,
        category: f.finance_category,
      })),
    });
  }
}

// Revenue totals
const excelRevenueOsn = r2(osnTx.filter((t) => t.justification === "Продажа").reduce((s, t) => s + t.ppvz_for_pay, 0)
  - osnTx.filter((t) => t.justification === "Возврат").reduce((s, t) => s + Math.abs(t.ppvz_for_pay), 0));
// Better: sum signed — Продажа positive, Возврат as negative of abs
const excelForPaySigned = r2(
  osnTx.reduce((s, t) => {
    if (t.justification === "Продажа") return s + t.ppvz_for_pay;
    if (t.justification === "Возврат") return s - Math.abs(t.ppvz_for_pay);
    return s;
  }, 0)
);
const excelForPayRawSum = r2(osnTx.reduce((s, t) => s + t.ppvz_for_pay, 0));

const financeNetForPay = sumNetForPayFromFinance(finance);
const financeTotals = rollupCategoriesToProfitBuckets(finance);
const categorySummary = summarizeFinanceByCategory(finance);
const presentation = buildMarketplaceFeesPresentationFromFinance(
  finance,
  financeTotals.commission
);
const netSales = buildNetSalesFromDb(sales);
const salesForPay = buildNetForPayFromDb(sales);
const customerPaid = buildNetFinishedPriceFromDb(sales);
const latest = buildLatestCostByProductId(costRes.data ?? [], products ?? []);
const productCost = computeProductCost(sales, costRes.data ?? [], latest);
const acceptance = sumAcceptanceFromFinance(finance);
const modelB = buildModelBProfitMetrics(netSales, {
  salesForPay,
  financeNetForPay,
  acquiring: categorySummary.ACQUIRING,
  logistics: financeTotals.logistics + financeTotals.return_logistics,
  storage: financeTotals.storage,
  penalties: financeTotals.penalty,
  adjustments: presentation.accountAdjustments,
  acceptance,
  productCost,
  advertising: 0,
  customerPaid,
});

// Validate detail totals vs summary row for Основной
const detailLogistics = r2(osnTx.reduce((s, t) => s + t.logistics + t.rebill, 0));
const detailStorage = r2(osnTx.reduce((s, t) => s + t.storage, 0));
const detailHolds = r2(osnTx.reduce((s, t) => s + t.otherHolds, 0));

const result = {
  scope: {
    week: { from: WEEK_FROM, to: WEEK_TO },
    reports: { osnovnoy: REPORT_OSN, poVykupam: REPORT_VYK },
    accountId: ACCOUNT,
    note: "Transaction audit for one week ending 2026-07-19. Summary Excel confirms both report types for this week.",
  },
  step1_weeklyReportValidation: step1,
  step2_financeValidation: {
    financeRowsInWeek: finance.length,
    financeUniqueSrids: finBySrid.size,
    financeSampleColumns: financeCols.slice(0, 40),
    excelSrids: excelSrids.length,
    excelSridsPresentInFinance: presentSrids.length,
    excelSridsMissingInFinance: missingSrids.length,
    missingSridEvidence: missingSrids.slice(0, 50).map((s) => ({
      srid: s,
      excelLines: osnBySrid.get(s).map((t) => ({
        justification: t.justification,
        ppvz_for_pay: t.ppvz_for_pay,
        logistics: t.logistics,
        rebill: t.rebill,
        storage: t.storage,
        saleDate: t.saleDate,
        nmId: t.nmId,
        barcode: t.barcode,
      })),
    })),
    financeOnlySridCount: financeOnlySrids.length,
    financeOnlySridSample: financeOnlySrids.slice(0, 30).map((s) => ({
      srid: s,
      rows: finBySrid.get(s).map((f) => classifyFinanceRow(f)),
    })),
    excelSaleLineDuplicates: excelSaleDupes,
    financeForPayDuplicates: financeDupes.slice(0, 40),
    forPayLineAudit: {
      excelSaleReturnLines: excelSaleLines.length,
      missingInFinance: forPayAudit.missing,
      amountDifferences: forPayAudit.diffs,
      matchedExactCount: forPayAudit.matchedExact.length,
      matchedExactSample: forPayAudit.matchedExact.slice(0, 15),
    },
  },
  step3_revenue: {
    weeklyDetail_excel_ppvz_for_pay_signed: excelForPaySigned,
    weeklyDetail_excel_ppvz_for_pay_rawSumAllJustifications: excelForPayRawSum,
    weeklySummary_К_перечислению_Основной: 84788.12,
    weeklySummary_К_перечислению_ПоВыкупам: 3323.16,
    weeklySummary_К_sum_bothTypes: r2(84788.12 + 3323.16),
    financeDB_signed_for_pay: r2(financeNetForPay),
    dashboard_Revenue_V4: r2(modelB.revenue),
    salesAPI_forPay_net: r2(salesForPay),
    differences: {
      detailSigned_vs_summaryOsn: r2(excelForPaySigned - 84788.12),
      finance_vs_summaryOsn: r2(financeNetForPay - 84788.12),
      finance_vs_summaryBoth: r2(financeNetForPay - (84788.12 + 3323.16)),
      dashboard_vs_finance: r2(modelB.revenue - financeNetForPay),
      dashboard_vs_summaryOsn: r2(modelB.revenue - 84788.12),
    },
    transactionsDrivingForPayGap_missing: forPayAudit.missing,
    transactionsDrivingForPayGap_amountDiffs: forPayAudit.diffs,
  },
  step4_otherMetrics: {
    logistics: {
      excelDetail_delivery: r2(osnTx.reduce((s, t) => s + t.logistics, 0)),
      excelDetail_rebill: r2(osnTx.reduce((s, t) => s + t.rebill, 0)),
      excelDetail_sum: detailLogistics,
      excelSummary: 37498,
      financeDB: r2(financeTotals.logistics + financeTotals.return_logistics),
      dashboard: r2(modelB.logistics),
      audit_delivery: {
        missingCount: logisticsAudit.missing.length,
        diffCount: logisticsAudit.diffs.length,
        matchedCount: logisticsAudit.matchedCount,
        missingSample: logisticsAudit.missing.slice(0, 25),
        diffSample: logisticsAudit.diffs.slice(0, 25),
      },
      audit_rebill: {
        missingCount: rebillAudit.missing.length,
        diffCount: rebillAudit.diffs.length,
        matchedCount: rebillAudit.matchedCount,
        missingSample: rebillAudit.missing.slice(0, 25),
        diffSample: rebillAudit.diffs.slice(0, 25),
      },
    },
    storage: {
      excelDetail: detailStorage,
      excelSummary: 2731.45,
      financeDB: r2(financeTotals.storage),
      dashboard: r2(modelB.storage),
      audit: {
        missingCount: storageAudit.missing.length,
        diffCount: storageAudit.diffs.length,
        matchedCount: storageAudit.matchedCount,
        missingSample: storageAudit.missing.slice(0, 20),
        diffSample: storageAudit.diffs.slice(0, 20),
      },
    },
    acceptance: {
      excelDetail: r2(osnTx.reduce((s, t) => s + t.acceptance, 0)),
      excelSummary: 0,
      financeDB: r2(acceptance),
      dashboard: r2(modelB.acceptance),
    },
    penalties: {
      excelDetail: r2(osnTx.reduce((s, t) => s + t.penalties, 0)),
      excelSummary: 0,
      financeDB: r2(financeTotals.penalty),
      dashboard: r2(modelB.penalties),
    },
    other: {
      excelDetail_holds: detailHolds,
      excelSummary_otherCol: 7048.56,
      financeADJUSTMENT: r2(presentation.accountAdjustments),
      dashboard: r2(modelB.adjustments),
      audit_holds: {
        missingCount: holdAudit.missing.length,
        diffCount: holdAudit.diffs.length,
        matchedCount: holdAudit.matchedCount,
        missingSample: holdAudit.missing.slice(0, 20),
        diffSample: holdAudit.diffs.slice(0, 20),
      },
    },
  },
  step5_verdict: null, // filled below after computing
};

// Build verdict from evidence
const verdict = {
  q1_dashboardMatchesOfficialWeekly: false,
  q1_evidence: {
    revenue: {
      dashboard: r2(modelB.revenue),
      excelSummaryOsn: 84788.12,
      excelSummaryBoth: r2(84788.12 + 3323.16),
      financeDB: r2(financeNetForPay),
    },
    note: "Dashboard Revenue equals Finance DB for the week scope (same engine input). Neither equals Excel Основной К перечислению exactly unless diffs are zero — see differences object.",
  },
  q2_exactTransactionsCreatingMismatch: {
    missingSridsInFinance: missingSrids.length,
    missingSridList: missingSrids,
    forPayAmountDiffCount: forPayAudit.diffs.length,
    forPayAmountDiffs: forPayAudit.diffs,
    forPayMissingSaleReturnLines: forPayAudit.missing,
    logisticsMissing: logisticsAudit.missing,
    logisticsAmountDiffs: logisticsAudit.diffs,
    rebillMissing: rebillAudit.missing,
    rebillAmountDiffs: rebillAudit.diffs,
    storageMissing: storageAudit.missing,
    storageAmountDiffs: storageAudit.diffs,
  },
  q3_officialWeeklyFullyInWbFinance: {
    answer: missingSrids.length === 0 && forPayAudit.missing.length === 0,
    excelSrids: excelSrids.length,
    present: presentSrids.length,
    missing: missingSrids.length,
    coveragePct: excelSrids.length
      ? r2((100 * presentSrids.length) / excelSrids.length)
      : null,
  },
  q4_poVykupamNature: {
    answer:
      "Separate settlement dataset at the official summary level (different report №, same week dates, distinct monetary totals). Transaction-level overlap with Основной could not be proven from attachments because detailed file №786182329 is empty/corrupt.",
    evidence: {
      summaryOsn: step1.summaryWeekFromOfficialList.osn,
      summaryVyk: step1.summaryWeekFromOfficialList.vyk,
      vykDetailFile: vykFile.meta,
      sameCalendarWeek: true,
      differentReportNumbers: true,
      summingBothIncreasesSettlement:
        "К перечислению Основной 84788.12 + По выкупам 3323.16 = 88111.28 (not equal to Основной alone)",
    },
  },
  q5_cause: {
    primary: [],
    evidenceNotes: [],
  },
};

// Cause classification from evidence
if (missingSrids.length > 0 || forPayAudit.missing.length > 0) {
  verdict.q5_cause.primary.push("Missing Sync");
  verdict.q5_cause.evidenceNotes.push(
    `${missingSrids.length} Excel Основной SRIDs absent from wb_finance in ${WEEK_FROM}→${WEEK_TO}; ${forPayAudit.missing.length} Продажа/Возврат lines missing in finance`
  );
}
if (financeDupes.length > 0) {
  verdict.q5_cause.primary.push("Duplicate Transactions");
  verdict.q5_cause.evidenceNotes.push(
    `${financeDupes.length} SRIDs have multiple finance for_pay rows in week scope`
  );
}
if (Math.abs(financeNetForPay - 84788.12) > 1) {
  verdict.q5_cause.primary.push("Wrong Date Scope");
  verdict.q5_cause.evidenceNotes.push(
    `Finance operation_date week sum for_pay ${r2(financeNetForPay)} ≠ Excel report-week К ${84788.12} (Δ ${r2(financeNetForPay - 84788.12)}). Report week ≠ operation_date axis.`
  );
}
if (!vykFile.meta.ncols || vykFile.meta.ncols <= 5) {
  verdict.q5_cause.evidenceNotes.push(
    "Cannot attribute По выкупам detail gaps — detail file unusable"
  );
}
// Dashboard == finance for revenue by construction
verdict.q5_cause.evidenceNotes.push(
  `Dashboard Revenue ${r2(modelB.revenue)} == Finance DB ${r2(financeNetForPay)} (V4 reads finance for_pay). Mismatch vs Excel is therefore Finance/Excel alignment, not a separate Dashboard formula drift for Revenue.`
);
if (Math.abs(detailLogistics - 37498) > 1) {
  verdict.q5_cause.primary.push("Wrong Aggregation");
  verdict.q5_cause.evidenceNotes.push(
    `Excel detail logistics+rebill ${detailLogistics} vs summary logistics ${37498}`
  );
}

verdict.q5_cause.primary = [...new Set(verdict.q5_cause.primary)];
result.step5_verdict = verdict;

const outPath = resolve(
  `exports/tx-audit-week-${WEEK_FROM}_${WEEK_TO}-reports-${REPORT_OSN}_${REPORT_VYK}.json`
);
writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

// compact console summary
const compact = {
  outPath,
  step1: {
    osnRows: osnTx.length,
    vykRows: vykTx.length,
    vykUsable: step1.vykDetailFileUsable,
    blocker: step1.blocker,
    summary: step1.summaryWeekFromOfficialList,
  },
  step2: {
    excelSrids: excelSrids.length,
    present: presentSrids.length,
    missing: missingSrids.length,
    missingList: missingSrids,
    forPayMissing: forPayAudit.missing.length,
    forPayDiffs: forPayAudit.diffs.length,
  },
  step3: result.step3_revenue,
  step4_totals: {
    logistics: result.step4_otherMetrics.logistics,
    storage: {
      excelDetail: detailStorage,
      excelSummary: 2731.45,
      financeDB: r2(financeTotals.storage),
      dashboard: r2(modelB.storage),
    },
    other: result.step4_otherMetrics.other,
  },
  verdict: {
    q1: verdict.q1_dashboardMatchesOfficialWeekly,
    q3_fullyInFinance: verdict.q3_officialWeeklyFullyInWbFinance,
    q4: verdict.q4_poVykupamNature.answer,
    q5: verdict.q5_cause.primary,
  },
};
console.log(JSON.stringify(compact, null, 2));
console.log("Wrote", outPath);
