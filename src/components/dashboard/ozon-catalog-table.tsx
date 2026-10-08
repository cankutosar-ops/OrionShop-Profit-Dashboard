"use client";
import { useMemo,useState } from 'react';
import type { OzonCatalogModel } from '@/lib/ozon/catalog-model';

export function OzonCatalogTable({model}:{model:OzonCatalogModel}) {
  const [query,setQuery]=useState('');
  const rows=useMemo(()=>model.rows.filter(row=>`${row.offerId} ${row.productId} ${row.sku??''}`.toLowerCase().includes(query.trim().toLowerCase())),[model.rows,query]);
  return <section className="min-w-0 space-y-3" aria-label="Ozon products and stock">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Products, prices & stock <span className="text-sm text-muted-foreground">({rows.length})</span></h3>
      <input type="search" aria-label="Search Ozon products" placeholder="Search offer ID, product ID or SKU…" value={query} onChange={event=>setQuery(event.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm sm:max-w-sm"/>
    </div>
    {model.warnings.length>0&&<ul className="space-y-1 text-sm text-warning">{model.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[700px] text-sm"><thead className="bg-card text-left text-muted-foreground"><tr>
        {['Offer ID','Ozon product / SKU','Price ceiling','Stock evidence'].map(label=><th key={label} className="px-4 py-3">{label}</th>)}
      </tr></thead><tbody>
        {rows.length===0?<tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No matching stored products.</td></tr>:rows.map(row=><tr key={row.productId} className="border-t border-border">
          <td className="px-4 py-3 font-medium">{row.offerId}</td>
          <td className="px-4 py-3">{row.productId}<div className="text-xs text-muted-foreground">SKU: {row.sku??'Unavailable'}</div></td>
          <td className="px-4 py-3 tabular-nums">{row.price!==null&&row.currency?`${row.price} ${row.currency}`:'Unavailable'}</td>
          <td className="px-4 py-3">{row.stocks.length===0?<span className="text-muted-foreground">Unavailable</span>:row.stocks.map((stock,index)=><div key={index} className="mb-2 last:mb-0">
            <span className="font-medium">{stock.scheme.toUpperCase()}</span> · Present: {stock.present??'Unavailable'} · Reserved: {stock.reserved??'Unavailable'}
            <div className="text-xs text-muted-foreground">SKU {stock.sku??'Unavailable'} · {stock.warehouseIds.length>1?'Warehouse group':'Warehouse'}: {stock.warehouseIds.join(', ')||'Unspecified'}{stock.shipmentType?` · ${stock.shipmentType}`:''}</div>
          </div>)}</td>
        </tr>)}
      </tbody></table>
    </div>
    <p className="text-xs text-muted-foreground">Latest stored captures. Price ceiling excludes seller promotions and additional Ozon discounts; it is not customer-paid price, realized Revenue or Product Cost. Present and reserved quantities are shown as supplied; warehouse-group quantities are not distributed between warehouses.</p>
  </section>;
}
