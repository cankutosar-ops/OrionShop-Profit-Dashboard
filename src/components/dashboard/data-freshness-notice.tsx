'use client';
import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {fetchDashboardCompanies} from '@/lib/dashboard-lifecycle';
import {formatLastSyncTimestamp, isEndDateNewerThanLastSync} from '@/lib/marketplace-sync-date';

/** Read-only status; displaying a newer period never starts ingestion. */
export function DataFreshnessNotice() {
  const params=useSearchParams();
  const account=params.get('account');
  const to=params.get('to');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    setMessage('');
    fetchDashboardCompanies().then(companies=>{
      if(!active)return;
      const row=companies.flatMap(c=>c.accounts).find(a=>a.id===account);
      const last=row?.last_successful_sync_at ?? null;
      if(!row || !last) {setMessage('Data freshness is not verified. Figures reflect the stored data and may be incomplete.');return;}
      const financeBehind=Boolean(to && row.finance_latest_operation_date && to>row.finance_latest_operation_date.slice(0,10));
      if(to && (isEndDateNewerThanLastSync(to,last)||financeBehind)) setMessage(`Stored data may not cover the full selected period. Last successful sync: ${formatLastSyncTimestamp(last)}. Finance, Sales, Ads and stock can have different coverage; missing Product Cost remains 0.`);
    }).catch(()=>{if(active)setMessage('Data freshness is unavailable. Figures reflect stored data; completeness is not verified.');});
    return ()=>{active=false;};
  },[account,to]);
  return message ? <p role="status" className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</p> : null;
}
