import type { FinanceOperationType, WbFinance, WbOrder, WbSale, WbStock } from "@/types/database";
import type {
  WbApiFinanceRow,
  WbApiOrder,
  WbApiProductCard,
  WbApiSale,
  WbApiStockRow,
} from "./types";

export function toDateString(iso: string): string {
  return iso.slice(0, 10);
}

export function mapApiProductToDb(card: WbApiProductCard) {
  const barcode = card.sizes?.flatMap((s) => s.skus ?? []).find(Boolean) ?? null;

  return {
    supplier_article: card.vendorCode,
    nm_id: card.nmID,
    name: card.title,
    barcode,
    brand_name: card.brand ?? "Unknown",
    category_name: card.subjectName ?? "Uncategorized",
  };
}

export function mapApiProductVariants(
  card: WbApiProductCard,
  productId: string
): Array<{ product_id: string; nm_id: number; tech_size: string; barcode: string | null }> {
  const sizes = card.sizes ?? [];
  const nmId = card.nmID;
  if (!sizes.length) {
    return [
      {
        product_id: productId,
        nm_id: nmId,
        tech_size: "",
        barcode: card.sizes?.[0]?.skus?.[0] ?? null,
      },
    ];
  }

  const variants: Array<{
    product_id: string;
    nm_id: number;
    tech_size: string;
    barcode: string | null;
  }> = [];
  for (const size of sizes) {
    const techSize = size.techSize ?? "";
    const skus = size.skus ?? [];
    if (!skus.length) {
      variants.push({ product_id: productId, nm_id: nmId, tech_size: techSize, barcode: null });
      continue;
    }
    for (const sku of skus) {
      variants.push({
        product_id: productId,
        nm_id: nmId,
        tech_size: techSize,
        barcode: sku || null,
      });
    }
  }
  return variants;
}

export function mapApiOrderToDb(
  order: WbApiOrder,
  productId: string
): Omit<WbOrder, "id" | "marketplace_account_id"> {
  const srid = order.srid ?? order.gNumber ?? `${order.nmId}-${order.date}`;

  return {
    srid,
    nm_id: order.nmId,
    product_id: productId,
    order_date: toDateString(order.date),
    sale_date: null,
    price: order.totalPrice ?? 0,
    quantity: 1,
    status: order.isCancel ? "cancelled" : "active",
    warehouse: order.warehouseName ?? null,
    tech_size: order.techSize ?? null,
    barcode: order.barcode ?? null,
  };
}

export function mapApiSaleToDb(sale: WbApiSale, productId: string): Omit<WbSale, "id" | "marketplace_account_id"> {
  const isReturn = sale.saleID.startsWith("R");
  const srid = sale.srid ?? sale.saleID;

  return {
    srid,
    nm_id: sale.nmId,
    product_id: productId,
    sale_date: toDateString(sale.date),
    revenue: Math.abs(sale.finishedPrice ?? sale.forPay ?? 0),
    quantity: 1,
    is_return: isReturn,
    return_date: isReturn ? toDateString(sale.date) : null,
    tech_size: sale.techSize ?? null,
    barcode: sale.barcode ?? null,
  };
}

type FinanceLineInput = {
  row: WbApiFinanceRow;
  productId: string | null;
  operationType: FinanceOperationType;
  amount: number;
  suffix: string;
};

/** Wildberries unique finance line id: one rrd_id row → multiple lines by fee suffix. */
export function buildFinanceSourceKey(rrdId: number, suffix: string): string {
  return `rrd:${rrdId}:${suffix}`;
}

function buildFinanceLine(input: FinanceLineInput): Omit<WbFinance, "id" | "marketplace_account_id"> {
  const { row, productId, operationType, amount, suffix } = input;
  const operationDate = row.rr_dt ?? (row.sale_dt ? toDateString(row.sale_dt) : null) ?? toDateString(new Date().toISOString());
  const sourceKey = buildFinanceSourceKey(row.rrd_id, suffix);

  return {
    product_id: productId,
    nm_id: row.nm_id ?? null,
    operation_date: operationDate,
    operation_type: operationType,
    amount: Math.abs(amount),
    source_key: sourceKey,
    description: sourceKey,
    srid: row.srid ?? null,
  };
}

export function mapFinanceRowsFromReport(
  row: WbApiFinanceRow,
  productId: string | null
): Omit<WbFinance, "id" | "marketplace_account_id">[] {
  const lines: Omit<WbFinance, "id" | "marketplace_account_id">[] = [];

  const add = (operationType: FinanceOperationType, amount: number | undefined, suffix: string) => {
    if (amount && Math.abs(amount) > 0) {
      lines.push(buildFinanceLine({ row, productId, operationType, amount, suffix }));
    }
  };

  add("commission", row.ppvz_sales_commission, "commission");
  add("logistics", row.delivery_rub, "logistics");
  add("storage", row.storage_fee, "storage");
  add("penalty", row.penalty, "penalty");
  add("return_logistics", row.rebill_logistic_cost, "return_logistics");
  add("other", row.deduction, "deduction");
  add("other", row.acceptance, "acceptance");
  add("other", row.acquiring_fee, "acquiring_fee");
  add("other", row.ppvz_reward, "ppvz_reward");
  add("other", row.additional_payment, "additional_payment");
  add("other", row.ppvz_vw, "ppvz_vw");

  const operName = (row.supplier_oper_name ?? "").toLowerCase();
  if (!lines.length && operName) {
    if (operName.includes("логист") && operName.includes("обрат")) {
      add("return_logistics", row.delivery_rub, "oper_return_logistics");
    } else if (operName.includes("логист")) {
      add("logistics", row.delivery_rub, "oper_logistics");
    } else if (operName.includes("хранен")) {
      add("storage", row.storage_fee ?? row.delivery_rub, "oper_storage");
    } else if (operName.includes("штраф")) {
      add("penalty", row.penalty ?? row.delivery_rub, "oper_penalty");
    }
  }

  return lines;
}

export function mapApiStockRowToDb(
  row: WbApiStockRow,
  productId: string,
  syncedAt: string
): Omit<WbStock, "id" | "marketplace_account_id"> {
  return {
    product_id: productId,
    tech_size: row.techSize ?? "",
    barcode: row.barcode ?? null,
    warehouse: row.warehouseName ?? "",
    quantity: row.quantity ?? row.quantityFull ?? 0,
    synced_at: syncedAt,
  };
}

export function isWithinDateRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}

export function mapFinanceOperationType(apiType: string): FinanceOperationType {
  const normalized = apiType.toLowerCase();
  if (normalized.includes("commission") || normalized.includes("комисс")) return "commission";
  if (normalized.includes("return") || normalized.includes("обратн")) return "return_logistics";
  if (normalized.includes("logist") || normalized.includes("логист")) return "logistics";
  if (normalized.includes("storage") || normalized.includes("хранен")) return "storage";
  if (normalized.includes("penalty") || normalized.includes("штраф")) return "penalty";
  return "other";
}

// Re-export types used by legacy imports
export type { WbApiOrder, WbApiSale, WbApiFinanceRow as WbApiFinanceRecord, WbApiProductCard };
