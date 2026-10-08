import { OzonReadError } from './read-client';
import { parseOzonSourceJson } from './source-json';
import type { OzonAccrualType } from './finance-types';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Current Seller API only. Monthly realization is available without assuming Premium daily-report access. */
export function createOzonFinancialReferenceClient(input: { clientId: string; apiKey: string; fetch?: typeof fetch }) {
  if (typeof window !== 'undefined' || !input.clientId.trim() || !input.apiKey.trim() || /[\r\n]/.test(input.clientId + input.apiKey)) throw new OzonReadError('configuration', null, null, 'invalid_credentials');
  const clientId = input.clientId.trim(), apiKey = input.apiKey.trim(), fetcher = input.fetch ?? fetch;
  async function post(endpoint: string, body: unknown, exactNumbers = false): Promise<unknown> {
    let response: Response;
    try { response = await fetcher(`https://api-seller.ozon.ru${endpoint}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Client-Id': clientId, 'Api-Key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new OzonReadError('request', endpoint, null, 'transport_failed'); }
    if (!response.ok) throw new OzonReadError('request', endpoint, response.status, 'http_error');
    try { return parseOzonSourceJson(await response.text(), exactNumbers); }
    catch { throw new OzonReadError('response', endpoint, response.status, 'invalid_json'); }
  }
  return Object.freeze({
    async captureTypes() {
      const observedAt = new Date().toISOString(), value = await post('/v1/finance/accrual/types', {});
      if (!record(value) || !Array.isArray(value.accrual_types) || !value.accrual_types.length || value.accrual_types.length > 2000) throw new OzonReadError('response', '/v1/finance/accrual/types', 200, 'invalid_types');
      const ids = new Set<number>();
      const types: OzonAccrualType[] = value.accrual_types.map(row => {
        if (!record(row) || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || typeof row.description !== 'string') throw new OzonReadError('response', '/v1/finance/accrual/types', 200, 'invalid_type_identity');
        ids.add(row.id); return { id: row.id, name: row.name, description: row.description };
      });
      return { periodKey: '*', observedAt, payload: { types }, rows: types.length };
    },
    async captureRealization(month: string) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2023-08') throw new OzonReadError('configuration', null, null, 'invalid_realization_month');
      const [year, m] = month.split('-').map(Number), observedAt = new Date().toISOString();
      const value = await post('/v2/finance/realization', { year, month: m }, true);
      if (!record(value) || !record(value.result) || !record(value.result.header) || !Array.isArray(value.result.rows) || value.result.rows.length > 10000 || !value.result.rows.every(record)) throw new OzonReadError('response', '/v2/finance/realization', 200, 'invalid_realization');
      const header = value.result.header;
      const lastDay = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
      if (header.start_date?.toString().slice(0, 10) !== `${month}-01` || header.stop_date?.toString().slice(0, 10) !== lastDay || typeof header.currency_sys_name !== 'string') throw new OzonReadError('response', '/v2/finance/realization', 200, 'realization_period_mismatch');
      const seen = new Set<string>();
      const rows = value.result.rows.map(row => {
        if (!record(row.item) || !/^\d+$/.test(String(row.rowNumber)) || seen.has(String(row.rowNumber)) || !/^[1-9]\d*$/.test(String(row.item.sku)) || typeof row.item.offer_id !== 'string') throw new OzonReadError('response', '/v2/finance/realization', 200, 'invalid_realization_identity');
        seen.add(String(row.rowNumber));
        const commission = (source: unknown) => {
          if (!record(source)) throw new OzonReadError('response', '/v2/finance/realization', 200, 'missing_realization_commission');
          const out: Record<string, string> = {};
          for (const key of ['amount','bonus','commission','compensation','price_per_instance','quantity','standard_fee','bank_coinvestment','stars','pick_up_point_coinvestment','total']) {
            if (typeof source[key] !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(source[key] as string)) throw new OzonReadError('response', '/v2/finance/realization', 200, 'invalid_realization_amount');
            out[key] = source[key] as string;
          }
          if (!/^\d+$/.test(out.quantity)) throw new OzonReadError('response', '/v2/finance/realization', 200, 'invalid_realization_quantity');
          return out;
        };
        return { rowNumber: String(row.rowNumber), item: { sku: String(row.item.sku), offer_id: row.item.offer_id },
          delivery_commission: commission(row.delivery_commission), return_commission: commission(row.return_commission) };
      });
      // Fiscal identifiers/names, contract numbers and unrelated response fields are deliberately omitted.
      return { periodKey: month, observedAt, payload: { header: { from: `${month}-01`, to: lastDay,
        currency: header.currency_sys_name, publicationDate: typeof header.doc_date === 'string' ? header.doc_date : null }, rows }, rows: rows.length };
    },
  });
}
