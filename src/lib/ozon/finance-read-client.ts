import { OzonReadError } from './read-client';
import { parseOzonSourceJson } from './source-json';

const endpoint = '/v1/finance/accrual/by-day';
const cursorLifetimeMs = 15 * 60 * 1000;
type AccrualPage = { accruals: Record<string, unknown>[]; lastId: string; empty: boolean };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A cursor belongs to this one date. Raw source evidence is not an accounting result. */
export function createOzonAccrualReadSession(input: {
  clientId: string;
  apiKey: string;
  date: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  if (typeof window !== 'undefined') throw new OzonReadError('configuration', endpoint, null, 'server_runtime_required');
  const clientId = input.clientId.trim();
  const apiKey = input.apiKey.trim();
  if (!clientId || !apiKey || /[\r\n]/.test(clientId + apiKey)) {
    throw new OzonReadError('configuration', endpoint, null, 'invalid_credentials');
  }
  const date = input.date;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < '2022-01-01') {
    throw new OzonReadError('configuration', endpoint, null, 'invalid_accrual_date');
  }
  const request = input.fetch ?? fetch;
  const now = input.now ?? Date.now;
  let cursor = '';
  let receivedAt: number | null = null;
  let started = false;
  let ended = false;
  let running = false;
  let failed = false;
  const cursors = new Set<string>();
  return Object.freeze({
    async readNextPage(): Promise<AccrualPage> {
      if (failed || ended || running) throw new OzonReadError('configuration', endpoint, null, 'session_not_readable');
      if (started && (!cursor || receivedAt === null || now() - receivedAt >= cursorLifetimeMs)) {
        throw new OzonReadError('configuration', endpoint, null, 'cursor_expired_or_unproven');
      }
      running = true;
      try {
        let response: Response;
        try {
          response = await request(`https://api-seller.ozon.ru${endpoint}`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
            headers: { 'Client-Id': clientId, 'Api-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, last_id: cursor }),
          });
        } catch { throw new OzonReadError('request', endpoint, null, 'transport_failed'); }
        if (!response.ok) throw new OzonReadError('request', endpoint, response.status, 'http_error');
        let value: unknown;
        try { value = parseOzonSourceJson(await response.text()); } catch {
          throw new OzonReadError('response', endpoint, response.status, 'invalid_json');
        }
        if (!record(value) || !Array.isArray(value.accruals) || !value.accruals.every(record) || typeof value.last_id !== 'string') {
          throw new OzonReadError('response', endpoint, response.status, 'invalid_accrual_envelope');
        }
        if (value.last_id && (value.last_id === cursor || cursors.has(value.last_id))) {
          throw new OzonReadError('response', endpoint, response.status, 'cursor_not_advancing');
        }
        started = true;
        cursor = value.last_id;
        receivedAt = now();
        if (cursor) cursors.add(cursor);
        // The supplied contract does not define the terminal-page rule. Stop transport
        // on an empty page/cursor, but never label this financially complete.
        ended = value.accruals.length === 0 || !cursor;
        return { accruals: value.accruals, lastId: cursor, empty: value.accruals.length === 0 };
      } catch (error) {
        failed = true; // No inline retry or reuse after an ambiguous request failure.
        throw error;
      } finally { running = false; }
    },
  });
}
