import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { projectOzonPosting,type OzonPostingEvidence,type OzonPostingScheme } from '@/lib/ozon/posting-read-client';
export type OzonPostingWindow={scheme:OzonPostingScheme;status:'STORED'|'NOT_CAPTURED'|'UNAVAILABLE';observedAt:string|null;postings:OzonPostingEvidence[]};

/** Exact source-window DB read after account authorization. No live Ozon request or WB facts. */
export async function getOzonPostingWindows(client:SupabaseClient,accountId:string,from:string,to:string):Promise<OzonPostingWindow[]> {
  return Promise.all((['fbs','fbo'] as const).map(async scheme=>{
    const base={scheme,observedAt:null,postings:[]};
    const pointer=await client.from('ozon_posting_source_current').select('snapshot_id')
      .eq('marketplace_account_id',accountId).eq('scheme',scheme).eq('window_from',from).eq('window_to',to).maybeSingle();
    if(pointer.error)return {...base,status:'UNAVAILABLE' as const};
    if(!pointer.data)return {...base,status:'NOT_CAPTURED' as const};
    const snapshot=await client.from('ozon_posting_source_snapshots').select('observed_at,postings,row_count')
      .eq('marketplace_account_id',accountId).eq('scheme',scheme).eq('window_from',from).eq('window_to',to).eq('id',pointer.data.snapshot_id).single();
    if(snapshot.error||!Array.isArray(snapshot.data?.postings)||snapshot.data.row_count!==snapshot.data.postings.length||typeof snapshot.data.observed_at!=='string')return {...base,status:'UNAVAILABLE' as const};
    try{return {scheme,status:'STORED' as const,observedAt:snapshot.data.observed_at,postings:snapshot.data.postings.map(projectOzonPosting)}}catch{return {...base,status:'UNAVAILABLE' as const}}
  }));
}
