/**
 * Sprint 10 — Historical inventory snapshot types (DB read model).
 */

export type HistoricalInventorySnapshot = {
  id: number;
  snapshot_date: string;
  marketplace_account_id: number;
  warehouse_name: string;
  brand: string;
  subject: string;
  seller_article: string;
  nm_id: number;
  barcode: string;
  size: string;
  quantity: number;
  in_way_to_client: number;
  in_way_from_client: number;
  created_at: string;
};

export type HistoricalInventorySnapshotInsert = {
  snapshot_date: string;
  marketplace_account_id: number;
  warehouse_name: string;
  brand: string;
  subject: string;
  seller_article: string;
  nm_id: number;
  barcode: string;
  size: string;
  quantity: number;
  in_way_to_client?: number;
  in_way_from_client?: number;
};

export type HistoricalInventoryQuery = {
  marketplaceAccountId: string;
  snapshotDate: string;
  warehouse?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: HistoricalInventorySortField;
  sortDir?: "asc" | "desc";
};

export type HistoricalInventorySortField =
  | "brand"
  | "subject"
  | "seller_article"
  | "nm_id"
  | "barcode"
  | "size"
  | "warehouse_name"
  | "quantity";

export type HistoricalInventoryPage = {
  snapshotDate: string;
  marketplaceAccountId: string;
  rows: HistoricalInventorySnapshot[];
  total: number;
  page: number;
  pageSize: number;
  warehouses: string[];
  availableDates: string[];
};
