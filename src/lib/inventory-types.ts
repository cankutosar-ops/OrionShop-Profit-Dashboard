/** Normalized inventory row — one warehouse × size × barcode line. */
export type InventoryStockRow = {
  productId: string;
  marketplaceAccountId: string;
  techSize: string;
  barcode: string | null;
  warehouse: string | null;
  /** WB `quantity` — available for sale (Seller Panel: available). */
  availableStock: number;
  /** WB `quantityFull` — total at warehouse (Seller Panel: total on hand). */
  currentStock: number;
  /** Units not available for sale: inWayToClient + inWayFromClient, or current − available. */
  reservedStock: number;
  syncedAt: string | null;
  nmId: number | null;
  supplierArticle: string | null;
};

export type InventoryValidationMismatch = {
  key: string;
  field: string;
  expected: number;
  actual: number;
};

export type InventoryValidationResult = {
  pass: boolean;
  marketplaceAccountId: string;
  dbRowCount: number;
  apiRowCount: number;
  matchedRows: number;
  mismatches: InventoryValidationMismatch[];
  wbStockMismatches?: InventoryValidationMismatch[];
  skuMapping: {
    productsWithVariants: number;
    productsWithStock: number;
    orphanStockRows: number;
    variantsWithoutStock: number;
  };
};

/** Operational stock status for Inventory UI filters. */
export type InventoryDisplayStatus = "Out of Stock" | "Low Stock" | "Healthy";

export type InventoryStockTotals = {
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  purchases30Day: number;
  dailySales: number;
  daysLeft: number | null;
  lastSync: string | null;
};

export type InventoryModelRow = {
  productId: string;
  supplierArticle: string;
  productName: string;
  currentStock: number;
  daysLeft: number | null;
  status: InventoryDisplayStatus;
};

export type InventorySkuRow = InventoryStockTotals & {
  size: string;
  barcode: string | null;
  status: InventoryDisplayStatus;
};

export type InventoryWarehouseRow = {
  warehouse: string;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
};

export type InventoryHistoryEntry = {
  id: string;
  type: "sync" | "stock_update" | "sale";
  label: string;
  detail: string;
  occurredAt: string;
  quantity?: number;
};

export type InventoryModelDetail = {
  productId: string;
  supplierArticle: string;
  productName: string;
  overview: InventoryStockTotals & { status: InventoryDisplayStatus };
  skus: InventorySkuRow[];
  warehouses: InventoryWarehouseRow[];
  history: InventoryHistoryEntry[];
};

export type InventoryReport = {
  models: InventoryModelRow[];
  detailsByProductId: Record<string, InventoryModelDetail>;
  accountLastSync: string | null;
  accountSyncStatus: string | null;
};

export type InventoryStatusFilter = "all" | "low" | "out" | "healthy";
