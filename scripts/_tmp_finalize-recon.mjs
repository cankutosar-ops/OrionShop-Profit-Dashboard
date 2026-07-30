import { readFileSync, writeFileSync } from "fs";

const prev = JSON.parse(
  readFileSync("exports/revenue-reconciliation-2026-01-01_2026-07-19.json", "utf8")
);
const excelFilt = JSON.parse(readFileSync("exports/excel-period-sums.json", "utf8"));
const e = excelFilt.uniqueOsnovnoyWeeks.sum;
const db = prev.db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const status = (diff, tol = 1) => {
  if (diff == null) return "N/A";
  if (Math.abs(diff) <= tol) return "MATCH";
  if (Math.abs(diff) <= 100) return "NEAR";
  return "MISMATCH";
};

const rows = [
  {
    metric: "Sales — Excel Продажа",
    excel: e.prodazha,
    db: db.netSales_priceWithDisc,
    diff: r2(db.netSales_priceWithDisc - e.prodazha),
    explanation:
      "Excel Продажа = realized retail in weekly report. DB priceWithDisc net is catalog-after-seller-discount, not Excel Продажа.",
  },
  {
    metric: "Sales — DB finishedPrice/revenue net (vs Excel Продажа)",
    excel: e.prodazha,
    db: db.finishedPrice_net,
    diff: r2(db.finishedPrice_net - e.prodazha),
    explanation:
      "Closer than priceWithDisc but still not Excel Продажа (SPP/returns/week edges).",
  },
  {
    metric: "К перечислению за товар (Excel goods settlement / WB Revenue base)",
    excel: e.k,
    db: db.finance.financeNetForPay_signed,
    diff: r2(db.finance.financeNetForPay_signed - e.k),
    explanation:
      "DB Σ signed wb_finance amount where suffix=for_pay, operation_date in range. Gap from week vs operation_date axis / sync coverage.",
  },
  {
    metric: "Dashboard Commercial Revenue (Sales API forPay)",
    excel: e.k,
    db: db.salesForPay,
    diff: r2(db.salesForPay - e.k),
    explanation:
      "Dashboard Revenue uses wb_sales.for_pay on sale_date — NOT Excel К перечислению. This is the primary Revenue mismatch.",
  },
  {
    metric: "Logistics",
    excel: e.logistics,
    db: db.finance.logistics_total,
    diff: r2(db.finance.logistics_total - e.logistics),
    explanation:
      "DB LOGISTICS+RETURN_LOGISTICS by operation_date. Excel «Стоимость логистики» on Основной weeks only (excludes По выкупам logistics).",
  },
  {
    metric: "Storage",
    excel: e.storage,
    db: db.finance.STORAGE,
    diff: r2(db.finance.STORAGE - e.storage),
    explanation: "Same concept; residual from date-axis / classification.",
  },
  {
    metric: "Acceptance",
    excel: e.acceptance,
    db: prev.acceptanceDb,
    diff: r2(prev.acceptanceDb - e.acceptance),
    explanation: "MATCH — suffix acceptance.",
  },
  {
    metric: "Penalties",
    excel: e.penalties,
    db: db.finance.PENALTY,
    diff: r2(db.finance.PENALTY - e.penalties),
    explanation: "MATCH",
  },
  {
    metric: "Adjustments / Прочие удержания",
    excel: e.other,
    db: db.finance.ADJUSTMENT,
    diff: r2(db.finance.ADJUSTMENT - e.other),
    explanation: "Near — ADJUSTMENT vs Excel other holds column.",
  },
  {
    metric: "VV adjustment / Compensation",
    excel: e.vvAdj,
    db: db.finance.COMPENSATION,
    diff: r2(db.finance.COMPENSATION - e.vvAdj),
    explanation: "MATCH amount — Excel «Корректировка ВВ»; DB COMPENSATION.",
  },
  {
    metric: "Acquiring",
    excel: null,
    db: db.finance.ACQUIRING,
    diff: null,
    explanation:
      "No separate Excel weekly column. Embedded inside Продажа → К перечислению.",
  },
  {
    metric: "Commission (Finance abs) / Model B Sales spread",
    excel: null,
    db_finance_commission: db.finance.COMMISSION,
    db_modelB_commission: db.modelBCommission,
    diff: null,
    explanation:
      "Excel has no separate Commission column. Model B commission is Sales−forPay spread, not finance commission.",
  },
  {
    metric: "Итого к оплате (Excel settlement result)",
    excel: e.totalPay,
    db_settlement_like: r2(
      db.finance.financeNetForPay_signed -
        db.finance.logistics_total -
        db.finance.STORAGE -
        prev.acceptanceDb -
        db.finance.ADJUSTMENT -
        db.finance.PENALTY -
        db.finance.COMPENSATION
    ),
    dashboard_sellerPayout: prev.sellerPayout,
    diff_settlement_like: null,
    diff_sellerPayout: null,
    explanation:
      "Excel identity: К − log − stor − accept − other − pen − VV_adj = Итого (exact). Dashboard Seller Payout starts from Sales forPay and is not Excel Итого.",
  },
];

