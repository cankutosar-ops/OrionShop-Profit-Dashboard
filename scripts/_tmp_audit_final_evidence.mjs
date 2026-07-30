/**
 * Finalize transaction evidence: signed revenue, vyk composition, sales vs finance coverage.
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const sb = createAdminClient();

const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function load(path) {
  const wb = XLSX.readFile(path, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}
function map(r, type) {
  return {
    type,
    srid: r.Srid == null || r.Srid === "" ? null : String(r.Srid),
    justification: String(r["Обоснование для оплаты"] ?? ""),
    nmId: String(r["Код номенклатуры"] ?? ""),
    barcode: String(r["Баркод"] ?? ""),
    qty: num(r["Кол-во"]),
    ppvz: num(r["К перечислению Продавцу за реализованный Товар"]),
    logistics: num(r["Услуги по доставке товара покупателю"]),
    rebill: num(r["Возмещение издержек по перевозке/по складским операциям с товаром"]),
    storage: num(r["Хранение"]),
    penalties: num(r["Общая сумма штрафов"]),
    acceptance: num(r["Операции на приемке"]),
    holds: num(r["Удержания"]),
    saleDate: r["Дата продажи"] == null ? null : String(r["Дата продажи"]).slice(0, 10),
  };
}

const PATH_OSN =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const PATH_VYK =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182329_1202289/Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx";
const PATH_SUMMARY =
  "c:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";

const osn = load(PATH_OSN).map((r) => map(r, "Основной"));
const vyk = load(PATH_VYK).map((r) => map(r, "По выкупам"));

const byJ = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const j = r.justification || "(blank)";
    if (!m.has(j)) m.set(j, { rows: 0, ppvz: 0, logistics: 0, rebill: 0, storage: 0, holds: 0, penalties: 0, acceptance: 0 });
    const o = m.get(j);
    o.rows++;
    o.ppvz += r.ppvz;
    o.logistics += r.logistics;
    o.rebill += r.rebill;
    o.storage += r.storage;
    o.holds += r.holds;
    o.penalties += r.penalties;
    o.acceptance += r.acceptance;
  }
  return [...m.entries()].map(([j, o]) => ({
    justification: j,
    rows: o.rows,
    ppvz: r2(o.ppvz),
    logistics: r2(o.logistics),
    rebill: r2(o.rebill),
    storage: r2(o.storage),
    holds: r2(o.holds),
    penalties: r2(o.penalties),
    acceptance: r2(o.acceptance),
  }));
};

const osnSales = osn.filter((r) => r.justification === "Продажа");
const osnReturns = osn.filter((r) => r.justification === "Возврат");
const signedOsn = r2(osnSales.reduce((a, r) => a + r.ppvz, 0) - osnReturns.reduce((a, r) => a + r.ppvz, 0));

const vykSales = vyk.filter((r) => r.justification === "Продажа");
const vykReturns = vyk.filter((r) => r.justification === "Возврат");
const signedVyk = r2(vykSales.reduce((a, r) => a + r.ppvz, 0) - vykReturns.reduce((a, r) => a + r.ppvz, 0));

const osnBy = new Map();
for (const r of osn.filter((x) => x.srid)) {
  if (!osnBy.has(r.srid)) osnBy.set(r.srid, []);
  osnBy.get(r.srid).push(r);
}
const vykBy = new Map();
for (const r of vyk.filter((x) => x.srid)) {
  if (!vykBy.has(r.srid)) vykBy.set(r.srid, []);
  vykBy.get(r.srid).push(r);
}
const both = [...osnBy.keys()].filter((s) => vykBy.has(s));

const bothLogistics = both.map((srid) => {
  const a = osnBy.get(srid);
  const b = vykBy.get(srid);
  const osnLog = r2(a.reduce((s, x) => s + x.logistics, 0));
  const vykLog = r2(b.reduce((s, x) => s + x.logistics, 0));
  return {
    srid,
    osnLogistics: osnLog,
    vykLogistics: vykLog,
    logisticsIdentical: Math.abs(osnLog - vykLog) < 0.02,
    osnPpvz: r2(a.reduce((s, x) => s + x.ppvz, 0)),
    vykPpvz: r2(b.reduce((s, x) => s + x.ppvz, 0)),
    osnJust: [...new Set(a.map((x) => x.justification))],
    vykJust: [...new Set(b.map((x) => x.justification))],
  };
});

const sumBothOsnLog = r2(bothLogistics.reduce((s, x) => s + x.osnLogistics, 0));
const sumBothVykLog = r2(bothLogistics.reduce((s, x) => s + x.vykLogistics, 0));

// Finance coverage
const { count: finWeek } = await sb
  .from("wb_finance")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", "1")
  .gte("operation_date", "2026-07-13")
  .lte("operation_date", "2026-07-19");
const { count: finToJul5 } = await sb
  .from("wb_finance")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", "1")
  .gte("operation_date", "2026-07-01")
  .lte("operation_date", "2026-07-05");
const { data: finLatest } = await sb
  .from("wb_finance")
  .select("operation_date,srid,amount,operation_type,source_key")
  .eq("marketplace_account_id", "1")
  .order("operation_date", { ascending: false })
  .limit(3);

// Batch check: how many excel sale SRIDs exist in finance / sales
const saleSrids = [...new Set(osnSales.map((r) => r.srid).filter(Boolean))];
let presentFinance = 0;
let presentSales = 0;
const missingFinanceSaleEvidence = [];
const presentSalesEvidence = [];
for (const srid of saleSrids) {
  const { count: fc } = await sb.from("wb_finance").select("*", { count: "exact", head: true }).eq("srid", srid);
  const { data: sd } = await sb
    .from("wb_sales")
    .select("srid,sale_date,for_pay,price_with_disc,is_return,marketplace_account_id")
    .eq("srid", srid)
    .limit(5);
  if ((fc ?? 0) > 0) presentFinance++;
  else
    missingFinanceSaleEvidence.push({
      srid,
      excelPpvz: osnSales.find((r) => r.srid === srid)?.ppvz,
      saleDate: osnSales.find((r) => r.srid === srid)?.saleDate,
      nmId: osnSales.find((r) => r.srid === srid)?.nmId,
    });
  if ((sd ?? []).length) {
    presentSales++;
    if (presentSalesEvidence.length < 10) {
      presentSalesEvidence.push({ srid, excelPpvz: osnSales.find((r) => r.srid === srid)?.ppvz, salesRows: sd });
    }
  }
}

// Sales week totals
const { data: salesWeek } = await sb
  .from("wb_sales")
  .select("srid,sale_date,for_pay,price_with_disc,is_return,quantity")
  .eq("marketplace_account_id", "1")
  .gte("sale_date", "2026-07-13")
  .lte("sale_date", "2026-07-19T23:59:59");

let salesForPayNet = 0;
let salesGrossPwd = 0;
for (const s of salesWeek ?? []) {
  const q = Number(s.quantity ?? 1) || 1;
  const fp = Math.abs(Number(s.for_pay ?? 0)) * q;
  const pwd = Math.abs(Number(s.price_with_disc ?? 0)) * q;
  if (s.is_return) {
    salesForPayNet -= fp;
    salesGrossPwd -= pwd;
  } else {
    salesForPayNet += fp;
    salesGrossPwd += pwd;
  }
}

// Schema note
const { data: oneFin } = await sb.from("wb_finance").select("*").eq("marketplace_account_id", "1").limit(1);

const summaryRows = load(PATH_SUMMARY);
const weekSummary = summaryRows.filter((r) => {
  const id = String(r["№ отчета"] ?? r["Номер отчета"] ?? "");
  return id === "786182326" || id === "786182329";
});

const out = {
  schema: {
    wb_finance_columns: oneFin?.[0] ? Object.keys(oneFin[0]) : [],
    note: "Live wb_finance has reduced column set; ppvz_for_pay is stored as amount lines with source_key suffix historically, but finance_category/wb_source_suffix columns are absent from live select *.",
  },
  financeCoverage: {
    rows_2026_07_13_to_19: finWeek,
    rows_2026_07_01_to_05: finToJul5,
    latestSample: finLatest,
    excelSaleSrids: saleSrids.length,
    saleSridsPresentInFinance: presentFinance,
    saleSridsMissingInFinance: saleSrids.length - presentFinance,
    saleSridsPresentInWbSales: presentSales,
    missingFinanceSaleEvidence: missingFinanceSaleEvidence.slice(0, 15),
    presentSalesEvidence,
  },
  revenue: {
    excelOsn_signed_saleMinusReturn: signedOsn,
    excelOsn_saleSum: r2(osnSales.reduce((a, r) => a + r.ppvz, 0)),
    excelOsn_returnSum: r2(osnReturns.reduce((a, r) => a + r.ppvz, 0)),
    excelVyk_signed: signedVyk,
    excelVyk_byJustification: byJ(vyk),
    excelOsn_byJustification: byJ(osn),
    summaryOsn_K: 84788.12,
    summaryVyk_K: 3323.16,
    summaryBoth_K: 88111.28,
    detailOsnSigned_minus_summaryOsn: r2(signedOsn - 84788.12),
    salesAPI_week_forPayNet: r2(salesForPayNet),
    salesAPI_week_rowCount: (salesWeek ?? []).length,
    financeDB_week: 0,
    dashboard_Revenue_equals_finance_week: 0,
  },
  step1_overlap: {
    bothSridCount: both.length,
    onlyVykCount: [...vykBy.keys()].filter((s) => !osnBy.has(s)).length,
    bothLogistics,
    sumBothOsnLogistics: sumBothOsnLog,
    sumBothVykLogistics: sumBothVykLog,
    logisticsDuplicatedAcrossReports: bothLogistics.every((x) => x.logisticsIdentical),
    note: "All 9 По выкупам SRIDs also appear in Основной. For overlapping SRIDs, logistics line totals match exactly between the two reports (duplicate representation of same logistics amounts).",
  },
  weekSummaryRows: weekSummary,
};
writeFileSync("exports/_tmp_audit_final_evidence.json", JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      financeWeek: finWeek,
      latestFin: finLatest?.[0]?.operation_date,
      saleSrids: saleSrids.length,
      inFinance: presentFinance,
      inSales: presentSales,
      signedOsn,
      signedVyk,
      vykJust: byJ(vyk),
      both: both.length,
      logDup: bothLogistics.every((x) => x.logisticsIdentical),
      sumBothLog: { osn: sumBothOsnLog, vyk: sumBothVykLog },
      salesForPayNet: r2(salesForPayNet),
      detailMinusSummaryOsn: r2(signedOsn - 84788.12),
    },
    null,
    2
  )
);
