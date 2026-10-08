// Ozon read only, local sanitized files only; no Supabase client or production account ID.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createOzonPostingReadClient} from '../src/lib/ozon/posting-read-client.ts';
import {OzonReadError} from '../src/lib/ozon/read-client.ts';
const [scheme,from,to]=process.argv.slice(2);
if(!['fbo','fbs'].includes(scheme)||!from||!to)throw new Error('Usage: fbo|fbs explicit-from-ISO explicit-to-ISO');
try {
 const credentials={};for(const line of (await readFile('.env.ozon.local','utf8')).split(/\r?\n/)){const m=line.match(/^\s*(OZON_CLIENT_ID|OZON_API_KEY)\s*=\s*(.*)$/);if(m)credentials[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2')}
 const client=createOzonPostingReadClient({clientId:credentials.OZON_CLIENT_ID??'',apiKey:credentials.OZON_API_KEY??''});
 const capture=await client.capture(scheme,from,to);
 await mkdir('.audit/ozon-postings',{recursive:true});await writeFile(`.audit/ozon-postings/${scheme}-${randomUUID()}.json`,JSON.stringify({...capture,localFixtureOnly:true}));
 console.log(JSON.stringify({scheme,from,to,rows: capture.postings.length,pages:capture.pagesFetched,complete:capture.complete,destination:'local sanitized file',productionWrites:0}));
}catch(error){console.error(JSON.stringify(error instanceof OzonReadError?{stage:error.stage,endpoint:error.endpoint,httpStatus:error.httpStatus,reason:error.reason}:{reason:'local_posting_capture_failed'}));process.exitCode=1}