// fill diffs for last row
const settleLike = r2(
  db.finance.financeNetForPay_signed -
    db.finance.logistics_total -
    db.finance.STORAGE -
    prev.acceptanceDb -
    db.finance.ADJUSTMENT -
    db.finance.PENALTY -
    db.finance.COMPENSATION
);
rows[rows.length - 1].db_settlement_like = settleLike;
rows[rows.length - 1].diff_settlement_like = r2(settleLike - e.totalPay);
rows[rows.length - 1].diff_sellerPayout = r2(prev.sellerPayout - e.totalPay);
rows[rows.length - 1].status_settlement_like = status(
  rows[rows.length - 1].diff_settlement_like,
  50000
);

for (const row of rows) {
  if (row.diff != null) row.status = status(row.diff);
  else if (row.metric.includes("Acceptance") || row.metric.includes("Penalties") || row.metric.includes("VV"))
    row.status = status(row.diff ?? 0);
}

const final = {
  period: prev.period,
  excelGroundTruth: {
    filter: "Тип отчета = Основной only (29 weeks); exclude По выкупам",
    ...e,
    identity:
      "Итого = К перечислению − logistics − storage − acceptance − other − penalties − VV_adj (Δ=0)",
  },
  database: {
    ...db,
    acceptanceDb: prev.acceptanceDb,
    sellerPayout: prev.sellerPayout,
  },
  reconciliation: rows.map((row) => ({
    ...row,
    status:
      row.status ||
      (row.diff == null
        ? "NO EXCEL COLUMN"
        : status(row.diff)),
  })),
  revenueWaterfall: {
    excel: [
      { step: "Продажа", amount: e.prodazha },
      { step: "→ (platform goods settlement effect)", amount: r2(e.k - e.prodazha) },
      { step: "= К перечислению за товар  << Excel Revenue/goods base", amount: e.k },
      { step: "− Logistics", amount: -e.logistics },
      { step: "− Storage", amount: -e.storage },
      { step: "− Acceptance", amount: -e.acceptance },
      { step: "− Прочие удержания", amount: -e.other },
      { step: "− Penalties", amount: -e.penalties },
      { step: "− Корректировка ВВ", amount: -e.vvAdj },
      { step: "= Итого к оплате", amount: e.totalPay },
    ],
    dashboardCommercial: [
      { step: "Sales priceWithDisc net", amount: db.netSales_priceWithDisc },
      { step: "− Commission (Sales−forPay)", amount: -db.modelBCommission },
      { step: "= Revenue (Sales forPay)", amount: db.salesForPay },
      { step: "− Acquiring", amount: -db.finance.ACQUIRING },
      { step: "− Logistics", amount: -db.finance.logistics_total },
      { step: "− Storage", amount: -db.finance.STORAGE },
      { step: "− Penalties", amount: -db.finance.PENALTY },
      { step: "− Adjustments", amount: -db.finance.ADJUSTMENT },
      { step: "= Seller Payout", amount: prev.sellerPayout },
    ],
    gapAtRevenueBase: {
      excel_K: e.k,
      dashboard_salesForPay: db.salesForPay,
      finance_for_pay: db.finance.financeNetForPay_signed,
      salesForPay_minus_excelK: r2(db.salesForPay - e.k),
      financeForPay_minus_excelK: r2(db.finance.financeNetForPay_signed - e.k),
    },
  },
  sql: prev.sqlNotes,
  followUp_DO_NOT_IMPLEMENT: {
    estimatedTax:
      "Change later: 6% tax from customer sale amount (Sales / WB selling price), NOT Seller Payout or Revenue.",
  },
};

writeFileSync(
  "exports/revenue-reconciliation-FINAL-2026-01-01_2026-07-19.json",
  JSON.stringify(final, null, 2)
);
console.log(
  JSON.stringify(
    {
      excelK: e.k,
      excelItogo: e.totalPay,
      salesForPay: db.salesForPay,
      financeForPay: db.finance.financeNetForPay_signed,
      sellerPayout: prev.sellerPayout,
      settleLike,
      revenueGap_salesForPay: r2(db.salesForPay - e.k),
      revenueGap_financeForPay: r2(db.finance.financeNetForPay_signed - e.k),
    },
    null,
    2
  )
);
