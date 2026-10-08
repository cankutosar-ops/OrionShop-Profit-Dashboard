import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Stored source observation only, never a zero-activity or reconciled P&L assertion. */
export async function getOzonFinanceSourceStatus(client: SupabaseClient, accountId: string, from: string, to: string) {
  const base = { daysChecked: 0, rowsStored: null as number | null, latestCapture: null as string | null };
  const pointers = await client.from('ozon_accrual_source_current').select('accrual_date,snapshot_id')
    .eq('marketplace_account_id', accountId).gte('accrual_date', from).lte('accrual_date', to).order('accrual_date').limit(367);
  if (pointers.error) return { ...base, status: 'UNAVAILABLE' as const };
  if (!pointers.data?.length) return { ...base, status: 'NOT_CAPTURED' as const };
  const snapshots = await client.from('ozon_accrual_source_snapshots').select('id,accrual_date,row_count,observed_at,accounting_complete')
    .eq('marketplace_account_id', accountId).in('id', pointers.data.map(row => row.snapshot_id));
  if (snapshots.error || snapshots.data?.length !== pointers.data.length ||
      !snapshots.data.every(row => Number.isSafeInteger(row.row_count) && row.row_count >= 0 &&
        row.accounting_complete === false && typeof row.observed_at === 'string' &&
        pointers.data!.some(pointer => pointer.snapshot_id === row.id && pointer.accrual_date === row.accrual_date))) {
    return { ...base, status: 'UNAVAILABLE' as const };
  }
  const rowsStored = snapshots.data.reduce((total, row) => total + row.row_count, 0);
  return { daysChecked: pointers.data.length, rowsStored,
    latestCapture: snapshots.data.map(row => row.observed_at).sort().at(-1) ?? null,
    status: rowsStored === 0 ? 'NO_ACCRUALS_REPORTED' as const : 'SOURCE_ROWS_STORED' as const };
}
