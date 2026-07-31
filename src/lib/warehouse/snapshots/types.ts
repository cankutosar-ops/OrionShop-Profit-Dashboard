/**
 * Sprint 10.6 — Warehouse KPI snapshot types (marketplace-agnostic).
 */

import type { WarehouseMarketplaceType } from "@/lib/warehouse/types";

export type WarehouseAccountBalanceRecord = {
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  currency: string | null;
  currentAmount: number | null;
  forWithdrawAmount: number | null;
  observedAt: string;
};

export type WarehouseSalesReportSnapshotRecord = {
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  reportId: number;
  dateFrom: string;
  dateTo: string;
  createDate: string;
  currency: string | null;
  reportType: number | null;
  retailAmountSum: number | null;
  forPaySum: number | null;
  bankPaymentSum: number | null;
  sellerFinanceName: string | null;
  observedAt: string;
};
