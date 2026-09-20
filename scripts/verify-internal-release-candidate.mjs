/** Offline release regressions. Run from an isolated checkout without .env files.
 * Live database, browser and build acceptance are separate recorded gates.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node 22');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.e2e.local']) {
  if (existsSync(name)) throw new Error(`Use an isolated checkout without ${name}`);
}
const tests = [
  'production-data-plane', 'marketplace-fee-signed', 'sales-event-identity',
  'sales-price-readiness-offline', 'product-cost-product-scope',
  'product-profit-report-9-3', 'settlement-report-9-2',
  'group-performance-report-9-4', 'reporting-module-9-1', 'reporting-export-9-5',
  'weekly-business-excel', 'csv-formula-safety', 'finance-incremental-offline',
  'finance-incremental-lease-offline', 'finance-recovery-bounds',
  'finance-page-recovery', 'finance-recovery-campaign', 'finance-zero-corrections-offline',
  'deployed-finance-reservation', 'account1-reports-v1-migration',
  'commercial-continuity-authz-offline', 'tenant-authorization-p0',
  'product-pagination-offline', 'auth-redirect-offline', 'dashboard-read-boundary-offline',
  'financial-pagination-offline', 'inventory-retention-safety',
  'inventory-history-table', 'canonical-current-stock-offline',
  'wb-current-prices-offline', 'smart-pricing-v2-8-1', 'sync-worker',
  'worker-production-readiness', 'secrets-7-1-e',
  'warehouse-db-only-10-6', 'advertising-ingestion',
  'inventory-intelligence-6-46-1', 'loss-bearing-products-offline',
];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/SUPABASE|MARKETPLACE|WB_API|INTERNAL_API|CRON_SECRET|E2E_|FINANCE_|ORION_|NEXT_PUBLIC/i.test(key)
));
env.INVENTORY_SNAPSHOT_SCHEDULER = '0';
env.TSX_TSCONFIG_PATH = path.resolve('tsconfig.json');
const out = path.resolve('.audit/internal-release-suite');
mkdirSync(out, {recursive:true});
const results = [];
for (const test of tests) {
  const testEnv = {...env};
  if (test === 'secrets-7-1-e') {
    testEnv.SUPABASE_SERVICE_ROLE_KEY = 'rc-private-service-marker-20260920';
    testEnv.MARKETPLACE_CREDENTIALS_KEY = 'rc-private-encryption-marker-20260920';
    testEnv.INTERNAL_API_SECRET = 'rc-private-internal-marker-20260920';
  }
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', `scripts/verify-${test}.mjs`],
    {env:testEnv, encoding:'utf8', timeout:300000, maxBuffer:16*1024*1024});
  const log = (result.stdout || '') + (result.stderr || '');
  writeFileSync(path.join(out, `${test}.log`), log);
  const skips = log.split(/\r?\n/).filter(line => /\bSKIP\b/.test(line));
  const status = result.error ? 'ENVIRONMENT BLOCKED' : result.status !== 0 ? 'FAIL' : skips.length ? 'EXPECTED SKIP' : 'PASS';
  results.push({test, status, exitCode:result.status, skips});
  console.log(`${status}: ${test}`);
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(results,null,2));
}
if (results.some(r => ['FAIL','ENVIRONMENT BLOCKED'].includes(r.status))) process.exitCode=1;
