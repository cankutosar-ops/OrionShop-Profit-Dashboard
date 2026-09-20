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
let authCookieWrites=0;
async function request(path,options={}) {
  const r=await fetch(origin+path,{redirect:'manual',...options,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
  for(const cookie of r.headers.getSetCookie()){
    const pair=cookie.split(';')[0],i=pair.indexOf('=');
    if(pair.startsWith('sb-')) {
      authCookieWrites++;
      assert.match(cookie,/;\s*HttpOnly/i,'server-owned Auth cookie must be HttpOnly');
      assert.match(cookie,/;\s*Secure/i,'production Auth cookie must be Secure');
      assert.match(cookie,/;\s*SameSite=Lax/i);
      assert.match(cookie,/;\s*Path=\//i);
    }
    if(/;\s*Max-Age=0/i.test(cookie)) jar.delete(pair.slice(0,i));
    else jar.set(pair.slice(0,i),pair.slice(i+1));
  }
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
// Exercise actual middleware refresh, not only the login cookie writer.
const tokenNames=[...jar.keys()].filter(k=>k.startsWith('sb-') && k.includes('-auth-token')).sort();
assert.ok(tokenNames.length);
const encoded=tokenNames.map(k=>jar.get(k)).join('');
assert.ok(encoded.startsWith('base64-'));
const session=JSON.parse(Buffer.from(encoded.slice(7),'base64url').toString());
session.expires_at=1;
for(const name of tokenNames) jar.delete(name);
const baseName=tokenNames[0].replace(/\.\d+$/,'');
const expired='base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
for(let start=0,index=0;start<expired.length;start+=3000,index++) jar.set(`${baseName}.${index}`,expired.slice(start,start+3000));
const beforeRefresh=authCookieWrites;
response=await request('/api/auth/session');
assert.equal(response.status,200,'middleware refresh retains authentication');
assert.ok(authCookieWrites>beforeRefresh,'middleware refresh writes protected cookies');
// A metadata removal must be observed by app guards even with existing cookies.
assert.equal((await admin.auth.admin.updateUserById(data.user.id,{app_metadata:{orion:{company_ids:[],marketplace_account_ids:[],role:'viewer'}}})).error,null);
assert.equal((await request('/api/sync/status?marketplaceAccountId=1')).status,403,'membership revocation blocks account API');
await request('/auth/logout');
console.log('PASS: local invite/login/refresh/logout Secure HttpOnly cookies, password setup, origin guard, single-use token, viewer denial and membership removal');
