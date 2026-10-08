import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOzonFinanceModel, type OzonFinanceSnapshot } from '@/lib/ozon/finance-model';
import type { OzonAccrualType } from '@/lib/ozon/finance-types';
import {calculateOzonNetProfit,type VerifiedOzonProfitInputs} from '@/lib/ozon/profit';

/** Authorized DB-only provider. Reads pinned dictionaries, not today's reinterpretation of old expenses. */
export async function getOzonFinance(client: SupabaseClient, accountId: string, from: string, to: string, verifiedProfitInputs:VerifiedOzonProfitInputs|null=null) {
  const empty = () => buildOzonFinanceModel({ accountId, from, to, snapshots: [], dictionary: null });
  const first = Date.parse(`${from}T00:00:00Z`), last = Date.parse(`${to}T00:00:00Z`);
  if (!/^[1-9]\d*$/.test(accountId) || !Number.isFinite(first) || !Number.isFinite(last) ||
      new Date(first).toISOString().slice(0,10) !== from || new Date(last).toISOString().slice(0,10) !== to ||
      last < first || last - first > 366 * 86400000) throw new Error('invalid_ozon_finance_scope');
  const pointers = await client.from('ozon_accrual_source_current').select('snapshot_id,accrual_date')
    .eq('marketplace_account_id', accountId).gte('accrual_date', from).lte('accrual_date', to).order('accrual_date').limit(367);
  if (pointers.error) return { model: empty(), unavailable: true };
  if (!pointers.data?.length) return { model: empty(), unavailable: false };
  const snapshots: OzonFinanceSnapshot[] = [];
  const dictionaries = new Map<string,OzonAccrualType[]>();
  let totalRows=0;
  for (let offset = 0; offset < pointers.data.length; offset += 40) {
    const selected = pointers.data.slice(offset, offset + 40);
    const result = await client.from('ozon_accrual_source_snapshots').select('id,marketplace_account_id,accrual_date,accruals,row_count,type_dictionary_snapshot_id')
      .eq('marketplace_account_id', accountId).in('id', selected.map(row => row.snapshot_id));
    if (result.error || result.data?.length !== selected.length) return { model: empty(), unavailable: true };
    for (const snapshot of result.data) {
      totalRows+=snapshot.row_count;
      if(totalRows>10000) return {model:empty(),unavailable:true};
      if (!Array.isArray(snapshot.accruals) || snapshot.row_count !== snapshot.accruals.length || !snapshot.accruals.every((row: unknown) => row !== null && typeof row === 'object' && !Array.isArray(row)) ||
          !selected.some(pointer => pointer.snapshot_id === snapshot.id && pointer.accrual_date === snapshot.accrual_date)) return { model: empty(), unavailable: true };
      let dictionary: OzonAccrualType[] | null = null;
      if (snapshot.type_dictionary_snapshot_id) {
        const cached=dictionaries.get(snapshot.type_dictionary_snapshot_id);
        if(cached) dictionary=cached;
        else {
        const types = await client.from('ozon_financial_reference_snapshots').select('payload').eq('marketplace_account_id', accountId)
          .eq('kind', 'finance-types').eq('period_key', '*').eq('id', snapshot.type_dictionary_snapshot_id).single();
        if (types.error || !Array.isArray(types.data?.payload?.types)) return { model: empty(), unavailable: true };
        dictionary = types.data.payload.types;
        if (!dictionary?.every(row => Number.isSafeInteger(row.id) && row.id > 0 && typeof row.name === 'string' && typeof row.description === 'string')) return { model: empty(), unavailable: true };
        dictionaries.set(snapshot.type_dictionary_snapshot_id,dictionary);
        }
      }
      snapshots.push({ ...snapshot, marketplace_account_id: String(snapshot.marketplace_account_id), dictionary });
    }
  }
  const model=buildOzonFinanceModel({accountId,from,to,snapshots,dictionary:null});
  // Current route supplies no unverified costing/tax inputs. Future verified adapters use the same scope-checked arithmetic.
  const profit=calculateOzonNetProfit(model,verifiedProfitInputs);
  if(profit.status==='VERIFIED'&&verifiedProfitInputs){model.netProfit=profit.netProfit;model.productCost=verifiedProfitInputs.productCost.amount;model.tax=verifiedProfitInputs.tax.amount;}
  return {model,unavailable:false};
}

export async function getOzonRealization(client: SupabaseClient, accountId: string, from: string, to: string) {
  const month = from.slice(0, 7);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (from !== `${month}-01` || to !== lastDay) return { status: 'FULL_MONTH_REQUIRED' as const, rows: [] };
  const pointer = await client.from('ozon_financial_reference_current').select('snapshot_id')
    .eq('marketplace_account_id', accountId).eq('kind', 'realization-monthly').eq('period_key', month).maybeSingle();
  if (pointer.error) return { status: 'UNAVAILABLE' as const, rows: [] };
  if (!pointer.data) return { status: 'NOT_CAPTURED' as const, rows: [] };
  const result = await client.from('ozon_financial_reference_snapshots').select('payload,row_count')
    .eq('marketplace_account_id', accountId).eq('kind', 'realization-monthly').eq('period_key', month).eq('id', pointer.data.snapshot_id).single();
  if (result.error || !Array.isArray(result.data?.payload?.rows) || result.data.row_count !== result.data.payload.rows.length ||
      result.data.payload.header?.from !== from || result.data.payload.header?.to !== to) return { status: 'UNAVAILABLE' as const, rows: [] };
  const rows: { sku: string; offerId: string; sold: string; returned: string }[] = [];
  for (const row of result.data.payload.rows) {
    if (!row?.item || !/^[1-9]\d*$/.test(row.item.sku) || typeof row.item.offer_id !== 'string' ||
        !/^\d+$/.test(row.delivery_commission?.quantity) || !/^\d+$/.test(row.return_commission?.quantity)) return { status: 'UNAVAILABLE' as const, rows: [] };
    rows.push({ sku: row.item.sku, offerId: row.item.offer_id, sold: row.delivery_commission.quantity, returned: row.return_commission.quantity });
  }
  return { status: 'STORED' as const, rows };
}
