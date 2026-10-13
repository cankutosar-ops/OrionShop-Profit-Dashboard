import type { SupabaseClient } from "@/lib/supabase/server";
import type { FbsStockRow } from "@/lib/wildberries/fbs-stock";
export async function readFbsStockRows(accountId:string,client:SupabaseClient,productId?:string):Promise<FbsStockRow[]>{
 const rows:FbsStockRow[]=[];
 for(let offset=0;;offset+=1000){let q=client.from("wb_fbs_current_stocks").select("*").eq("marketplace_account_id",accountId);if(productId)q=q.eq("product_id",productId);
 const result=await q.order("seller_warehouse_id").order("chrt_id").range(offset,offset+999);
 if(result.error){if(["42P01","PGRST205"].includes(result.error.code))return [];throw new Error("FBS stock read unavailable");}
 rows.push(...result.data as unknown as FbsStockRow[]);
 if(rows.length>50000)throw new Error("FBS stock read exceeds bounds");
 if(result.data.length<1000)return rows;}
}
