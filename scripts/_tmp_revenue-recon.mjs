/**
 * Revenue Reconciliation Audit — Excel ground truth vs DB
 * Period: 2026-01-01 → 2026-07-19 (exact)
 * Excel: Еженедельный отчет …_1202289.xlsx
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";
import {
  parseWbSourceSuffix,
  effectiveFinanceCategory,
} from "../src/lib/finance-category.ts";
import { buildNetSalesFromDb } from "../src/lib/sales-revenue-resolution.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const EXCEL =
  "C:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";
const FROM = "2026-01-01";
const TO = "2026-07-19";
const ACCOUNT = "1";

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function toYmd(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    // Excel dates may be UTC; weekly reports use Moscow calendar dates in ISO strings
    const s = v.toISOString();
    return s.slice(0, 10);
  }
  const s = String(v);
  // 2026-04-13T00:00:00+03:00
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function overlapsPeriod(start, end, from, to) {
  // weekly report overlaps dashboard range if [start,end] intersects [from,to]
  return start <= to && end >= from;
}

async function fetchAll(client, table, dateCol, from, to) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("marketplace_account_id", ACCOUNT)
      .gte(dateCol, from)
      .lte(dateCol, to)
      .range(offset, offset + 999);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function fetchSalesReports(_client, _from, _to) {
  // Optional: table name varies; Excel is ground truth for weekly forPaySum.
  // Skip DB weekly reports table if absent — Excel К перечислению is SOT.
  return [];
}

async function main() {
  loadEnv();
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ---- Excel ----
  const wb = XLSX.readFile(EXCEL, { cellDates: true });
  const allExcel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    defval: null,
    raw: true,
  });
  const cols = Object.keys(allExcel[0] || {});

  const excelInRange = [];
  for (const row of allExcel) {
    const start = toYmd(row["Дата начала"]);
    const end = toYmd(row["Дата конца"]);
    if (!start || !end) continue;
    // Include week if it overlaps [FROM, TO]
    // User asked EXACT period 2026-01-01 → 2026-07-19
    // Standard: weeks whose date_from/date_to overlap the period
    if (!overlapsPeriod(start, end, FROM, TO)) continue;
    // Also exclude weeks entirely before 2026-01-01 already handled
    excelInRange.push({
      id: row["№ отчета"],
      start,
      end,
      type: row["Тип отчета"],
      prodazha: num(row["Продажа"]),
      loyaltyComp: num(
        row["В том числе Компенсация скидки по программе лояльности"]
      ),
      kPerechisleniyu: num(row["К перечислению за товар"]),
      logistics: num(row["Стоимость логистики"]),
      storage: num(row["Стоимость хранения"]),
      acceptance: num(row["Стоимость операций на приемке"]),
      // Column may be named oddly in file — try known keys
      otherHold:
        num(row["Прочие удержания/выплаты"]) ||
        num(row['"x']) ||
        num(row["x"]) ||
        0,
      penalties: num(row["Общая сумма штрафов"]),
      totalPay: num(row["Итого к оплате"]),
      raw: row,
    });
  }

  // Fix otherHold: inspect which column index 13 is
  // From preview: col13 was "\"x" with values like 15000 — that's likely «Прочие удержания»
  // Re-read with header:1 to get exact header for col 13-20
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: true,
  });
  const header = grid[0].map((h) => (h == null ? "" : String(h)));

  // Rebuild excel rows with all monetary columns by header name
  const excelRows = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i] || [];
    if (!r[0]) continue;
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx];
    });
    const start = toYmd(obj["Дата начала"]);
    const end = toYmd(obj["Дата конца"]);
    if (!start || !end) continue;
    if (!overlapsPeriod(start, end, FROM, TO)) continue;
    excelRows.push({
      id: obj["№ отчета"],
      start,
      end,
      type: obj["Тип отчета"],
      prodazha: num(obj["Продажа"]),
      loyaltyComp: num(
        obj["В том числе Компенсация скидки по программе лояльности"]
      ),
      kPerechisleniyu: num(obj["К перечислению за товар"]),
      logistics: num(obj["Стоимость логистики"]),
      storage: num(obj["Стоимость хранения"]),
      acceptance: num(obj["Стоимость операций на приемке"]),
      otherHold: num(obj["Прочие удержания/выплаты"]),
      penalties: num(obj["Общая сумма штрафов"]),
      totalPay: num(obj["Итого к оплате"]),
      // any extra numeric headers
      extras: Object.fromEntries(
        header
          .filter(
            (h) =>
              ![
                "№ отчета",
                "Юридическое лицо",
                "Дата начала",
                "Дата конца",
                "Дата формирования",
                "Тип отчета",
                "Продажа",
                "В том числе Компенсация скидки по программе лояльности",
                "К перечислению за товар",
                "Согласованная скидка, %",
                "Стоимость логистики",
                "Стоимость хранения",
                "Стоимость операций на приемке",
                "Прочие удержания/выплаты",
                "Общая сумма штрафов",
                "Итого к оплате",
              ].includes(h)
          )
          .map((h) => [h, obj[h]])
      ),
    });
  }

  // If otherHold all zero, map from broken header "\"x"
  if (excelRows.every((r) => r.otherHold === 0)) {
    const xIdx = header.findIndex(
      (h) => /удерж/i.test(h) || h === '"x' || h === "x" || /Прочие/i.test(h)
    );
    if (xIdx >= 0) {
      for (let i = 0; i < excelRows.length; i++) {
        // find matching grid row by report id
        const gridRow = grid.find((r) => String(r[0]) === String(excelRows[i].id));
        if (gridRow) excelRows[i].otherHold = num(gridRow[xIdx]);
      }
    }
  }

  const excel = {
    weekCount: excelRows.length,
    reportIds: excelRows.map((r) => r.id),
    dateSpan: {
      minStart: excelRows.map((r) => r.start).sort()[0],
      maxEnd: excelRows.map((r) => r.end).sort().slice(-1)[0],
    },
    prodazha: r2(excelRows.reduce((s, r) => s + r.prodazha, 0)),
    loyaltyComp: r2(excelRows.reduce((s, r) => s + r.loyaltyComp, 0)),
    kPerechisleniyu: r2(excelRows.reduce((s, r) => s + r.kPerechisleniyu, 0)),
    logistics: r2(excelRows.reduce((s, r) => s + r.logistics, 0)),
    storage: r2(excelRows.reduce((s, r) => s + r.storage, 0)),
    acceptance: r2(excelRows.reduce((s, r) => s + r.acceptance, 0)),
    otherHold: r2(excelRows.reduce((s, r) => s + r.otherHold, 0)),
    penalties: r2(excelRows.reduce((s, r) => s + r.penalties, 0)),
    totalPay: r2(excelRows.reduce((s, r) => s + r.totalPay, 0)),
    // Implied marketplace take from goods: Продажа − К перечислению
    impliedGoodsFee: 0,
  };
  excel.impliedGoodsFee = r2(excel.prodazha - excel.kPerechisleniyu);
  excel.settlementCheck = r2(
    excel.kPerechisleniyu -
      excel.logistics -
      excel.storage -
      excel.acceptance -
      excel.otherHold -
      excel.penalties
  );
  excel.totalPay_vs_formula = r2(excel.totalPay - excel.settlementCheck);

  // ---- Database ----
  const [sales, finance, salesReports] = await Promise.all([
    fetchAll(client, "wb_sales", "sale_date", FROM, TO),
    fetchAll(client, "wb_finance", "operation_date", FROM, TO),
    fetchSalesReports(client, FROM, TO),
  ]);

  const netSales = buildNetSalesFromDb(sales);
  let salesForPay = 0;
  let finishedPricePurch = 0;
  let finishedPriceRet = 0;
  for (const s of sales) {
    const fp = Math.abs(Number(s.for_pay ?? 0));
    const fin = Math.abs(Number(s.revenue ?? s.finished_price ?? 0));
    if (s.is_return) {
      salesForPay -= fp;
      finishedPriceRet += fin;
    } else {
      salesForPay += fp;
      finishedPricePurch += fin;
    }
  }
  salesForPay = r2(salesForPay);
  const modelBCommission = r2(Math.max(0, netSales.netSales - salesForPay));

  const cats = summarizeFinanceByCategory(finance);
  // signed for_pay from finance
  let financeNetForPay = 0;
  let financeForPayAbs = 0;
  for (const row of finance) {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix !== "for_pay") continue;
    financeNetForPay += Number(row.amount);
    financeForPayAbs += Math.abs(Number(row.amount));
  }
  financeNetForPay = r2(financeNetForPay);
  financeForPayAbs = r2(financeForPayAbs);

  // weekly reports forPaySum
  let weeklyForPaySum = 0;
  const weeklyDetails = [];
  for (const rep of salesReports) {
    const fp = num(rep.for_pay_sum ?? rep.forPaySum);
    weeklyForPaySum += fp;
    weeklyDetails.push({
      id: rep.realizationreport_id ?? rep.id,
      from: String(rep.date_from || "").slice(0, 10),
      to: String(rep.date_to || "").slice(0, 10),
      forPaySum: fp,
    });
  }
  weeklyForPaySum = r2(weeklyForPaySum);

  const logistics = r2(cats.LOGISTICS + cats.RETURN_LOGISTICS);
  const db = {
    netSales_priceWithDisc: r2(netSales.netSales),
    grossSales: r2(netSales.grossSales),
    returnedSales: r2(netSales.returnedSales),
    salesForPay,
    modelBCommission,
    finishedPrice_net: r2(finishedPricePurch - finishedPriceRet),
    finance: {
      COMMISSION: r2(cats.COMMISSION),
      ACQUIRING: r2(cats.ACQUIRING),
      PPVZ_REWARD: r2(cats.PPVZ_REWARD),
      PPVZ_VW: r2(cats.PPVZ_VW),
      OTHER: r2(cats.OTHER),
      ADJUSTMENT: r2(cats.ADJUSTMENT),
      COMPENSATION: r2(cats.COMPENSATION),
      LOGISTICS: r2(cats.LOGISTICS),
      RETURN_LOGISTICS: r2(cats.RETURN_LOGISTICS),
      logistics_total: logistics,
      STORAGE: r2(cats.STORAGE),
      PENALTY: r2(cats.PENALTY),
      marketplaceFees_display: r2(
        cats.COMMISSION +
          cats.ACQUIRING +
          cats.PPVZ_REWARD +
          cats.PPVZ_VW +
          cats.OTHER
      ),
      financeNetForPay_signed: financeNetForPay,
      financeForPayAbs,
    },
    weeklyReports: {
      count: salesReports.length,
      forPaySum: weeklyForPaySum,
      details: weeklyDetails,
    },
  };

  // Commercial Model B seller payout (dashboard formula, recalculated)
  const sellerPayout = r2(
    salesForPay -
      cats.ACQUIRING -
      logistics -
      cats.STORAGE -
      cats.PENALTY -
      cats.ADJUSTMENT
  );

  // Excel settlement operational result
  const excelOp = r2(
    excel.kPerechisleniyu -
      excel.logistics -
      excel.storage -
      excel.acceptance -
      excel.otherHold -
      excel.penalties
  );

  const reconciliation = [
    {
      metric: "Sales (Excel Продажа / DB priceWithDisc net)",
      excel: excel.prodazha,
      dashboard: db.netSales_priceWithDisc,
      diff: r2(db.netSales_priceWithDisc - excel.prodazha),
      note: "Different definitions: Excel «Продажа» = realized retail; DB Sales = priceWithDisc net",
    },
    {
      metric: "Sales (DB finishedPrice/revenue net)",
      excel: excel.prodazha,
      dashboard: db.finishedPrice_net,
      diff: r2(db.finishedPrice_net - excel.prodazha),
      note: "finishedPrice closer to Excel Продажа",
    },
    {
      metric: "К перечислению за товар / goods settlement (Excel)",
      excel: excel.kPerechisleniyu,
      dashboard: db.finance.financeNetForPay_signed,
      diff: r2(db.finance.financeNetForPay_signed - excel.kPerechisleniyu),
      note: "DB = Σ signed wb_finance for_pay (ppvz_for_pay) by operation_date",
    },
    {
      metric: "К перечислению vs weekly forPaySum (DB reports table)",
      excel: excel.kPerechisleniyu,
      dashboard: db.weeklyReports.forPaySum,
      diff: r2(db.weeklyReports.forPaySum - excel.kPerechisleniyu),
      note: "wb_sales_reports.for_pay_sum overlapping weeks",
    },
    {
      metric: "Commercial Revenue (Sales API forPay) — Dashboard Model B",
      excel: excel.kPerechisleniyu,
      dashboard: db.salesForPay,
      diff: r2(db.salesForPay - excel.kPerechisleniyu),
      note: "Dashboard Revenue ≠ Excel К перечислению — known dual-base gap",
    },
    {
      metric: "Implied goods fee (Excel Продажа − К перечислению)",
      excel: excel.impliedGoodsFee,
      dashboard: r2(
        db.finance.COMMISSION +
          db.finance.ACQUIRING +
          db.finance.PPVZ_REWARD +
          db.finance.PPVZ_VW
      ),
      diff: r2(
        db.finance.COMMISSION +
          db.finance.ACQUIRING +
          db.finance.PPVZ_REWARD +
          db.finance.PPVZ_VW -
          excel.impliedGoodsFee
      ),
      note: "Excel implied fee vs abs finance triple+acquiring — not same signed economics",
    },
    {
      metric: "Model B Commission (priceWithDisc − salesForPay)",
      excel: null,
      dashboard: db.modelBCommission,
      diff: null,
      note: "Not an Excel column — Sales API spread only",
    },
    {
      metric: "Acquiring (DB acquiring_fee)",
      excel: null,
      dashboard: db.finance.ACQUIRING,
      diff: null,
      note: "Not a separate Excel weekly column — inside goods settlement",
    },
    {
      metric: "Logistics",
      excel: excel.logistics,
      dashboard: db.finance.logistics_total,
      diff: r2(db.finance.logistics_total - excel.logistics),
      note: "DB LOGISTICS + RETURN_LOGISTICS by operation_date",
    },
    {
      metric: "Storage",
      excel: excel.storage,
      dashboard: db.finance.STORAGE,
      diff: r2(db.finance.STORAGE - excel.storage),
    },
    {
      metric: "Acceptance",
      excel: excel.acceptance,
      dashboard: db.finance.OTHER, // acceptance maps to OTHER in category — incomplete
      diff: null,
      note: "Acceptance is OTHER/suffix acceptance — not equal to OTHER bucket",
    },
    {
      metric: "Penalties",
      excel: excel.penalties,
      dashboard: db.finance.PENALTY,
      diff: r2(db.finance.PENALTY - excel.penalties),
    },
    {
      metric: "Adjustments / Прочие удержания",
      excel: excel.otherHold,
      dashboard: db.finance.ADJUSTMENT,
      diff: r2(db.finance.ADJUSTMENT - excel.otherHold),
    },
    {
      metric: "Итого к оплате / Excel settlement result",
      excel: excel.totalPay,
      dashboard: excelOp,
      diff: r2(excelOp - excel.totalPay),
      note: "Excel identity: К перечислению − log − stor − accept − other − penalty",
    },
    {
      metric: "Dashboard Seller Payout (forPay − A − L − S − P − Adj)",
      excel: excel.totalPay,
      dashboard: sellerPayout,
      diff: r2(sellerPayout - excel.totalPay),
      note: "Different revenue base + acquiring deducted again vs Excel",
    },
  ];

  // Acceptance exact from DB suffix
  let acceptanceDb = 0;
  for (const row of finance) {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix === "acceptance") acceptanceDb += Math.abs(Number(row.amount));
  }
  acceptanceDb = r2(acceptanceDb);

  // Revenue waterfall candidates
  const waterfall = {
    path_excel_settlement: {
      steps: [
        { name: "Продажа (Excel)", amount: excel.prodazha },
        {
          name: "− implied goods platform effect (Продажа − К перечислению)",
          amount: -excel.impliedGoodsFee,
        },
        { name: "= К перечислению за товар", amount: excel.kPerechisleniyu },
        { name: "− Logistics", amount: -excel.logistics },
        { name: "− Storage", amount: -excel.storage },
        { name: "− Acceptance", amount: -excel.acceptance },
        { name: "− Other holds", amount: -excel.otherHold },
        { name: "− Penalties", amount: -excel.penalties },
        { name: "= Итого к оплате", amount: excel.totalPay },
      ],
    },
    path_dashboard_commercial: {
      steps: [
        { name: "Sales priceWithDisc net", amount: db.netSales_priceWithDisc },
        { name: "− Model B Commission (spread)", amount: -db.modelBCommission },
        { name: "= Revenue (Sales forPay)", amount: db.salesForPay },
        { name: "− Acquiring", amount: -db.finance.ACQUIRING },
        { name: "− Logistics", amount: -db.finance.logistics_total },
        { name: "− Storage", amount: -db.finance.STORAGE },
        { name: "− Penalties", amount: -db.finance.PENALTY },
        { name: "− Adjustments", amount: -db.finance.ADJUSTMENT },
        { name: "= Seller Payout", amount: sellerPayout },
      ],
    },
  };

  const out = {
    period: { from: FROM, to: TO, accountId: ACCOUNT },
    excelFile: EXCEL,
    excelHeader: header,
    excel,
    excelWeekCount: excelRows.length,
    excelWeeks: excelRows.map((r) => ({
      id: r.id,
      start: r.start,
      end: r.end,
      prodazha: r.prodazha,
      kPerechisleniyu: r.kPerechisleniyu,
      logistics: r.logistics,
      storage: r.storage,
      acceptance: r.acceptance,
      otherHold: r.otherHold,
      penalties: r.penalties,
      totalPay: r.totalPay,
    })),
    db,
    acceptanceDb,
    sellerPayout,
    excelOp,
    reconciliation,
    waterfall,
    followUp: {
      estimatedTax:
        "DO NOT IMPLEMENT NOW. Confirmed next change: 6% tax from customer sale amount (Sales / WB selling price), NOT from Seller Payout or Revenue.",
    },
    sqlNotes: {
      sales:
        "SELECT * FROM wb_sales WHERE marketplace_account_id='1' AND sale_date BETWEEN '2026-01-01' AND '2026-07-19'",
      finance:
        "SELECT * FROM wb_finance WHERE marketplace_account_id='1' AND operation_date BETWEEN '2026-01-01' AND '2026-07-19'",
      acquiring:
        "SUM(ABS(amount)) WHERE suffix=acquiring_fee (via source_key/wb_source_suffix)",
      for_pay_finance:
        "SUM(amount) signed WHERE suffix=for_pay",
      sales_for_pay:
        "SUM(for_pay) purchases − SUM(for_pay) returns on wb_sales",
    },
  };

  writeFileSync(
    "exports/revenue-reconciliation-2026-01-01_2026-07-19.json",
    JSON.stringify(out, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        excel: {
          weeks: excel.weekCount,
          prodazha: excel.prodazha,
          kPerechisleniyu: excel.kPerechisleniyu,
          impliedFee: excel.impliedGoodsFee,
          logistics: excel.logistics,
          storage: excel.storage,
          acceptance: excel.acceptance,
          otherHold: excel.otherHold,
          penalties: excel.penalties,
          totalPay: excel.totalPay,
          identityDelta: excel.totalPay_vs_formula,
        },
        db: {
          netSales: db.netSales_priceWithDisc,
          finishedPrice: db.finishedPrice_net,
          salesForPay: db.salesForPay,
          financeForPay: db.finance.financeNetForPay_signed,
          weeklyForPay: db.weeklyReports.forPaySum,
          acquiring: db.finance.ACQUIRING,
          logistics: db.finance.logistics_total,
          storage: db.finance.STORAGE,
          acceptanceDb,
          penalty: db.finance.PENALTY,
          adjustment: db.finance.ADJUSTMENT,
          sellerPayout,
        },
        gaps: {
          salesForPay_minus_excelK: r2(db.salesForPay - excel.kPerechisleniyu),
          financeForPay_minus_excelK: r2(
            db.finance.financeNetForPay_signed - excel.kPerechisleniyu
          ),
          weeklyForPay_minus_excelK: r2(
            db.weeklyReports.forPaySum - excel.kPerechisleniyu
          ),
          sellerPayout_minus_excelTotal: r2(sellerPayout - excel.totalPay),
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
