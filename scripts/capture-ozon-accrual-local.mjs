// Local source evidence only. Transport stop is never advertised as accounting completeness.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createOzonAccrualReadSession} from '../src/lib/ozon/finance-read-client.ts';
import {OzonReadError} from '../src/lib/ozon/read-client.ts';
const date=process.argv[2];if(process.argv.length!==3)throw new Error('Explicit YYYY-MM-DD date required');
try{
 const credentials={};for(const line of (await readFile('.env.ozon.local','utf8')).split(/\r?\n/)){const m=line.match(/^\s*(OZON_CLIENT_ID|OZON_API_KEY)\s*=\s*(.*)$/);if(m)credentials[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2')}
 const session=createOzonAccrualReadSession({clientId:credentials.OZON_CLIENT_ID??'',apiKey:credentials.OZON_API_KEY??'',date});
 const pages=[];let transportStopped=false;
 for(let index=0;index<3;index++){
  const page=await session.readNextPage();pages.push(page.accruals);
  if(page.empty||!page.lastId){transportStopped=true;break;}
 }
 await mkdir('.audit/ozon-finance',{recursive:true});
 await writeFile(`.audit/ozon-finance/${date}-${randomUUID()}.json`,JSON.stringify({date,pages,transportStopped,accountingComplete:false,localFixtureOnly:true,observedAt:new Date().toISOString()}));
 console.log(JSON.stringify({date,pagesFetched:pages.length,sourceRows:pages.reduce((n,page)=>n+page.length,0),transportStopped,accountingComplete:false,destination:'local source evidence',productionWrites:0}));
}catch(error){console.error(JSON.stringify(error instanceof OzonReadError?{stage:error.stage,endpoint:error.endpoint,httpStatus:error.httpStatus,reason:error.reason}:{reason:'local_accrual_capture_failed'}));process.exitCode=1}
