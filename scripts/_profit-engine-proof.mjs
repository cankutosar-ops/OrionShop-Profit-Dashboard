#!/usr/bin/env node
/** One-off profit engine proof — not production code */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import XLSX from "xlsx";

const TOL = 0.02;
const EXCEL =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №758163502_68674/Еженедельный детализированный отчет №758163502_68674 - 1.xlsx";
const ACCOUNT_ID = "2";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function parseNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function datePart(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function close(a, b) {
  return Math.abs(a - b) <= TOL;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readExcel(path) {
  const wb = XLSX.read(readFileSync(path));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows;
}

function sumField(rows, getter) {
  return round2(rows.reduce((s, r) => s + getter(r), 0));
}

async function fetchAll(url, path, headers) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${url}${path}${sep}offset=${offset}&limit=${limit}`, { headers });
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

function categorizeFinance(row) {
  const cat = row.finance_category;
  if (cat) return cat;
  const suffix = row.wb_source_suffix || (row.source_key || "").split(":").pop();
  const map = {
    commission: "COMMISSION",
    logistics: "LOGISTICS",
    oper_logistics: "LOGISTICS",
    return_logistics: "RETURN_LOGISTICS",
    oper_return_logistics: "RETURN_LOGISTICS",
    storage: "STORAGE",
    oper_storage: "STORAGE",
    penalty: "PENALTY",
    oper_penalty: "PENALTY",
    acquiring_fee: "ACQUIRING",
    ppvz_reward: "PPVZ_REWARD",
    ppvz_vw: "PPVZ_VW",
    deduction: "ADJUSTMENT",
    additional_payment: "COMPENSATION",
    acceptance: "OTHER",
  };
  return map[suffix] || "OTHER";
}

function engineProfit(revenue, fees) {
  return round2(
    revenue -
      fees.commission -
      fees.acquiring -
      fees.ppvzReward -
      fees.ppvzVw -
      fees.otherMarketplace -
      fees.adjustment +
      fees.compensation -
      fees.logistics -
      fees.returnLogistics -
      fees.storage -
      fees.penalty -
      fees.productCost -
      fees.advertising
  );
}

function marketplaceFeesFromEngine(fees) {
  return round2(
    fees.commission + fees.acquiring + fees.ppvzReward + fees.ppvzVw + fees.otherMarketplace + fees.adjustment
  );
}

// --- Excel ---
const excelRows = readExcel(EXCEL);
const saleExcel = excelRows.filter((r) => String(r["Обоснование для оплаты"] || "").trim() === "Продажа");
const excelDates = saleExcel.map((r) => datePart(r["Дата продажи"])).filter(Boolean).sort();
const from = excelDates[0] || "";
const to = excelDates[excelDates.length - 1] || "";

const excelTotals = {
  retail_amount: sumField(saleExcel, (r) => parseNum(r["Вайлдберриз реализовал Товар (Пр)"])),
  retail_price_withdisc_rub: sumField(saleExcel, (r) =>
    parseNum(r["Цена розничная с учетом согласованной скидки"] ?? r["Цена розничная с учетом согласованной скидки"])
  ),
  ppvz_for_pay: sumField(saleExcel, (r) => parseNum(r["К перечислению Продавцу за реализованный Товар"])),
  commission: sumField(excelRows, (r) =>
    parseNum(r["Вознаграждение с продаж до вычета услуг поверенного, без НДС"])
  ),
  ppvz_vw: sumField(excelRows, (r) => parseNum(r["Вознаграждение Вайлдберриз (ВВ), без НДС"])),
  ppvz_reward: sumField(excelRows, (r) => parseNum(r["Возмещение за выдачу и возврат товаров на ПВЗ"])),
  acquiring: sumField(excelRows, (r) => parseNum(r["Эквайринг/Комиссии за организацию платежей"])),
  delivery_rub: sumField(excelRows, (r) => parseNum(r["Услуги по доставке товара покупателю"])),
  rebill_logistic_cost: sumField(excelRows, (r) =>
    parseNum(r["Возмещение издержек по перевозке/по складским операциям с товаром"])
  ),
  storage_fee: sumField(excelRows, (r) => parseNum(r["Стоимость хранения"])),
  penalty: sumField(excelRows, (r) => parseNum(r["Общая сумма штрафов"])),
  additional_payment: sumField(excelRows, (r) => parseNum(r["Доплаты"])),
  deduction: sumField(excelRows, (r) => parseNum(r["Прочие удержания/выплаты"])),
  acceptance: sumField(excelRows, (r) => parseNum(r["Стоимость платной приемки"])),
};

// Excel implied seller net from sale rows (forPay) minus all report costs
const excelMarketplaceFees = round2(
  excelTotals.commission + excelTotals.ppvz_vw + excelTotals.ppvz_reward + excelTotals.acquiring
);
const excelAllCosts = round2(
  excelMarketplaceFees +
    excelTotals.delivery_rub +
    excelTotals.rebill_logistic_cost +
    excelTotals.storage_fee +
    excelTotals.penalty +
    excelTotals.deduction +
    excelTotals.acceptance -
    excelTotals.additional_payment
);
const excelNetFromRetail = round2(excelTotals.retail_amount - excelAllCosts);
const excelNetFromForPay = round2(excelTotals.ppvz_for_pay - (excelAllCosts - excelMarketplaceFees));
// forPay already net of commission on sale rows; costs on other rows still apply

// --- Raw exports ---
const exportDirs = [
  "exports/wb-raw-2026-06-30_2026-07-05",
  "exports/wb-raw-2026-06-18_2026-06-29",
];
let salesRaw = [];
let financeRaw = [];
let salesPath = null;
let financePath = null;
for (const dir of exportDirs) {
  const s = loadJson(`${dir}/sales.json`);
  const f = loadJson(`${dir}/finance.json`);
  if (s?.data?.length) {
    salesRaw = s.data;
    salesPath = `${dir}/sales.json`;
  }
  if (f?.data?.length) {
    financeRaw = f.data;
    financePath = `${dir}/finance.json`;
  }
}

const salesCompleted = salesRaw.filter((s) => !String(s.saleID || "").startsWith("R"));
const salesBySrid = new Map(salesCompleted.map((s) => [String(s.srid), s]));

// Match excel sale rows
const rowMatches = [];
for (const ex of saleExcel) {
  const srid = String(ex.Srid || "");
  const salesRow = salesBySrid.get(srid);
  const financeSaleRows = financeRaw.filter(
    (f) => String(f.srid) === srid && String(f.supplier_oper_name || "").includes("Продаж")
  );
  rowMatches.push({
    srid,
    barcode: String(ex["Баркод"] || ""),
    saleDate: datePart(ex["Дата продажи"]),
    excel: {
      retail_amount: parseNum(ex["Вайлдберриз реализовал Товар (Пр)"]),
      retail_price_withdisc_rub: parseNum(ex["Цена розничная с учетом согласованной скидки"]),
      ppvz_for_pay: parseNum(ex["К перечислению Продавцу за реализованный Товар"]),
      commission: parseNum(ex["Вознаграждение с продаж до вычета услуг поверенного, без НДС"]),
    },
    sales: salesRow
      ? {
          finishedPrice: salesRow.finishedPrice,
          forPay: salesRow.forPay,
          priceWithDisc: salesRow.priceWithDisc,
        }
      : null,
    financeSale: financeSaleRows[0]
      ? {
          retail_amount: financeSaleRows[0].retail_amount,
          retail_price_withdisc_rub: financeSaleRows[0].retail_price_withdisc_rub,
          ppvz_for_pay: financeSaleRows[0].ppvz_for_pay,
          ppvz_sales_commission: financeSaleRows[0].ppvz_sales_commission,
        }
      : null,
  });
}

const matchedSales = rowMatches.filter((r) => r.sales);
const matchedFinanceSale = rowMatches.filter((r) => r.financeSale);

function fieldAccuracy(base, excelField, salesField) {
  let hits = 0;
  let total = 0;
  const diffs = [];
  for (const m of rowMatches) {
    if (!m.sales && base === "sales") continue;
    if (!m.financeSale && base === "finance") continue;
    const excelVal = m.excel[excelField];
    const cmp =
      base === "sales"
        ? m.sales[salesField]
        : base === "finance"
          ? m.financeSale[excelField === "commission" ? "ppvz_sales_commission" : excelField]
          : null;
    if (cmp == null) continue;
    total++;
    const diff = Math.abs(excelVal - cmp);
    if (close(excelVal, cmp)) hits++;
    diffs.push(diff);
  }
  return { hits, total, maxDiff: diffs.length ? Math.max(...diffs) : null };
}

const accuracy = {
  finishedPrice_vs_retail: fieldAccuracy("sales", "retail_amount", "finishedPrice"),
  forPay_sales_vs_excel: fieldAccuracy("sales", "ppvz_for_pay", "forPay"),
  priceWithDisc_vs_retail_withdisc: fieldAccuracy("sales", "retail_price_withdisc_rub", "priceWithDisc"),
  finance_retail_vs_excel: fieldAccuracy("finance", "retail_amount", "retail_amount"),
  finance_forPay_vs_excel: fieldAccuracy("finance", "ppvz_for_pay", "ppvz_for_pay"),
};

const salesRevenueBases = {
  finishedPrice: sumField(matchedSales, (m) => m.sales.finishedPrice),
  forPay: sumField(matchedSales, (m) => m.sales.forPay),
  priceWithDisc: sumField(matchedSales, (m) => m.sales.priceWithDisc),
};

// Finance API totals in excel sale-date window (all oper types)
const financeInWindow = financeRaw.filter((f) => {
  const d = datePart(f.rr_dt || f.sale_dt);
  return d >= from && d <= to;
});

function sumFinanceField(rows, field) {
  return round2(rows.reduce((s, r) => s + Math.abs(parseNum(r[field])), 0));
}

const financeApiTotals = {
  retail_amount_sale_rows: sumField(
    financeRaw.filter((f) => String(f.supplier_oper_name || "").includes("Продаж")),
    (r) => parseNum(r.retail_amount)
  ),
  ppvz_for_pay_sale_rows: sumField(
    financeRaw.filter((f) => String(f.supplier_oper_name || "").includes("Продаж")),
    (r) => parseNum(r.ppvz_for_pay)
  ),
  commission: sumFinanceField(financeInWindow, "ppvz_sales_commission"),
  ppvz_vw: sumFinanceField(financeInWindow, "ppvz_vw"),
  ppvz_reward: sumFinanceField(financeInWindow, "ppvz_reward"),
  acquiring: sumFinanceField(financeInWindow, "acquiring_fee"),
  delivery_rub: sumFinanceField(financeInWindow, "delivery_rub"),
  rebill_logistic_cost: sumFinanceField(financeInWindow, "rebill_logistic_cost"),
  storage_fee: sumFinanceField(financeInWindow, "storage_fee"),
  penalty: sumFinanceField(financeInWindow, "penalty"),
};

// --- DB ---
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchDb(table, dateCol) {
  const rows = await fetchAll(
    url,
    `/rest/v1/${table}?select=*&marketplace_account_id=eq.${ACCOUNT_ID}&${dateCol}=gte.${from}&${dateCol}=lte.${to}`,
    headers
  );
  return rows;
}

const dbSales = await fetchDb("wb_sales", "sale_date");
const dbFinance = await fetchDb("wb_finance", "operation_date");
const dbSalesCompleted = dbSales.filter((s) => !s.is_return);

const dbFees = {
  commission: 0,
  acquiring: 0,
  ppvzReward: 0,
  ppvzVw: 0,
  otherMarketplace: 0,
  adjustment: 0,
  compensation: 0,
  logistics: 0,
  returnLogistics: 0,
  storage: 0,
  penalty: 0,
  productCost: 0,
  advertising: 0,
};

for (const row of dbFinance) {
  const cat = categorizeFinance(row);
  const amt = Math.abs(Number(row.amount));
  switch (cat) {
    case "COMMISSION":
      dbFees.commission += amt;
      break;
    case "ACQUIRING":
      dbFees.acquiring += amt;
      break;
    case "PPVZ_REWARD":
      dbFees.ppvzReward += amt;
      break;
    case "PPVZ_VW":
      dbFees.ppvzVw += amt;
      break;
    case "ADJUSTMENT":
      dbFees.adjustment += amt;
      break;
    case "COMPENSATION":
      dbFees.compensation += amt;
      break;
    case "LOGISTICS":
      dbFees.logistics += amt;
      break;
    case "RETURN_LOGISTICS":
      dbFees.returnLogistics += amt;
      break;
    case "STORAGE":
      dbFees.storage += amt;
      break;
    case "PENALTY":
      dbFees.penalty += amt;
      break;
    default:
      dbFees.otherMarketplace += amt;
  }
}
for (const k of Object.keys(dbFees)) dbFees[k] = round2(dbFees[k]);

const dbRevenueFinished = round2(dbSalesCompleted.reduce((s, r) => s + Number(r.revenue), 0));

// Engine variants
const feeSources = {
  excel: {
    commission: excelTotals.commission,
    acquiring: excelTotals.acquiring,
    ppvzReward: excelTotals.ppvz_reward,
    ppvzVw: excelTotals.ppvz_vw,
    otherMarketplace: excelTotals.acceptance,
    adjustment: excelTotals.deduction,
    compensation: excelTotals.additional_payment,
    logistics: excelTotals.delivery_rub,
    returnLogistics: excelTotals.rebill_logistic_cost,
    storage: excelTotals.storage_fee,
    penalty: excelTotals.penalty,
    productCost: 0,
    advertising: 0,
  },
  financeApi: {
    commission: financeApiTotals.commission,
    acquiring: financeApiTotals.acquiring,
    ppvzReward: financeApiTotals.ppvz_reward,
    ppvzVw: financeApiTotals.ppvz_vw,
    otherMarketplace: 0,
    adjustment: 0,
    compensation: 0,
    logistics: financeApiTotals.delivery_rub,
    returnLogistics: financeApiTotals.rebill_logistic_cost,
    storage: financeApiTotals.storage_fee,
    penalty: financeApiTotals.penalty,
    productCost: 0,
    advertising: 0,
  },
  db: dbFees,
};

const revenueBases = {
  finishedPrice_db: dbRevenueFinished,
  finishedPrice_matched_sales: salesRevenueBases.finishedPrice,
  retail_amount_excel: excelTotals.retail_amount,
  retail_amount_finance_api: financeApiTotals.retail_amount_sale_rows,
  ppvz_for_pay_excel: excelTotals.ppvz_for_pay,
  priceWithDisc_matched: salesRevenueBases.priceWithDisc,
};

const scenarios = [];
for (const [revName, revenue] of Object.entries(revenueBases)) {
  for (const [feeName, fees] of Object.entries(feeSources)) {
    scenarios.push({
      revName,
      feeName,
      revenue,
      profit: engineProfit(revenue, fees),
      marketplaceFees: marketplaceFeesFromEngine(fees),
    });
  }
}

// WB report total row if present in excel (sum all monetary columns on all rows)
const reportId = "758163502";

const out = {
  reportId,
  sellerId: "68674",
  accountId: ACCOUNT_ID,
  excelPeriod: { from, to, saleRows: saleExcel.length, totalExcelRows: excelRows.length },
  dataSources: {
    salesPath,
    financePath,
    salesRawRows: salesRaw.length,
    financeRawRows: financeRaw.length,
    financeRawHasData: financeRaw.length > 0,
    dbSalesRows: dbSales.length,
    dbFinanceRows: dbFinance.length,
  },
  matching: {
    excelSaleRows: saleExcel.length,
    matchedToSalesApi: matchedSales.length,
    matchedToFinanceApiSaleRows: matchedFinanceSale.length,
  },
  accuracy,
  excelTotals,
  excelMarketplaceFees,
  excelAllCosts,
  excelNetFromRetail,
  salesRevenueBases,
  financeApiTotals,
  dbRevenueFinished,
  dbFees,
  rowLevelSamples: rowMatches.slice(0, 3).map((m) => ({
    srid: m.srid,
    excel_retail: m.excel.retail_amount,
    sales_finishedPrice: m.sales?.finishedPrice,
    sales_forPay: m.sales?.forPay,
    diff_finished_vs_retail: m.sales ? round2(m.sales.finishedPrice - m.excel.retail_amount) : null,
    diff_forPay_vs_excel: m.sales ? round2(m.sales.forPay - m.excel.ppvz_for_pay) : null,
  })),
  scenarios: scenarios.filter(
    (s) =>
      s.feeName === "excel" ||
      (s.feeName === "db" && s.revName.startsWith("finishedPrice")) ||
      (s.feeName === "financeApi" && financeRaw.length > 0)
  ),
};

console.log(JSON.stringify(out, null, 2));
