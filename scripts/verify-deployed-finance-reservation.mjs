import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFinanceRecoveryReservation } from '../src/lib/finance-recovery/reservation.ts';

const keys = ['VERCEL', 'NETLIFY', 'GITHUB_ACTIONS', 'NODE_ENV', 'ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE'];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const dir = mkdtempSync(join(tmpdir(), 'orion-reservation-'));
const file = join(dir, 'inactive.json');
writeFileSync(file, JSON.stringify({ accountId: '2', campaignStatus: 'inactive' }));
try {
  for (const [key, value] of [['NETLIFY', 'true'], ['GITHUB_ACTIONS', 'true'], ['VERCEL', '1'], ['NODE_ENV', 'production']]) {
    keys.forEach(k => delete process.env[k]);
    process.env[key] = value;
    assert.equal(resolveFinanceRecoveryReservation('2', file).source, 'fail_closed');
    assert.equal(resolveFinanceRecoveryReservation('2', file).reserved, true);
    assert.equal(resolveFinanceRecoveryReservation('1', file).reserved, false);
    process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = 'false';
    assert.equal(resolveFinanceRecoveryReservation('2', file).reserved, false);
    process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE = 'true';
    assert.equal(resolveFinanceRecoveryReservation('2', file).reserved, true);
  }
  console.log('PASS hosted runtime reservation: Netlify, GitHub, Vercel, production Node; explicit overrides and account isolation');
} finally {
  for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  rmSync(dir, { recursive: true });
}
