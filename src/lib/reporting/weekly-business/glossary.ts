/**
 * FE ↔ WB Weekly Excel glossary — presentation only.
 * Does not redefine Financial Engine identities.
 */

export type GlossaryMatchStatus =
  | "CLOSEST_ANALOG"
  | "SAME_CONCEPT"
  | "DIFFERENT_IDENTITY"
  | "FE_ONLY"
  | "EXCEL_ONLY"
  | "SELLER_ADDED";

export type GlossaryRow = {
  wbWeeklyTerm: string;
  financialEngineTerm: string;
  formulaMeaning: string;
  dateAxis: string;
  matchStatus: GlossaryMatchStatus;
  notes: string;
};

export const WEEKLY_FE_GLOSSARY: GlossaryRow[] = [
  {
    wbWeeklyTerm: "Вайлдберриз реализовал Товар (Пр) / Продажа",
    financialEngineTerm: "Not Net Sales",
    formulaMeaning:
      "WB weekly realized retail total on report lines — not Σ(priceWithDisc).",
    dateAxis: "Excel: report week / Дата продажи · FE Net Sales: sale_date",
    matchStatus: "DIFFERENT_IDENTITY",
    notes: "Do not equate Excel Продажа with FE Net Sales.",
  },
  {
    wbWeeklyTerm: "Цена розничная с учетом согласованной скидки",
    financialEngineTerm: "Related to Sales price family (not identical)",
    formulaMeaning: "WB retail with agreed discount on finance report lines.",
    dateAxis: "Excel report line dates · FE Sales: sale_date",
    matchStatus: "DIFFERENT_IDENTITY",
    notes: "FE Net Sales uses Sales API priceWithDisc, not this Excel column.",
  },
  {
    wbWeeklyTerm: "К перечислению Продавцу за реализованный Товар",
    financialEngineTerm: "Revenue (closest analog)",
    formulaMeaning: "FE Revenue = Σ Finance ppvz_for_pay (signed for_pay lines).",
    dateAxis: "FE: operation_date · Excel: weekly report axis",
    matchStatus: "CLOSEST_ANALOG",
    notes: "Same economic family; residuals from date axis / coverage expected.",
  },
  {
    wbWeeklyTerm: "Услуги по доставке товара покупателю",
    financialEngineTerm: "Logistics (+ Return Logistics)",
    formulaMeaning: "Finance delivery_rub / logistics lines.",
    dateAxis: "operation_date",
    matchStatus: "SAME_CONCEPT",
    notes: "FE may split outbound vs return logistics.",
  },
  {
    wbWeeklyTerm: "Хранение",
    financialEngineTerm: "Storage",
    formulaMeaning: "Finance storage_fee lines.",
    dateAxis: "operation_date",
    matchStatus: "SAME_CONCEPT",
    notes: "",
  },
  {
    wbWeeklyTerm: "Общая сумма штрафов / Штраф",
    financialEngineTerm: "Penalties",
    formulaMeaning: "Finance penalty lines.",
    dateAxis: "operation_date",
    matchStatus: "SAME_CONCEPT",
    notes: "",
  },
  {
    wbWeeklyTerm: "Удержания",
    financialEngineTerm: "Other / Adjustments (partial)",
    formulaMeaning: "Finance deduction / adjustment lines.",
    dateAxis: "operation_date",
    matchStatus: "CLOSEST_ANALOG",
    notes: "Classification may differ from Excel Удержания bucket.",
  },
  {
    wbWeeklyTerm: "Операции на приемке",
    financialEngineTerm: "Acceptance",
    formulaMeaning: "Finance acceptance lines.",
    dateAxis: "operation_date",
    matchStatus: "SAME_CONCEPT",
    notes: "",
  },
  {
    wbWeeklyTerm: "Maliyet fiyatlari",
    financialEngineTerm: "Product Cost",
    formulaMeaning: "Seller cost from product_cost_history × units — not a WB API field.",
    dateAxis: "effective cost period + sale/operation attribution",
    matchStatus: "SELLER_ADDED",
    notes: "Present in reference Excel as seller-added column.",
  },
  {
    wbWeeklyTerm: "(implied) Продажа − К перечислению",
    financialEngineTerm: "Not Marketplace Fee",
    formulaMeaning:
      "FE Marketplace Fee = Net Sales − Sales API forPay (net). Not Excel implied fee.",
    dateAxis: "sale_date (Sales API)",
    matchStatus: "DIFFERENT_IDENTITY",
    notes: "Excel implied fee can be negative; never substitute for FE Marketplace Fee.",
  },
  {
    wbWeeklyTerm: "(absent)",
    financialEngineTerm: "Net Sales",
    formulaMeaning: "Σ(priceWithDisc) purchases − returns.",
    dateAxis: "sale_date",
    matchStatus: "FE_ONLY",
    notes: "Canonical FE commercial sales base.",
  },
  {
    wbWeeklyTerm: "(absent)",
    financialEngineTerm: "Marketplace Fee",
    formulaMeaning: "Sales − Sales API forPay.",
    dateAxis: "sale_date",
    matchStatus: "FE_ONLY",
    notes: "",
  },
  {
    wbWeeklyTerm: "(absent)",
    financialEngineTerm: "Estimated Tax",
    formulaMeaning: "Tax Rate × Σ(finishedPrice).",
    dateAxis: "sale_date (finishedPrice)",
    matchStatus: "FE_ONLY",
    notes: "Reporting estimated tax model — not in WB weekly Excel.",
  },
  {
    wbWeeklyTerm: "(absent)",
    financialEngineTerm: "Advertising",
    formulaMeaning: "Σ wb_ads spend.",
    dateAxis: "campaign_date",
    matchStatus: "FE_ONLY",
    notes: "",
  },
  {
    wbWeeklyTerm: "Итого к оплате / settlement total (if present)",
    financialEngineTerm: "Seller Payout / Net Transfer (sellerPayout)",
    formulaMeaning:
      "Settlement = sellerPayout. Settlement ≠ Net Profit.",
    dateAxis: "operation_date (finance components)",
    matchStatus: "CLOSEST_ANALOG",
    notes: "Net Profit subtracts Product Cost, Advertising, Estimated Tax.",
  },
  {
    wbWeeklyTerm: "(absent)",
    financialEngineTerm: "Net Profit",
    formulaMeaning:
      "Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Other − Advertising − Estimated Tax.",
    dateAxis: "composed (sales + finance + ads + cost)",
    matchStatus: "FE_ONLY",
    notes: "Not present as a column in the reference WB weekly Excel.",
  },
];
