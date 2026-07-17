#!/usr/bin/env node
/** Read-only weekly WB settlement vs dashboard operational proof — Account 1 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const ACCOUNT = 1;
const EXCEL =
  "c:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-05_1202289.xlsx";
const FIN_EXPORT = "exports/wb-raw-account1-portal-proof/finance.json";
const SALES_EXPORT = "exports/wb-raw-account1-portal-proof/sales.json";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const r = (n) => Math.round(n * 100) / 100;

function mapFinanceLines(row) {
  const lines = [];
  const add = (amount, opType) => {
    if (amount && Math.abs(amount) > 0) lines.push({ amount: Math.abs(amount), operation_type: opType });
  };
  add(row.ppvz_sales_commission, "commission");
  add(row.delivery_rub, "logistics");
  add(row.storage_fee, "storage");
  add(row.penalty, "penalty");
  add(row.rebill_logistic_cost, "return_logistics");
  add(row.deduction, "other");
  add(row.acceptance, "other");
  add(row.acquiring_fee, "other");
  add(row.ppvz_reward, "other");
  add(row.ppvz_vw, "other");
  add(row.additional_payment, "other");
  return lines;
}

function rollup(lines) {
  const t = { commission: 0, logistics: 0, return_logistics: 0, storage: 0, penalty: 0, other: 0 };
  for (const l of lines) t[l.operation_type] = (t[l.operation_type] || 0) + l.amount;
  return t;
}

function dashOp(revenue, costs) {
  return r(
    revenue -
      costs.commission -
      costs.logistics -
      costs.return_logistics -
      costs.storage -
      costs.penalty -
      costs.other
  );
}

function wbWeekFromExcel(rows) {
  let sales = 0,
    settle = 0,
    log = 0,
    stor = 0,
    pen = 0,
    ded = 0,
    total = 0;
  const ids = [];
  for (const row of rows) {
    ids.push(row["№ отчета"]);
    sales += +row["Продажа"] || 0;
    settle += +row["К перечислению за товар"] || 0;
    log += +row["Стоимость логистики"] || 0;
    stor += +row["Стоимость хранения"] || 0;
    pen += +row["Общая сумма штрафов"] || 0;
    ded += +row["Прочие удержания/выплаты"] || 0;
    total += +row["Итого к оплате"] || 0;
  }
  const wbFee = sales - settle;
  return {
    ids,
    sales: r(sales),
    settle: r(settle),
    wbFee: r(wbFee),
    log: r(log),
    stor: r(stor),
    pen: r(pen),
    ded: r(ded),
    totalPay: r(total),
    op: r(settle - log - stor - pen - ded),
  };
}

async function fetchDbWeek(sb, from, to) {
  const { data: sales } = await sb
    .from("wb_sales")
    .select("revenue,is_return,sale_date")
    .eq("marketplace_account_id", ACCOUNT)
    .gte("sale_date", from)
    .lte("sale_date", to + "T23:59:59");
  const { data: finance } = await sb
    .from("wb_finance")
    .select("amount,operation_type")
    .eq("marketplace_account_id", ACCOUNT)
    .gte("operation_date", from)
    .lte("operation_date", to);
  const revenue = (sales || [])
    .filter((s) => !s.is_return)
    .reduce((a, s) => a + Math.abs(Number(s.revenue) || 0), 0);
  const costs = { commission: 0, logistics: 0, return_logistics: 0, storage: 0, penalty: 0, other: 0 };
  for (const row of finance || []) {
    const t = row.operation_type;
    if (costs[t] !== undefined) costs[t] += Math.abs(Number(row.amount) || 0);
    else costs.other += Math.abs(Number(row.amount) || 0);
  }
  return {
    revenue: r(revenue),
    costs,
    op: dashOp(revenue, costs),
    saleRows: (sales || []).filter((s) => !s.is_return).length,
    finRows: (finance || []).length,
  };
}

function reportAlignedDash(reportIds, finRaw, salesRaw) {
  const finRows = finRaw.filter((x) => reportIds.includes(x.realizationreport_id));
  const lines = finRows.flatMap(mapFinanceLines);
  const costs = rollup(lines);
  const saleSrids = new Set(
    finRows.filter((x) => x.doc_type_name === "Продажа" && x.srid).map((x) => x.srid)
  );
  const byId = new Map();
  for (const s of salesRaw) {
    const id = s.srid ?? s.saleID;
    if (id) byId.set(id, s);
  }
  let revFinished = 0,
    revForPay = 0;
  for (const srid of saleSrids) {
    const s = byId.get(srid);
    if (!s || String(s.saleID).startsWith("R")) continue;
    revFinished += Math.abs(s.finishedPrice ?? 0);
    revForPay += Math.abs(s.forPay ?? 0);
  }
  const netFor =
    finRows.filter((x) => x.doc_type_name === "Продажа").reduce((a, x) => a + (x.ppvz_for_pay || 0), 0) -
    finRows.filter((x) => x.doc_type_name === "Возврат").reduce((a, x) => a + (x.ppvz_for_pay || 0), 0);
  return {
    revenueFinished: r(revFinished),
    revenueForPay: r(revForPay),
    netForPay: r(netFor),
    costs,
    opFinished: dashOp(revFinished, costs),
    opForPay: dashOp(revForPay, costs),
    opNetForPay: dashOp(netFor, costs),
    finRows: finRows.length,
  };
}

loadEnv();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const excelRows = XLSX.utils.sheet_to_json(XLSX.readFile(EXCEL).Sheets["Sheet1"]);
const weekMap = new Map();
for (const row of excelRows) {
  const from = (row["Дата начала"] || "").slice(0, 10);
  const to = (row["Дата конца"] || "").slice(0, 10);
  const key = `${from}..${to}`;
  if (!weekMap.has(key)) weekMap.set(key, []);
  weekMap.get(key).push(row);
}

const finRaw = existsSync(FIN_EXPORT) ? JSON.parse(readFileSync(FIN_EXPORT, "utf8")).data : [];
const salesRaw = existsSync(SALES_EXPORT) ? JSON.parse(readFileSync(SALES_EXPORT, "utf8")).data : [];
const exportReportIds = new Set(finRaw.map((x) => x.realizationreport_id));

const results = [];
for (const [key, rows] of [...weekMap.entries()].sort()) {
  const [from, to] = key.split("..");
  const wb = wbWeekFromExcel(rows);
  const db = from >= "2026-04-11" ? await fetchDbWeek(sb, from, to) : null;
  const hasExport = wb.ids.some((id) => exportReportIds.has(id));
  const aligned = hasExport ? reportAlignedDash(wb.ids, finRaw, salesRaw) : null;
  results.push({ from, to, wb, db, aligned, hasDb: !!db, hasExport });
}

writeFileSync(
  "exports/weekly-settlement-proof-account1.json",
  JSON.stringify({ generatedAt: new Date().toISOString(), accountId: ACCOUNT, weeks: results }, null, 2)
);

const withDb = results.filter((w) => w.hasDb);
console.log("weeks total", results.length, "with db", withDb.length);
console.log("\n2026 weeks (calendar sale_date / operation_date filter):");
console.log("from\tto\tWB op\tDB op\tdiff");
for (const w of withDb) {
  console.log(`${w.from}\t${w.to}\t${w.wb.op}\t${w.db.op}\t${r(w.db.op - w.wb.op)}`);
}
const t = withDb.reduce((a, w) => ({ wb: a.wb + w.wb.op, db: a.db + w.db.op }), { wb: 0, db: 0 });
console.log("\nTOTAL DB overlap:", r(t.wb), r(t.db), r(t.db - t.wb));

const alignedWeeks = results.filter((w) => w.aligned);
console.log("\nReport-aligned export weeks:");
for (const w of alignedWeeks) {
  console.log(
    `${w.from}..${w.to} WB=${w.wb.op} dashFin=${w.aligned.opFinished} dashNetFor=${w.aligned.opNetForPay} diff=${r(w.aligned.opFinished - w.wb.op)}`
  );
}
