/** Local-only integration test. --config points to ignored LOCAL Supabase env JSON. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const configPath=process.argv.find(a=>a.startsWith('--config='))?.slice(9);
assert.ok(configPath,'--config is required');
const env=JSON.parse(readFileSync(configPath,'utf8'));
const origin=process.argv.find(a=>a.startsWith('--app='))?.slice(6) ?? 'http://127.0.0.1:3100';
for(const url of [origin,env.NEXT_PUBLIC_SUPABASE_URL]) assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname),'LOCAL targets only');
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const email=`rc-invite-${Date.now()}@example.invalid`;
const {data,error}=await admin.auth.admin.generateLink({type:'invite',email});
assert.equal(error,null,'local invite link generation');
assert.ok(data.user && data.properties.hashed_token);
const claims={orion:{company_ids:['1'],marketplace_account_ids:['1'],role:'viewer'}};
assert.equal((await admin.auth.admin.updateUserById(data.user.id,{app_metadata:claims})).error,null);
const jar=new Map();
async function request(path,options={}) {
  const r=await fetch(origin+path,{redirect:'manual',...options,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
  for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
}
const hash=data.properties.hashed_token;
let response=await request(`/auth/confirm?type=invite&token_hash=${encodeURIComponent(hash)}`);
assert.equal(response.status,307);
assert.equal(new URL(response.headers.get('location')).pathname,'/auth/password');
assert.equal(response.headers.get('referrer-policy'),'no-referrer');
assert.equal((await request('/auth/password')).status,200);
const password=randomBytes(24).toString('base64url');
response=await request('/api/auth/password',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:JSON.stringify({password})});
assert.equal(response.status,403,'foreign origin rejected');
response=await request('/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'short'})});
assert.equal(response.status,400,'weak password rejected');
response=await request('/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
assert.equal(response.status,200,'valid setup succeeds');
response=await request('/api/auth/session');
assert.equal((await response.json()).permissions.administration,false);
assert.equal((await request('/api/administration/users')).status,403);
await request('/auth/logout');
assert.equal((await request('/auth/password')).status,307);
response=await request('/auth/confirm?type=invite&token_hash='+encodeURIComponent(hash));
assert.ok(response.headers.get('location').includes('confirmation_failed'),'used invite rejected');
response=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
assert.equal(response.status,200,'new password works');
// A metadata removal must be observed by app guards even with existing cookies.
assert.equal((await admin.auth.admin.updateUserById(data.user.id,{app_metadata:{orion:{company_ids:[],marketplace_account_ids:[],role:'viewer'}}})).error,null);
assert.equal((await request('/api/sync/status?marketplaceAccountId=1')).status,403,'membership revocation blocks account API');
await request('/auth/logout');
console.log('PASS: local invite, password setup, origin guard, single-use token, viewer denial, membership removal and logout');
