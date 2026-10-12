import { escapeSpreadsheetCsvCell } from "@/lib/csv-cell";
import type { OrdersPurchasesKpis } from "@/types/database";
export function buildDailyOrdersCsv(kpis: OrdersPurchasesKpis, scope: {companyId:string;accountId:string;brandId?:string;from:string;to:string}): string {
  const text = (value: string) => escapeSpreadsheetCsvCell(value);
  const num = (value: number | undefined) => value === undefined ? "" : escapeSpreadsheetCsvCell(String(value), true);
  const metadata = [["Company",scope.companyId],["Account",scope.accountId],["Brand",scope.brandId ?? "All"],["From",scope.from],["To",scope.to],
    ["Price basis","Seller-discounted order value; list price fallback when absent"],
    ["Cancellation basis","Current cancellation status grouped by original order date"],
    ["Source","Stored WB orders; order value is not completed sales or Finance revenue"]].map(row=>row.map(text).join(","));
  const header = "Date,Total order items,Total order value RUB,Non-cancelled items,Non-cancelled value RUB,Cancelled items,Cancelled value RUB";
  const rows = kpis.dailyOrdersPurchases.filter(p=>(p.totalOrdersCount ?? p.ordersCount)>0).map(p=>[text(p.date),num(p.totalOrdersCount),num(p.totalOrdersAmount),num(p.ordersCount),num(p.ordersAmount),num(p.cancelledOrdersCount),num(p.cancelledOrdersAmount)].join(","));
  return "\uFEFF"+[...metadata,"",header,...rows].join("\r\n");
}
