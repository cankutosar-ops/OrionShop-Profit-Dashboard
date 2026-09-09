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
  realizationreport_id?: number;
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
  sizes?: {
    techSize?: string;
    wbSize?: string;
    chrtID?: number;
    chrtId?: number;
    skus?: string[];
  }[];
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

/** Analytics API — current WB warehouse inventory (replaces deprecated Statistics stocks). */
export type WbWarehouseStockItem = {
  nmId: number;
  chrtId: number;
  warehouseId?: number;
  warehouseName?: string;
  regionName?: string;
  quantity?: number;
  inWayToClient?: number;
  inWayFromClient?: number;
  /** Forward-compat: some API revisions nest qty/transit under warehouses[]. */
  warehouses?: Array<{
    warehouseId?: number;
    warehouseName?: string;
    regionName?: string;
    quantity?: number;
    inWayToClient?: number;
    inWayFromClient?: number;
    nmId?: number;
    chrtId?: number;
  }>;
};

export type WbWarehousesStockResponse = {
  data?: {
    items?: WbWarehouseStockItem[];
  };
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

/** FBW supply list row — POST /api/v1/supplies (supplies-api). */
export type WbApiSupplyListItem = {
  supplyID?: number | null;
  preorderID?: number | null;
  createDate?: string;
  supplyDate?: string;
  factDate?: string;
  updatedDate?: string;
  /** 1–6: not planned … unloaded at gates. 5 = Accepted. */
  statusID?: number;
  boxTypeID?: number;
  isBoxOnPallet?: boolean;
  phone?: string;
};

/** FBW supply details — GET /api/v1/supplies/{ID}. */
export type WbApiSupplyDetails = {
  statusID?: number;
  statusName?: string;
  createDate?: string;
  supplyDate?: string;
  factDate?: string;
  updatedDate?: string;
  warehouseID?: number;
  warehouseName?: string;
  actualWarehouseID?: number;
  actualWarehouseName?: string;
  transitWarehouseID?: number | null;
  transitWarehouseName?: string;
  quantity?: number;
  readyForSaleQuantity?: number;
  acceptedQuantity?: number;
  unloadingQuantity?: number;
  depersonalizedQuantity?: number;
  boxTypeID?: number;
  isBoxOnPallet?: boolean;
};

/** Product line inside a supply — GET /api/v1/supplies/{ID}/goods. */
export type WbApiSupplyGood = {
  barcode?: string;
  vendorCode?: string;
  nmID?: number;
  techSize?: string;
  color?: string;
  quantity?: number;
  readyForSaleQuantity?: number;
  acceptedQuantity?: number;
  unloadingQuantity?: number;
  supplierBoxAmount?: number;
};

export type WbSupplyListRequest = {
  dates?: Array<{
    from: string;
    till: string;
    type: "factDate" | "createDate" | "supplyDate" | "updatedDate";
  }>;
  statusIDs?: number[];
};

// --- Advertising (Promotion) --------------------------------------------------
// Shapes mirror dev.wildberries.ru/api/swagger/yaml/ru/08-promotion.yaml.
// Every field is optional because WB omits empty branches rather than sending
// zeros, and a missing branch must not throw during ingestion.

/** One campaign id in GET /adv/v1/promotion/count. */
export type WbApiAdvertListItem = {
  advertId?: number;
  changeTime?: string;
};

/**
 * GET /adv/v1/promotion/count — campaigns grouped by type and status.
 * `status` 7 finished / 9 active / 11 paused are the only ones /adv/v3/fullstats
 * will return statistics for.
 */
export type WbApiAdvertCountResponse = {
  adverts?: Array<{
    type?: number;
    status?: number;
    count?: number;
    advert_list?: WbApiAdvertListItem[];
  }> | null;
  all?: number;
};

/** Per-SKU leaf of the fullstats tree. `sum` is spend in rubles. */
export type WbApiAdvertStatsNm = {
  nmId?: number;
  name?: string;
  views?: number;
  clicks?: number;
  orders?: number;
  sum?: number;
};

/** Platform split: appType 1 = site, 32 = Android, 64 = iOS. */
export type WbApiAdvertStatsApp = {
  appType?: number;
  views?: number;
  clicks?: number;
  orders?: number;
  sum?: number;
  nms?: WbApiAdvertStatsNm[];
};

/** One calendar day of a campaign. `date` is ISO, e.g. "2026-01-14T00:00:00Z". */
export type WbApiAdvertStatsDay = {
  date?: string;
  views?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  sum?: number;
  orders?: number;
  apps?: WbApiAdvertStatsApp[];
};

/** GET /adv/v3/fullstats — one element per campaign. */
export type WbApiAdvertFullStatsItem = {
  advertId?: number;
  views?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  sum?: number;
  orders?: number;
  days?: WbApiAdvertStatsDay[];
};
