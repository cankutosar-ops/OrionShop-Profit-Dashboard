export type WbApiOrder = {
  date: string;
  lastChangeDate: string;
  supplierArticle: string;
  techSize?: string;
  barcode?: string;
  totalPrice: number;
  discountPercent?: number;
  /** Seller-discounted price — Wildberries Portal Orders Value field. */
  priceWithDisc?: number;
  /** Customer paid price after WB (SPP) discount. */
  finishedPrice?: number;
  spp?: number;
  warehouseName?: string;
  oblast?: string;
  isCancel?: boolean;
  cancel_dt?: string;
  gNumber?: string;
  nmId: number;
  subject?: string;
  category?: string;
  brand?: string;
  srid?: string;
  sticker?: string;
};

export type WbApiSale = {
  date: string;
  lastChangeDate: string;
  supplierArticle: string;
  techSize?: string;
  barcode?: string;
  totalPrice: number;
  discountPercent?: number;
  warehouseName?: string;
  countryName?: string;
  oblastOkrugName?: string;
  regionName?: string;
  incomeID?: number;
  saleID: string;
  odid?: number;
  spp?: number;
  forPay: number;
  finishedPrice: number;
  priceWithDisc: number;
  nmId: number;
  subject?: string;
  category?: string;
  brand?: string;
  gNumber?: string;
  sticker?: string;
  srid?: string;
};

export type WbApiFinanceRow = {
  rrd_id: number;
  nm_id?: number;
  sa_name?: string;
  subject_name?: string;
  brand_name?: string;
  rr_dt?: string;
  sale_dt?: string;
  order_dt?: string;
  supplier_oper_name?: string;
  retail_amount?: number;
  retail_price_withdisc_rub?: number;
  ppvz_sales_commission?: number;
  delivery_rub?: number;
  storage_fee?: number;
  penalty?: number;
  rebill_logistic_cost?: number;
  deduction?: number;
  acceptance?: number;
  acquiring_fee?: number;
  ppvz_reward?: number;
  additional_payment?: number;
  ppvz_vw?: number;
  ppvz_for_pay?: number;
  doc_type_name?: string;
  srid?: string;
};

export type WbApiProductCard = {
  nmID: number;
  vendorCode: string;
  title: string;
  brand?: string;
  subjectName?: string;
  sizes?: { techSize?: string; skus?: string[] }[];
};

export type WbApiStockRow = {
  lastChangeDate: string;
  supplierArticle?: string;
  techSize?: string;
  barcode?: string;
  quantity?: number;
  quantityFull?: number;
  inWayToClient?: number;
  inWayFromClient?: number;
  nmId?: number;
  warehouseName?: string;
};

/** Weekly/daily sales report summary — finance API v1 (settlement / bank payout). */
export type WbSalesReportListItem = {
  reportId: number;
  dateFrom: string;
  dateTo: string;
  createDate: string;
  currency?: string;
  reportType?: number;
  retailAmountSum?: string;
  forPaySum?: string;
  bankPaymentSum?: string;
  sellerFinanceName?: string;
};

/** Seller wallet snapshot — Finance API GET /api/v1/account/balance */
export type WbAccountBalance = {
  currency: string;
  current: number;
  for_withdraw: number;
};

export type WbApiCardsResponse = {
  cards: WbApiProductCard[];
  cursor?: {
    nmID?: number;
    updatedAt?: string;
    total?: number;
  };
};
