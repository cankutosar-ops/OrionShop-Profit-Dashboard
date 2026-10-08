// Complete bounded capture into ignored LOCAL files only. No database client.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createOzonReadClient, OzonReadError } from '../src/lib/ozon/read-client.ts';
import { captureOzonSource } from '../src/lib/ozon/capture.ts';

const entity = process.argv[2];
if (!['products', 'prices', 'stocks'].includes(entity) || process.argv.length !== 3) {
  throw new Error('Usage: node --import tsx scripts/capture-ozon-local.mjs products|prices|stocks');
}
try {
  const credentials = {};
  for (const line of (await readFile('.env.ozon.local', 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(OZON_CLIENT_ID|OZON_API_KEY)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    credentials[match[1]] = value;
  }
  const client = createOzonReadClient({ clientId: credentials.OZON_CLIENT_ID ?? '', apiKey: credentials.OZON_API_KEY ?? '' });
  const result = await captureOzonSource({
    accountId: '1', // LOCAL fixture scope only; not a production marketplace account ID.
    entity, readPage: client.readPage, maxPages: 5,
    publish: async capture => {
      await mkdir('.audit/ozon-captures', { recursive: true });
      await writeFile(`.audit/ozon-captures/${entity}-${capture.snapshotId}.json`, JSON.stringify({ ...capture, localFixtureOnly: true }));
      return capture.items.length;
    },
  });
  console.log(JSON.stringify({ entity, ...result, destination: 'local ignored file', productionWrites: 0 }));
} catch (error) {
  console.error(JSON.stringify(error instanceof OzonReadError ? {
    stage: error.stage, endpoint: error.endpoint, httpStatus: error.httpStatus, reason: error.reason,
  } : { stage: 'capture', reason: [
    'ozon_empty_capture_requires_review', 'ozon_page_budget_exhausted', 'ozon_product_identity_invalid_or_duplicate',
    'ozon_cursor_contract_failure',
  ].includes(error?.message) ? error.message : 'local_capture_failed' }));
  process.exitCode = 1;
}
