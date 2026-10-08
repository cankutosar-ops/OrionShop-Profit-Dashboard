import type { SupabaseClient } from "@supabase/supabase-js";
import type { OzonSourceCapture } from "@/lib/ozon/capture";
import type { OzonPostingEvidence,OzonPostingScheme } from "@/lib/ozon/posting-read-client";

/** Inject only an authorized server/worker client. This does not connect automatically. */
export function createOzonSourcePublisher(client: SupabaseClient) {
  return async (capture: OzonSourceCapture): Promise<number> => {
    const { data, error } = await client.rpc("orion_publish_ozon_source_capture", {
      p_account_id: capture.accountId, p_entity: capture.entity, p_snapshot_id: capture.snapshotId,
      p_observed_at: capture.observedAt, p_items: capture.items,
    });
    if (error) throw new Error("ozon_source_publication_failed");
    if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
      throw new Error("ozon_source_publication_invalid_result");
    }
    return data;
  };
}

export function createOzonPostingPublisher(client:SupabaseClient) {
  return async(capture:{accountId:string;scheme:OzonPostingScheme;snapshotId:string;from:string;to:string;observedAt:string;postings:OzonPostingEvidence[];complete:true})=>{
    if(capture.complete!==true||!/^[1-9]\d*$/.test(capture.accountId))throw new Error('invalid_ozon_posting_publication');
    const {data,error}=await client.rpc('orion_publish_ozon_posting_capture',{p_account_id:capture.accountId,p_scheme:capture.scheme,p_snapshot_id:capture.snapshotId,p_from:capture.from,p_to:capture.to,p_observed_at:capture.observedAt,p_postings:capture.postings});
    if(error||typeof data!=='number'||data!==capture.postings.length)throw new Error('ozon_posting_publication_failed');
    return data;
  };
}
