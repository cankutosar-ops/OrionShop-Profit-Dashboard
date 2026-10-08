import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopedDateRange } from '@/types/database';

/** After scope authorization, resolve the actual DB marketplace; never trust URL marketplace names. */
export async function isScopedOzonAccount(client: SupabaseClient, scope: ScopedDateRange) {
  const result = await client.from('marketplace_accounts_public').select('id,company_id,marketplace')
    .eq('id',scope.marketplaceAccountId).eq('company_id',scope.companyId).single();
  if (result.error || !result.data) throw new Error('authorized_marketplace_unavailable');
  return result.data.marketplace === 'ozon';
}
