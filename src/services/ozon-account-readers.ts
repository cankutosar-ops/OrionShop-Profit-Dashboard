import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {decryptOzonCredentials,decryptOzonPerformanceCredentials} from '@/lib/ozon/credentials';
import {createOzonReadClient} from '@/lib/ozon/read-client';
import {createOzonPostingReadClient} from '@/lib/ozon/posting-read-client';
import {createOzonAccrualReadSession} from '@/lib/ozon/finance-read-client';
import {createOzonFinancialReferenceClient} from '@/lib/ozon/financial-reference-client';
import {createOzonPerformanceReadClient} from '@/lib/ozon/performance-read-client';

/** Ingestion only. Caller must authorize this canonical company/account scope first. Never call on Dashboard reads. */
export async function loadOzonAccountReaders(input:{accountId:string;companyId:string;client?:SupabaseClient}) {
  if(!/^[1-9]\d*$/.test(input.accountId)||!/^[1-9]\d*$/.test(input.companyId))throw new Error('invalid_ozon_account_scope');
  const client=input.client??createAdminClient();
  const {data,error}=await client.from('marketplace_accounts').select('id,company_id,marketplace,is_active,sync_enabled,api_key_encrypted')
    .eq('id',input.accountId).eq('company_id',input.companyId).maybeSingle();
  if(error||!data||String(data.id)!==input.accountId||String(data.company_id)!==input.companyId||data.marketplace!=='ozon'||
    data.is_active!==true||data.sync_enabled!==true||typeof data.api_key_encrypted!=='string')throw new Error('ozon_account_not_available_for_capture');
  const credentials=decryptOzonCredentials(data.api_key_encrypted,input);
  const products=createOzonReadClient(credentials),postings=createOzonPostingReadClient(credentials);
  const references=createOzonFinancialReferenceClient(credentials);
  const performanceCredentials=decryptOzonPerformanceCredentials(data.api_key_encrypted,input);
  const performance=performanceCredentials?createOzonPerformanceReadClient(performanceCredentials):null;
  // Plaintext/ciphertext never become returned object properties or account JSON.
  return Object.freeze({accountId:input.accountId,companyId:input.companyId,readPage:products.readPage,capturePostings:postings.capture,
    captureAccrualTypes:references.captureTypes,captureRealization:references.captureRealization,
    capturePerformanceReport:(kind:'daily'|'expense',from:string,to:string)=>{
      if(!performance)throw new Error('ozon_performance_credentials_required');
      return performance.captureReport(kind,from,to);
    },
    createAccrualSession:(date:string)=>createOzonAccrualReadSession({...credentials,date})});
}
