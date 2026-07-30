import { readFileSync, writeFileSync } from "fs";

const SRID = "e8.r70c53dab43d9457eb9e197ef8d6a25d8.0.0";
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const abs = (n) => Math.abs(Number(n) || 0);

function load(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(raw) ? raw : raw.data || [];
}

const sale = load("exports/wb-raw-2026-06-18_2026-06-29/sales.json").find(
  (s) => s.srid === SRID
);
const fin = load("exports/wb-raw-2026-06-18_2026-06-29/finance.json").filter(
  (r) => r.srid === SRID
);
const saleRow = fin.find((r) => /продаж/i.test(r.supplier_oper_name || ""));
const logisticsRow = fin.find((r) =>
  /^логистика$/i.test(String(r.supplier_oper_name || ""))
);
const reimburseRow = fin.find((r) =>
  /возмещен/i.test(String(r.supplier_oper_name || ""))
);

const C = abs(saleRow.ppvz_sales_commission);
const A = abs(saleRow.acquiring_fee);
const R = abs(saleRow.ppvz_reward);
const VW = abs(saleRow.ppvz_vw);
const VW_NDS = abs(saleRow.ppvz_vw_nds);
const PWD = sale.priceWithDisc;
const FOR_PAY_SALES = sale.forPay;
const PPVZ = saleRow.ppvz_for_pay;

const formulas = [
  {
    name: "PWD − |C| − A − |R| − |VW|",
    calc: r2(PWD - C - A - R - VW),
    target: PPVZ,
  },
  {
    name: "PWD − |C| − A − |VW|  (exclude reward)",
    calc: r2(PWD - C - A - VW),
    target: PPVZ,
  },
  {
    name: "PWD − |C| − A − |R| − |VW| − |VW_NDS|",
    calc: r2(PWD - C - A - R - VW - VW_NDS),
    target: PPVZ,
  },
  {
    name: "PWD − |C| − |R| − |VW|  (no acquiring)",
    calc: r2(PWD - C - R - VW),
    target: PPVZ,
  },
  {
    name: "PWD − |C| − A  (exclude R and VW)",
    calc: r2(PWD - C - A),
    target: PPVZ,
  },
  {
    name: "sales.forPay − acquiring",
    calc: r2(FOR_PAY_SALES - A),
    target: PPVZ,
  },
  {
    name: "sales.forPay",
    calc: FOR_PAY_SALES,
    target: PPVZ,
  },
  {
    name: "|C|+|R|+|VW|+A  vs  PWD−ppvz_for_pay",
    calc: r2(C + R + VW + A),
    target: r2(PWD - PPVZ),
  },
  {
    name: "|C|+|R|+|VW|  vs  PWD−sales.forPay",
    calc: r2(C + R + VW),
    target: r2(PWD - FOR_PAY_SALES),
  },
  {
    name: "|C|+A+|VW|−|R|  (signed reward credit hypothesis)",
    calc: r2(PWD - C - A - VW + R),
    target: PPVZ,
  },
  {
    name: "PWD − |C| − A − |VW| + |R|",
    calc: r2(PWD - C - A - VW + R),
    target: PPVZ,
  },
  {
    name: "retail_amount path: finished − ? ",
    calc: r2(sale.finishedPrice - C - A),
    target: PPVZ,
  },
];

for (const f of formulas) f.delta = r2(f.calc - f.target);

// Decompose the gap for the user's requested formula
const requested = {
  formula: "priceWithDisc − |ppvz_sales_commission| − acquiring_fee − |ppvz_reward| − |ppvz_vw|",
  left: r2(PWD - C - A - R - VW),
  right: PPVZ,
  delta: r2(PWD - C - A - R - VW - PPVZ),
  components: {
    priceWithDisc: PWD,
    abs_ppvz_sales_commission: C,
    acquiring_fee: A,
    abs_ppvz_reward: R,
    abs_ppvz_vw: VW,
    abs_ppvz_vw_nds: VW_NDS,
    sum_fees_CRVW_A: r2(C + R + VW + A),
    pwd_minus_ppvz_for_pay: r2(PWD - PPVZ),
    gap_fees_vs_pwd_minus_ppvz: r2(C + R + VW + A - (PWD - PPVZ)),
  },
};

// Known exact identity
const exactIdentity = {
  name: "sales.forPay = ppvz_for_pay + acquiring_fee",
  left: FOR_PAY_SALES,
  right: r2(PPVZ + A),
  delta: r2(FOR_PAY_SALES - (PPVZ + A)),
};

const out = {
  srid: SRID,
  saleID: "S24081604269",
  article: "LILYSIYAH01",
  sourceFinanceFile: "exports/wb-raw-2026-06-18_2026-06-29/finance.json",
  sourceSalesFile: "exports/wb-raw-2026-06-18_2026-06-29/sales.json",
  salesApiComplete: sale,
  financeApiRowsComplete: fin,
  rowOps: fin.map((r) => ({
    rrd_id: r.rrd_id,
    supplier_oper_name: r.supplier_oper_name,
    doc_type_name: r.doc_type_name,
    realizationreport_id: r.realizationreport_id,
  })),
  requestedFormulaProof: requested,
  exactIdentity,
  formulas,
  note_return_delivery_rub:
    "Field return_delivery_rub is NOT present on any Finance API row for this SRID. Return logistics appears as rebill_logistic_cost on the reimbursement row.",
};

writeFileSync(
  "exports/lily-siyah01-finance-proof.json",
  JSON.stringify(out, null, 2)
);

console.log(
  JSON.stringify(
    {
      rowCount: fin.length,
      ops: out.rowOps,
      exactIdentity,
      requestedFormulaProof: requested,
      formulas: formulas.map((f) => ({
        name: f.name,
        calc: f.calc,
        target: f.target,
        delta: f.delta,
      })),
      keySaleRow: {
        retail_price: saleRow.retail_price,
        retail_price_withdisc_rub: saleRow.retail_price_withdisc_rub,
        retail_amount: saleRow.retail_amount,
        ppvz_sales_commission: saleRow.ppvz_sales_commission,
        acquiring_fee: saleRow.acquiring_fee,
        ppvz_reward: saleRow.ppvz_reward,
        ppvz_vw: saleRow.ppvz_vw,
        ppvz_vw_nds: saleRow.ppvz_vw_nds,
        ppvz_for_pay: saleRow.ppvz_for_pay,
        delivery_rub: saleRow.delivery_rub,
        storage_fee: saleRow.storage_fee,
        acceptance: saleRow.acceptance,
        penalty: saleRow.penalty,
        deduction: saleRow.deduction,
        rebill_logistic_cost: saleRow.rebill_logistic_cost,
      },
      logistics: {
        delivery_rub: logisticsRow?.delivery_rub,
        rebill: reimburseRow?.rebill_logistic_cost,
        ppvz_vw: reimburseRow?.ppvz_vw,
      },
    },
    null,
    2
  )
);
