"use client";
import { useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { formatKpiCount, formatKpiCurrency } from "@/lib/kpi-format";
import { buildDailyOrdersCsv } from "@/lib/daily-orders-export";
import type { OrdersPurchasesKpis } from "@/types/database";
export function DashboardOrdersSection({kpis,scope}:{kpis:OrdersPurchasesKpis;scope:{companyId:string;accountId:string;brandId?:string;from:string;to:string}}) {
 const [open,setOpen]=useState(false);
 const hasOrders=kpis.ordersValueCount>0;
 const money=(n:number)=>hasOrders?formatKpiCurrency(n):"No stored orders";
 const days=kpis.dailyOrdersPurchases.filter(p=>(p.totalOrdersCount ?? p.ordersCount)>0);
 const exportCsv=()=>{const url=URL.createObjectURL(new Blob([buildDailyOrdersCsv(kpis,scope)],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`daily-orders-account-${scope.accountId}-${scope.from}-${scope.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="space-y-3" aria-label="Order Performance">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h3 className="text-sm font-semibold">Order Performance</h3><p className="text-xs text-muted-foreground">{scope.from} → {scope.to} · Orders placed, separate from completed sales and Finance revenue.</p></div>
   <div className="flex gap-2"><button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">{open?"Hide daily orders":"Daily orders"}</button><button type="button" disabled={!hasOrders} onClick={exportCsv} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">Export daily CSV</button></div>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <MetricCard size="compact" title="Order Amount" value={money(kpis.ordersValue)} subtitle={`${formatKpiCount(kpis.ordersValueCount)} order items · includes cancelled`} icon={KPI_ICONS.orders} hint="Sum of stored order item prices × quantity. Seller-discounted prices are used where supplied. This is not Sales or Revenue." />
   <MetricCard size="compact" title="Non-cancelled Orders" value={money(kpis.ordersAmount)} subtitle={`${formatKpiCount(kpis.ordersCount)} items · current status`} icon={KPI_ICONS.orders} />
   <MetricCard size="compact" title="Cancelled Orders" value={money(kpis.cancelledOrdersAmount)} subtitle={`${formatKpiCount(kpis.cancelledOrdersCount)} items · grouped by order date`} icon={KPI_ICONS.returns} />
   <MetricCard size="compact" title="Average Order Item" value={money(hasOrders?kpis.ordersValue/kpis.ordersValueCount:0)} subtitle="Order Amount ÷ all order items" icon={KPI_ICONS.currency} />
  </div>
  {!hasOrders&&<p className="text-xs text-muted-foreground">No stored orders in this scope. Historical Finance reports do not establish complete order history.</p>}
  {(kpis.ordersPriceFallbackCount ?? 0)>0&&<p className="text-xs text-warning">{kpis.ordersPriceFallbackCount} rows lack a seller-discounted price; totals include the stored list-price fallback.</p>}
  {open&&hasOrders&&<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-sm"><caption className="p-3 text-left text-xs text-muted-foreground">Daily stored order items. Later cancellations update the original order-date cohort.</caption><thead className="bg-muted/30"><tr>{["Order date","All items","Order Amount","Non-cancelled items","Non-cancelled Amount","Cancelled items","Cancelled Amount"].map(t=><th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead><tbody>{days.map(p=><tr key={p.date} className="border-t border-border"><td className="px-3 py-2">{p.date}</td>{[p.totalOrdersCount,p.totalOrdersAmount,p.ordersCount,p.ordersAmount,p.cancelledOrdersCount,p.cancelledOrdersAmount].map((n,i)=><td key={i} className="px-3 py-2 tabular-nums">{n===undefined?"—":i%2===0?formatKpiCount(n):formatKpiCurrency(n)}</td>)}</tr>)}</tbody></table></div>}
 </section>;
}

