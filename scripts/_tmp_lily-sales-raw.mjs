import { readFileSync, writeFileSync } from "fs";

const raw = JSON.parse(
  readFileSync("exports/wb-raw-2026-06-18_2026-06-29/sales.json", "utf8")
);
const sales = Array.isArray(raw) ? raw : raw.data || raw.sales || [];
const hits = sales.filter(
  (s) =>
    String(s.supplierArticle || "").toUpperCase() === "LILYSIYAH01" &&
    String(s.saleID || "").startsWith("S") &&
    Number(s.forPay) > 0 &&
    Number(s.priceWithDisc) > 0
);
hits.sort((a, b) => Number(b.forPay) - Number(a.forPay));
const sale = hits[0];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const out = {
  sourceFile: "exports/wb-raw-2026-06-18_2026-06-29/sales.json",
  api: "Wildberries Statistics API GET /api/v1/supplier/sales",
  sale,
  allKeysAlphabetical: Object.keys(sale).sort(),
  priceRelatedKeysPresent: Object.keys(sale).filter((k) =>
    /price|pay|disc|spp|payment|amount|percent|promo|fee|commission|currency/i.test(
      k
    )
  ),
  fieldsNotPresentOnThisPayload: [
    "priceWithDiscRub",
    "promoCodeDiscount",
    "return_delivery_rub",
  ],
  math: {
    totalPrice: sale.totalPrice,
    discountPercent: sale.discountPercent,
    formula_priceWithDisc: "totalPrice × (100 − discountPercent) / 100",
    calc_priceWithDisc: r2(
      (sale.totalPrice * (100 - sale.discountPercent)) / 100
    ),
    priceWithDisc_raw: sale.priceWithDisc,
    delta_priceWithDisc_vs_calc: r2(
      sale.priceWithDisc -
        (sale.totalPrice * (100 - sale.discountPercent)) / 100
    ),
    spp: sale.spp,
    formula_finished_approx: "priceWithDisc × (100 − spp) / 100",
    calc_finished_from_pwd_spp: r2(
      (sale.priceWithDisc * (100 - sale.spp)) / 100
    ),
    finishedPrice_raw: sale.finishedPrice,
    delta_finished_vs_spp_calc: r2(
      sale.finishedPrice -
        (sale.priceWithDisc * (100 - sale.spp)) / 100
    ),
    paymentSaleAmount: sale.paymentSaleAmount,
    forPay_raw: sale.forPay,
    priceWithDisc_minus_forPay: r2(sale.priceWithDisc - sale.forPay),
    finishedPrice_minus_forPay: r2(sale.finishedPrice - sale.forPay),
    forPay_over_priceWithDisc: r2(sale.forPay / sale.priceWithDisc),
    forPay_over_finishedPrice: r2(sale.forPay / sale.finishedPrice),
  },
};

writeFileSync(
  "exports/lily-siyah01-sales-api-raw-only.json",
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
