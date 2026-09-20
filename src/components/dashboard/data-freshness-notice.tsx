'use client';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {freshnessItems, type FreshnessSnapshot} from '@/lib/data-freshness';

/** Read-only status; displaying a newer period never starts ingestion. */
export function DataFreshnessNotice() {
  const params=useSearchParams();
  const account=params.get('account');
  const to=params.get('to') ?? new Date().toISOString().slice(0,10);
  const [snapshot,setSnapshot]=useState<FreshnessSnapshot|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    setSnapshot(null);
    if(account) fetch(`/api/data-freshness?account=${encodeURIComponent(account)}`,{signal:controller.signal,cache:'no-store'})
      .then(response=>{if(!response.ok)throw new Error('Unavailable');return response.json();})
      .then(value=>{if(!controller.signal.aborted)setSnapshot(value);})
      .catch(()=>{if(!controller.signal.aborted)setSnapshot(null);});
    return ()=>controller.abort();
  },[account]);
  return <section aria-label="Data freshness" role="status" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
    <p className="font-semibold">Data freshness</p>
    {snapshot && <p className="text-xs text-muted-foreground">Last recorded successful account sync: {snapshot.lastSuccessfulSync ?? 'not recorded'}. Individual worker coverage is shown below.</p>}
    {!snapshot ? <p>INCOMPLETE — Freshness is not verified. Select an account; stored figures may be incomplete.</p> :
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{freshnessItems(snapshot,to).map(item=>
        <li key={item.label}><p className="font-medium">{item.label}: {item.status}</p><p className="text-xs text-muted-foreground">{item.detail}</p></li>)}</ul>}
    <p className="mt-2 text-xs text-muted-foreground">Historical inventory may contain gaps. A current snapshot does not fill missing historical dates.</p>
  </section>;
}
