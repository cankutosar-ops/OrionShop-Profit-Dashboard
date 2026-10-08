/** Bounded account-scoped capture. Default read-only; --persist must be explicitly requested after migrations. */
import {readFileSync,existsSync} from 'node:fs';
for(const file of ['.env.local','.env']) {if(!existsSync(file))continue;for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const m=line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);if(m)process.env[m[1]]??=m[2].replace(/^(['"])(.*)\1$/,'$2')}}
const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const accountId=get('--account'),from=get('--from'),to=get('--to');
if(!/^\d+$/.test(accountId??'')||!from||!to)throw new Error('Explicit --account --from --to required');
const {getMarketplaceAccountForSync}=await import('../src/services/marketplace-account-service.ts');
const {fetchSellerWarehouses}=await import('../src/lib/wildberries/seller-warehouses.ts');
const {fetchFbsOrderEvidence}=await import('../src/lib/wildberries/fbs-orders.ts');
const account=await getMarketplaceAccountForSync(accountId);
const catalog=await fetchSellerWarehouses(account.apiKey);
const orders=await fetchFbsOrderEvidence(account.apiKey,from,to);
if(orders.some(row=>!catalog.some(w=>w.id===row.sellerWarehouseId&&w.deliveryType===1)))throw new Error('Unresolved FBS warehouse in complete capture');
let persisted=0;
if(args.includes('--persist')) {
 const {createAdminClient}=await import('../src/lib/supabase/admin.ts');
 const {persistSellerWarehouses}=await import('../src/services/wb-seller-warehouse-service.ts');
 const {persistFbsOrderEvidence}=await import('../src/services/wb-fbs-evidence-service.ts');
 const client=createAdminClient(),observedAt=new Date().toISOString();
 await persistSellerWarehouses(accountId,catalog,observedAt,client);
 persisted=await persistFbsOrderEvidence(accountId,orders,observedAt,client);
}
console.log(JSON.stringify({accountId,from,to,mode:args.includes('--persist')?'append_evidence':'read_only',sourceOrders:orders.length,persisted}));
