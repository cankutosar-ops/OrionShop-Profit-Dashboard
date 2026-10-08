import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOzonCatalogModel } from '@/lib/ozon/catalog-model';

export type OzonCaptureStatus = {
  entity: 'products' | 'prices' | 'stocks';
  status: 'STORED' | 'NOT_CAPTURED' | 'UNAVAILABLE';
  observedAt: string | null;
  rowCount: number | null;
};

/** DB only. Caller must first resolve and authorize the account/company scope. */
export async function getOzonCaptureStatuses(client: SupabaseClient, accountId: string): Promise<OzonCaptureStatus[]> {
  return Promise.all((['products', 'prices', 'stocks'] as const).map(async entity => {
    const base = { entity, observedAt: null, rowCount: null };
    const pointer = await client.from('ozon_source_current').select('snapshot_id')
      .eq('marketplace_account_id', accountId).eq('entity', entity).maybeSingle();
    if (pointer.error) return { ...base, status: 'UNAVAILABLE' as const };
    if (!pointer.data) return { ...base, status: 'NOT_CAPTURED' as const };
    const capture = await client.from('ozon_source_snapshots').select('observed_at,row_count')
      .eq('marketplace_account_id', accountId).eq('entity', entity)
      .eq('id', pointer.data.snapshot_id).single();
    if (capture.error || !capture.data || typeof capture.data.observed_at !== 'string' ||
        !Number.isSafeInteger(capture.data.row_count) || capture.data.row_count < 0) {
      return { ...base, status: 'UNAVAILABLE' as const };
    }
    return { entity, status: 'STORED' as const, observedAt: capture.data.observed_at,
      rowCount: capture.data.row_count as number };
  }));
}

export async function getOzonCatalog(client: SupabaseClient, accountId: string) {
  const read = async (entity: 'products'|'prices'|'stocks') => {
    const pointer = await client.from('ozon_source_current').select('snapshot_id')
      .eq('marketplace_account_id',accountId).eq('entity',entity).maybeSingle();
    if(pointer.error||!pointer.data)return null;
    const snapshot=await client.from('ozon_source_snapshots').select('items')
      .eq('marketplace_account_id',accountId).eq('entity',entity).eq('id',pointer.data.snapshot_id).single();
    if(snapshot.error||!Array.isArray(snapshot.data?.items))return null;
    if(!snapshot.data.items.every((item:unknown)=>item!==null&&typeof item==='object'&&!Array.isArray(item)))return null;
    return snapshot.data.items as Record<string,unknown>[];
  };
  const [products,prices,stocks]=await Promise.all([read('products'),read('prices'),read('stocks')]);
  return buildOzonCatalogModel({products,prices,stocks});
}
