/** Default is read-only. --persist requires the catalog migration to have been applied separately. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
for (const name of ['.env.local','.env']) {
 const path=resolve(name); if(!existsSync(path)) continue;
 for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {
  const m=line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if(m) process.env[m[1]] ??= m[2].replace(/^(['"])(.*)\1$/,'$2');
 }
}
const args=process.argv.slice(2);
const accountId=args[args.indexOf('--account')+1];
if(!args.includes('--account') || !/^\d+$/.test(accountId??'') || Number(accountId)<=0) throw new Error('Explicit --account ID required');
const {getMarketplaceAccountForSync}=await import('../src/services/marketplace-account-service.ts');
const {fetchSellerWarehouses}=await import('../src/lib/wildberries/seller-warehouses.ts');
const account=await getMarketplaceAccountForSync(accountId);
const rows=await fetchSellerWarehouses(account.apiKey);
let persisted=0;
if(args.includes('--persist')) {
 const {createAdminClient}=await import('../src/lib/supabase/admin.ts');
 const {persistSellerWarehouses}=await import('../src/services/wb-seller-warehouse-service.ts');
 persisted=await persistSellerWarehouses(accountId,rows,new Date().toISOString(),createAdminClient());
}
console.log(JSON.stringify({accountId,mode:args.includes('--persist')?'catalog_upsert':'read_only',
 count:rows.length,persisted,warehouses:rows.map(row=>({id:row.id,name:row.name,officeId:row.officeId,deliveryType:row.deliveryType}))}));
