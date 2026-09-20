import assert from 'node:assert/strict';
import { safeAuthRedirect } from '../src/lib/security/safe-auth-redirect.ts';
for (const input of ['//evil.test', '/\\evil.test', '/\t/evil.test', 'https://evil.test', 'javascript:alert(1)', null, '', '\\evil.test']) {
  assert.equal(safeAuthRedirect(input), '/', String(input));
}
for (const input of ['/reports?account=1', '/inventory#history', '/']) {
  assert.equal(safeAuthRedirect(input), input);
}
console.log('PASS: auth redirects preserve local routes and reject foreign/normalized origins');
