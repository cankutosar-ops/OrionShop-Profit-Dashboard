import type { OzonPostingWindow } from '@/services/ozon-posting-service';
export function OzonPostingTable({windows,from,to}:{windows:OzonPostingWindow[];from:string;to:string}) {
  const rows=windows.flatMap(window=>window.postings.map(posting=>({...posting,scheme:window.scheme})));
  return <section className="min-w-0 space-y-3" aria-label="Ozon shipment evidence">
    <h3 className="text-lg font-semibold">Shipment evidence</h3>
    <p className="text-xs text-muted-foreground">API source window (UTC): {from} → {to}. Shipment status is fulfillment evidence, not recognized Revenue or Finance completeness.</p>
    <div className="flex flex-wrap gap-3 text-sm">{windows.map(window=><p key={window.scheme}>{window.scheme.toUpperCase()}: {window.status==='STORED'?`${window.postings.length} shipments stored`:window.status==='NOT_CAPTURED'?'Not captured for this window':'Source data unavailable'}</p>)}</div>
    {rows.length>0&&<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-card text-left text-muted-foreground">{['Scheme','Posting / order','Status','Products / units'].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={`${row.scheme}:${row.posting_number}`} className="border-t border-border"><td className="px-4 py-3">{row.scheme.toUpperCase()}</td><td className="px-4 py-3">{row.posting_number}<p className="text-xs text-muted-foreground">Order: {row.order_number}</p></td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.products.map((product,index)=><p key={index}>{String(product.offer_id)} · {String(product.quantity)} units</p>)}</td></tr>)}</tbody></table></div>}
  </section>;
}
