import { readFileSync, writeFileSync } from "fs";

function load(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

const pairs = [
  [
    "exports/wb-raw-2026-06-30_2026-07-05/sales.json",
    "exports/wb-raw-2026-06-30_2026-07-05/finance.json",
  ],
  [
    "exports/wb-raw-2026-06-18_2026-06-29/sales.json",
    "exports/wb-raw-2026-06-18_2026-06-29/finance.json",
  ],
  [
    "exports/wb-raw-account1-portal-proof/sales.json",
    "exports/wb-raw-account1-portal-proof/finance.json",
  ],
];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function financeFields(r) {
  return {
    rrd_id: r.rrd_id ?? r.rrdId,
    supplier_oper_name: r.supplier_oper_name ?? r.supplierOperName,
    doc_type_name: r.doc_type_name ?? r.docTypeName,
    retail_amount: Number(r.retail_amount ?? r.retailAmount ?? 0),
    retail_price: Number(r.retail_price ?? r.retailPrice ?? 0),
    retail_price_withdisc_rub: Number(
      r.retail_price_withdisc_rub ?? r.retailPriceWithDiscRub ?? 0
    ),
    ppvz_for_pay: Number(r.ppvz_for_pay ?? r.ppvzForPay ?? r.forPay ?? 0),
    acquiring_fee: Number(r.acquiring_fee ?? r.acquiringFee ?? 0),
    ppvz_sales_commission: Number(
      r.ppvz_sales_commission ?? r.ppvzSalesCommission ?? 0
    ),
    ppvz_reward: Number(r.ppvz_reward ?? r.ppvzReward ?? 0),
    ppvz_vw: Number(r.ppvz_vw ?? r.ppvzVw ?? 0),
    delivery_rub: Number(r.delivery_rub ?? r.deliveryRub ?? 0),
    storage_fee: Number(r.storage_fee ?? r.storageFee ?? 0),
    penalty: Number(r.penalty ?? 0),
    deduction: Number(r.deduction ?? 0),
    acceptance: Number(r.acceptance ?? 0),
    spp: r.spp ?? r.ppvz_spp_prc ?? null,
    sale_dt: r.sale_dt ?? r.saleDt,
    rr_dt: r.rr_dt ?? r.rrDt,
  };
}

let best = null;

for (const [sp, fp] of pairs) {
  const sales = load(sp).filter(
    (s) =>
      s?.srid &&
      String(s.saleID || "").startsWith("S") &&
      Number(s.forPay) > 0 &&
      Number(s.priceWithDisc) > 0 &&
      Number(s.finishedPrice) > 0 &&
      Number(s.totalPrice) > 0
  );
  const finBySrid = new Map();
  for (const r of load(fp)) {
    if (!r?.srid) continue;
    if (!finBySrid.has(r.srid)) finBySrid.set(r.srid, []);
    finBySrid.get(r.srid).push(r);
  }

  for (const s of sales) {
    const rows = finBySrid.get(s.srid);
    if (!rows?.length) continue;
    const mapped = rows.map(financeFields);
    const saleLike = mapped.filter((r) =>
      /продаж|sale|реализа/i.test(String(r.supplier_oper_name || ""))
    );
    const focus = saleLike.length ? saleLike : mapped;
    const sumAcq = r2(focus.reduce((a, r) => a + Math.abs(r.acquiring_fee), 0));
    const sumForPay = r2(focus.reduce((a, r) => a + r.ppvz_for_pay, 0));
    const score =
      (sumAcq > 0 ? 1000 : 0) +
      (Math.abs(sumForPay - Number(s.forPay)) < 1 ? 500 : 0) +
      Number(s.forPay);
    if (!best || score > best.score) {
      best = {
        score,
        salesPath: sp,
        financePath: fp,
        sale: s,
        financeRows: mapped,
        focusRows: focus,
        sums: {
          sumAcq,
          sumForPay,
          sumCommission: r2(
            focus.reduce((a, r) => a + Math.abs(r.ppvz_sales_commission), 0)
          ),
          sumReward: r2(
            focus.reduce((a, r) => a + Math.abs(r.ppvz_reward), 0)
          ),
          sumVw: r2(focus.reduce((a, r) => a + Math.abs(r.ppvz_vw), 0)),
          sumDelivery: r2(
            focus.reduce((a, r) => a + Math.abs(r.delivery_rub), 0)
          ),
          retail_amount: focus[0]?.retail_amount ?? null,
          retail_price_withdisc_rub: focus[0]?.retail_price_withdisc_rub ?? null,
        },
      };
    }
  }
}

if (!best) {
  console.error("No overlapping SRID");
  process.exit(1);
}

const s = best.sale;
const afterSeller = r2(s.totalPrice * (1 - Number(s.discountPercent || 0) / 100));
const afterSpp = r2(s.priceWithDisc * (1 - Number(s.spp || 0) / 100));
const f0 = best.focusRows[0];

const moneyFlow = {
  customerListPrice_totalPrice: s.totalPrice,
  afterSellerDiscount_priceWithDisc: s.priceWithDisc,
  customerPaid_finishedPrice: s.finishedPrice,
  salesApi_forPay: s.forPay,
  finance_retail_price_withdisc_rub: best.sums.retail_price_withdisc_rub,
  finance_retail_amount: best.sums.retail_amount,
  finance_ppvz_for_pay: best.sums.sumForPay,
  finance_acquiring_fee: best.sums.sumAcq,
  finance_ppvz_sales_commission: best.sums.sumCommission,
  finance_ppvz_reward: best.sums.sumReward,
  finance_ppvz_vw: best.sums.sumVw,
  finance_delivery: best.sums.sumDelivery,
  // identities
  sales_pwd_minus_forPay: r2(s.priceWithDisc - s.forPay),
  sales_finished_minus_forPay: r2(s.finishedPrice - s.forPay),
  finance_forPay_plus_acquiring: r2(best.sums.sumForPay + best.sums.sumAcq),
  sales_forPay_vs_finance_forPay: r2(s.forPay - best.sums.sumForPay),
  sales_pwd_vs_finance_retail_withdisc: r2(
    s.priceWithDisc - (best.sums.retail_price_withdisc_rub || 0)
  ),
  sales_finished_vs_finance_retail_amount: r2(
    s.finishedPrice - (best.sums.retail_amount || 0)
  ),
};

const out = {
  selected: {
    srid: s.srid,
    saleID: s.saleID,
    date: s.date,
    nmId: s.nmId,
    supplierArticle: s.supplierArticle,
    brand: s.brand,
    subject: s.subject,
    salesPath: best.salesPath,
    financePath: best.financePath,
  },
  saleApiRawAllFields: s,
  saleApiPriceFields: {
    totalPrice: s.totalPrice,
    discountPercent: s.discountPercent,
    priceWithDisc: s.priceWithDisc,
    priceWithDiscRub: null, // NOT present on Sales API
    finishedPrice: s.finishedPrice,
    spp: s.spp,
    forPay: s.forPay,
    paymentSaleAmount: s.paymentSaleAmount ?? null,
  },
  relations: {
    calc_total_x_sellerDisc: afterSeller,
    delta_pwd_vs_calc: r2(s.priceWithDisc - afterSeller),
    calc_pwd_x_spp: afterSpp,
    delta_finished_vs_pwd_spp: r2(s.finishedPrice - afterSpp),
  },
  financeMatchingSrid: best.financeRows,
  moneyFlow,
  notes: {
    priceWithDiscRub:
      "Sales API does not return priceWithDiscRub. Finance analog is retail_price_withdisc_rub.",
    wbOfficial:
      "WB docs: priceWithDisc and forPay use simplified logic vs realization detail retail_price_withdisc_rub / ppvz_for_pay.",
  },
};

writeFileSync(
  "exports/sales-api-price-model-one-srid.json",
  JSON.stringify(out, null, 2)
);
console.log(
  JSON.stringify(
    {
      selected: out.selected,
      saleApiPriceFields: out.saleApiPriceFields,
      relations: out.relations,
      moneyFlow,
      financeOps: best.financeRows.map((r) => ({
        op: r.supplier_oper_name,
        retail_amount: r.retail_amount,
        retail_withdisc: r.retail_price_withdisc_rub,
        for_pay: r.ppvz_for_pay,
        acq: r.acquiring_fee,
        commission: r.ppvz_sales_commission,
        reward: r.ppvz_reward,
        vw: r.ppvz_vw,
        delivery: r.delivery_rub,
      })),
    },
    null,
    2
  )
);
