"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Deliberate, one-task source refresh. No background polling/retry or seller write API. */
export function OzonSourceSyncControls({ accountId, from, to }: { accountId: string; from: string; to: string }) {
  const router = useRouter();
  const [task, setTask] = useState('products'), [date, setDate] = useState(to);
  const [month, setMonth] = useState(to.slice(0,7));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function sync() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/ozon/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, task, date: task === 'finance' ? date : undefined, month: task === 'realization-monthly' ? month : undefined,
          from: task === 'fbo' || task === 'fbs' ? `${from}T00:00:00Z` : undefined,
          to: task === 'fbo' || task === 'fbs' ? `${to}T23:59:59Z` : undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Source synchronization failed');
      setMessage(body.result.status === 'NO_ACCRUALS_REPORTED' ? 'Ozon returned no accruals for this date. Normal for a new store; no financial values were invented.' : `${body.result.rowsPersisted} source records stored.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Synchronization failed. No automatic retry.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-xl border p-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Source<select aria-label="Ozon source" disabled={busy} value={task} onChange={e => setTask(e.target.value)} className="ml-2 rounded border bg-background p-2">
        <option value="products">Products</option><option value="prices">Prices</option><option value="stocks">Stocks</option>
        <option value="fbs">FBS shipments</option><option value="fbo">FBO shipments</option><option value="finance">Finance accruals — one day</option>
        <option value="finance-types">Finance expense dictionary</option><option value="realization-monthly">Realized sales / returns — one month</option>
      </select></label>
      {task === 'finance' && <label className="text-sm">Accrual date<input aria-label="Ozon accrual date" type="date" min="2022-01-01" value={date} disabled={busy} onChange={e => setDate(e.target.value)} className="ml-2 rounded border bg-background p-2"/></label>}
      {task === 'realization-monthly' && <label className="text-sm">Realization month<input aria-label="Ozon realization month" type="month" min="2023-08" value={month} disabled={busy} onChange={e => setMonth(e.target.value)} className="ml-2 rounded border bg-background p-2"/></label>}
      <button type="button" disabled={busy || (task === 'finance' && !date)} onClick={sync} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? 'Synchronizing…' : 'Refresh selected source'}</button>
    </div>
    <p className="text-xs text-muted-foreground">Manual source capture only. Scheduled synchronization remains off.</p>
    {task==='finance'&&<p className="text-xs text-muted-foreground">Capture the finance expense dictionary before the first finance day, so source fee definitions remain pinned to that capture.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
