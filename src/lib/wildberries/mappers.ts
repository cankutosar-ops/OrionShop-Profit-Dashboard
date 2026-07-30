import {
  categoryToOperationType,
  resolveFinanceCategory,
} from "@/lib/finance-category";
import type { WbFinance, WbOrder, WbSale, WbStock } from "@/types/database";
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
    price_with_disc: order.priceWithDisc ?? 0,
    last_change_date: toDateString(order.lastChangeDate),
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
    price_with_disc: Math.abs(sale.priceWithDisc ?? 0),
    for_pay: Math.abs(sale.forPay ?? 0),
    quantity: 1,
    is_return: isReturn,
    return_date: isReturn ? toDateString(sale.date) : null,
    warehouse: sale.warehouseName ?? null,
    tech_size: sale.techSize ?? null,
    barcode: sale.barcode ?? null,
  };
}

type FinanceLineInput = {
  row: WbApiFinanceRow;
  productId: string | null;
  amount: number;
  suffix: string;
};

/** Wildberries unique finance line id: one rrd_id row → multiple lines by fee suffix. */
export function buildFinanceSourceKey(rrdId: number, suffix: string): string {
  return `rrd:${rrdId}:${suffix}`;
}

function buildFinanceLine(
  input: FinanceLineInput
): Omit<WbFinance, "id" | "marketplace_account_id"> {
  const { row, productId, amount, suffix } = input;
  const operationDate =
    row.rr_dt ??
    (row.sale_dt ? toDateString(row.sale_dt) : null) ??
    toDateString(new Date().toISOString());
  const sourceKey = buildFinanceSourceKey(row.rrd_id, suffix);
  const supplierOperName = row.supplier_oper_name?.trim() || null;
  const financeCategory = resolveFinanceCategory({
    wbFieldSuffix: suffix,
    supplierOperName,
  });
  const operationType = categoryToOperationType(financeCategory);
  const normalizedAmount = suffix === "for_pay" ? amount : Math.abs(amount);

  return {
    product_id: productId,
    nm_id: row.nm_id ?? null,
    operation_date: operationDate,
    operation_type: operationType,
    amount: normalizedAmount,
    source_key: sourceKey,
    description: null,
    srid: row.srid ?? null,
    finance_category: financeCategory,
    wb_source_suffix: suffix,
    supplier_oper_name: supplierOperName,
    finance_nature: null,
    realizationreport_id: row.realizationreport_id ?? null,
    rrd_id: row.rrd_id ?? null,
    rr_dt: row.rr_dt ? toDateString(row.rr_dt) : null,
  };
}

export function mapFinanceRowsFromReport(
  row: WbApiFinanceRow,
  productId: string | null
): Omit<WbFinance, "id" | "marketplace_account_id">[] {
  const lines: Omit<WbFinance, "id" | "marketplace_account_id">[] = [];

  const add = (amount: number | undefined, suffix: string) => {
    if (amount && Math.abs(amount) > 0) {
      lines.push(buildFinanceLine({ row, productId, amount, suffix }));
    }
  };

  add(row.ppvz_sales_commission, "commission");
  add(row.delivery_rub, "logistics");
  add(row.storage_fee, "storage");
  add(row.penalty, "penalty");
  add(row.rebill_logistic_cost, "return_logistics");
  add(row.deduction, "deduction");
  add(row.acceptance, "acceptance");
  add(row.acquiring_fee, "acquiring_fee");
  add(row.ppvz_reward, "ppvz_reward");
  add(row.additional_payment, "additional_payment");
  add(row.ppvz_vw, "ppvz_vw");

  if (row.ppvz_for_pay && Math.abs(row.ppvz_for_pay) > 0) {
    const isReturn =
      row.doc_type_name === "Возврат" || row.supplier_oper_name === "Возврат";
    const signed = isReturn ? -Math.abs(row.ppvz_for_pay) : Math.abs(row.ppvz_for_pay);
    lines.push(
      buildFinanceLine({ row, productId, amount: signed, suffix: "for_pay" })
    );
  }

  const operName = (row.supplier_oper_name ?? "").toLowerCase();
  if (!lines.length && operName) {
    if (operName.includes("логист") && operName.includes("обрат")) {
      add(row.delivery_rub, "oper_return_logistics");
    } else if (operName.includes("логист")) {
      add(row.delivery_rub, "oper_logistics");
    } else if (operName.includes("хранен")) {
      add(row.storage_fee ?? row.delivery_rub, "oper_storage");
    } else if (operName.includes("штраф")) {
      add(row.penalty ?? row.delivery_rub, "oper_penalty");
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
    quantity: Number(row.quantity ?? 0),
    quantity_full: Number(row.quantityFull ?? row.quantity ?? 0),
    in_way_to_client: Number(row.inWayToClient ?? 0),
    in_way_from_client: Number(row.inWayFromClient ?? 0),
    last_synced_at: syncedAt,
  };
}

export function isWithinDateRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}

// Re-export types used by legacy imports
export type { WbApiOrder, WbApiSale, WbApiFinanceRow as WbApiFinanceRecord, WbApiProductCard };
