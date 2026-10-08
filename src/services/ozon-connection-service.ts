import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptOzonCredentials, decryptOzonCredentials, decryptOzonPerformanceCredentials, type OzonPerformanceCredentialPair } from '@/lib/ozon/credentials';
import { createOzonReadClient } from '@/lib/ozon/read-client';

const publicColumns = 'id,company_id,marketplace,account_name,is_active,is_default,sync_enabled';

/** Caller must authorize company settings. No automatic worker/lifecycle or default-account change. */
export async function connectOzonAccount(input: {
  companyId: string; accountName: string; clientId: string; apiKey: string;
  accountId?: string; client?: SupabaseClient;
  performance?: OzonPerformanceCredentialPair;
}) {
  if (!/^[1-9]\d*$/.test(input.companyId) || !input.accountName?.trim() ||
      !/^[1-9]\d*$/.test(input.clientId?.trim()) || !input.apiKey?.trim() ||
      /[\r\n]/.test(input.apiKey) || (input.accountId && !/^[1-9]\d*$/.test(input.accountId))) {
    throw new Error('invalid_ozon_connection');
  }
  if(input.performance&&(!input.performance.clientId?.trim()||!input.performance.clientSecret?.trim()||/[\r\n]/.test(input.performance.clientId+input.performance.clientSecret))) throw new Error('invalid_ozon_performance_credentials');
  // Verify authentication with a bounded read; empty catalog is valid for a new store.
  await createOzonReadClient({ clientId: input.clientId, apiKey: input.apiKey }).readPage('products', '', 1);
  const client: SupabaseClient = input.client ?? createAdminClient();
  // Connection becomes selectable only when all its durable source tables are available.
  for (const table of ['ozon_source_current', 'ozon_posting_source_current', 'ozon_accrual_source_current', 'ozon_financial_reference_current']) {
    const ready = await client.from(table).select('marketplace_account_id').limit(0);
    if (ready.error) throw new Error('ozon_connection_schema_not_ready');
  }
  let accountId = input.accountId;
  let performance = input.performance;
  if (accountId) {
    const existing = await client.from('marketplace_accounts').select('id,api_key_encrypted')
      .eq('id', accountId).eq('company_id', input.companyId).eq('marketplace', 'ozon').single();
    if (existing.error || !existing.data) throw new Error('ozon_account_scope_mismatch');
    if (existing.data.api_key_encrypted?.trim()) {
      const previous = decryptOzonCredentials(existing.data.api_key_encrypted, { accountId, companyId: input.companyId });
      if (previous.clientId !== input.clientId.trim()) throw new Error('ozon_store_identity_change_rejected');
      performance ??= decryptOzonPerformanceCredentials(existing.data.api_key_encrypted,{accountId,companyId:input.companyId}) ?? undefined;
    }
  } else {
    // Allocate the real identity first. If finalization fails, the row stays inert, with no secret.
    const reserved = await client.from('marketplace_accounts').insert({
      company_id: input.companyId, marketplace: 'ozon', account_name: input.accountName.trim(),
      seller_id: null, api_key_encrypted: '', is_active: false, sync_enabled: false,
      is_default: false, last_sync_status: 'idle',
    }).select('id').single();
    if (reserved.error || !reserved.data) throw new Error('ozon_account_reservation_failed');
    accountId = String(reserved.data.id);
  }
  const encrypted = encryptOzonCredentials({ ...input, accountId, performance });
  // Self-check the bound envelope before exposing the account to the selector.
  decryptOzonCredentials(encrypted, { accountId, companyId: input.companyId });
  const result = await client.from('marketplace_accounts').update({
    account_name: input.accountName.trim(), api_key_encrypted: encrypted,
    is_active: true, sync_enabled: true, updated_at: new Date().toISOString(),
  }).eq('id', accountId).eq('company_id', input.companyId).eq('marketplace', 'ozon')
    .select(publicColumns).single();
  if (result.error || !result.data) throw new Error('ozon_account_finalization_failed');
  return { ...result.data, id: String(result.data.id), company_id: String(result.data.company_id),
    has_api_key: true, has_performance_credentials: !!performance, automaticSyncEnabled: false };
}
