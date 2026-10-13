/** Explicit account only. Read-only by default; --persist requires migration and owner authorization. */
import { readFileSync, existsSync } from 'node:fs';
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] ??= match[2].replace(/^['"]|['"]$/g, '');
  }
}
const args = process.argv.slice(2);
const accountId = args[args.indexOf('--account') + 1];
if (!args.includes('--account') || !/^[1-9]\d*$/.test(accountId ?? '') || args.some(a => !['--account', accountId, '--persist'].includes(a))) {
  throw new Error('Usage: node --import tsx scripts/capture-wb-fbs-stock.mjs --account ID [--persist]');
}
const { createAdminClient } = await import('../src/lib/supabase/admin.ts');
const { getMarketplaceAccountForSync } = await import('../src/services/marketplace-account-service.ts');
const { fetchSellerWarehouses } = await import('../src/lib/wildberries/seller-warehouses.ts');
const { captureFbsStocks, summarizeFbsStock } = await import('../src/lib/wildberries/fbs-stock.ts');
const { persistSellerWarehouses } = await import('../src/services/wb-seller-warehouse-service.ts');
const client = createAdminClient();
const account = await getMarketplaceAccountForSync(accountId);
if (account.marketplace !== 'wildberries') throw new Error('WB account required');
const variants = [];
for (let offset = 0; ; offset += 1000) {
  const result = await client.from('product_variants').select('product_id,chrt_id,tech_size')
    .eq('marketplace_account_id', accountId).order('id').range(offset, offset + 999);
  if (result.error) throw new Error(`FBS catalog unavailable: ${result.error.code}`);
  variants.push(...result.data);
  if (result.data.length < 1000) break;
  if (variants.length > 50000) throw new Error('FBS catalog exceeds capture bounds');
}
const warehouses = await fetchSellerWarehouses(account.apiKey);
const rows = await captureFbsStocks(accountId, account.apiKey, warehouses, variants);
let persisted = 0;
if (args.includes('--persist')) {
  await persistSellerWarehouses(accountId, warehouses, rows[0].observed_at, client);
  const result = await client.rpc('replace_wb_fbs_current_stocks', { p_account_id: accountId, p_rows: rows });
  if (result.error) throw new Error(`Atomic FBS persistence failed: ${result.error.message}`);
  if (result.data !== rows.length) throw new Error('FBS persisted count mismatch');
  persisted = result.data;
}
console.log(JSON.stringify({ accountId, mode: args.includes('--persist') ? 'persist' : 'read_only',
  variants: new Set(rows.map(r => r.chrt_id)).size, warehouses: new Set(rows.map(r => r.seller_warehouse_id)).size,
  ...summarizeFbsStock(rows), missingVariants: rows.filter(r => r.quantity === null).length, persisted }));
