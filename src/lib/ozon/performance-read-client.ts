import { OzonReadError } from './read-client';

/** Performance credentials are separate from Seller API. No campaign/budget mutation methods exist here. */
export function createOzonPerformanceReadClient(input:{clientId:string;clientSecret:string;fetch?:typeof fetch;now?:()=>number}) {
  if(typeof window!=='undefined'||!input.clientId.trim()||!input.clientSecret.trim()||/[\r\n]/.test(input.clientId+input.clientSecret)) throw new OzonReadError('configuration',null,null,'invalid_performance_credentials');
  const clientId=input.clientId.trim(),clientSecret=input.clientSecret.trim(),fetcher=input.fetch??fetch,now=input.now??Date.now;
  let token:string|null=null,expiresAt=0;
  const origin='https://api-performance.ozon.ru';
  return Object.freeze({
    async captureReport(kind:'daily'|'expense',from:string,to:string) {
      const first=Date.parse(`${from}T00:00:00Z`),last=Date.parse(`${to}T00:00:00Z`);
      if(!['daily','expense'].includes(kind)||!Number.isFinite(first)||!Number.isFinite(last)||
        new Date(first).toISOString().slice(0,10)!==from||new Date(last).toISOString().slice(0,10)!==to||last<first||last-first>30*86400000) throw new OzonReadError('configuration',null,null,'invalid_performance_window');
      const observedAt=new Date(now()).toISOString();
      if(!token||now()>=expiresAt) {
        let response:Response;
        try {response=await fetcher(origin+'/api/client/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})});}
        catch {throw new OzonReadError('request','/api/client/token',null,'transport_failed')}
        if(!response.ok) throw new OzonReadError('request','/api/client/token',response.status,'http_error');
        let value:unknown;try{value=await response.json()}catch{throw new OzonReadError('response','/api/client/token',response.status,'invalid_token_response')}
        const parsed=value as {access_token?:unknown;token_type?:unknown;expires_in?:unknown};
        if(!parsed||typeof parsed.access_token!=='string'||!parsed.access_token||/[\r\n]/.test(parsed.access_token)||parsed.token_type!=='Bearer'||typeof parsed.expires_in!=='number'||!Number.isSafeInteger(parsed.expires_in)||parsed.expires_in<60||parsed.expires_in>86400) throw new OzonReadError('response','/api/client/token',response.status,'invalid_token_response');
        token=parsed.access_token;expiresAt=now()+(parsed.expires_in-30)*1000;
      }
      const endpoint=`/api/client/statistics/${kind}/json`,query=new URLSearchParams({dateFrom:from,dateTo:to});
      let response:Response;
      try{response=await fetcher(`${origin}${endpoint}?${query}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Accept':'application/json'}})}
      catch{throw new OzonReadError('request',endpoint,null,'transport_failed')}
      if(!response.ok){if(response.status===401){token=null;expiresAt=0}throw new OzonReadError('request',endpoint,response.status,'http_error')}
      const report=await response.text();if(report.length>2*1024*1024) throw new OzonReadError('response',endpoint,response.status,'performance_report_budget_exhausted');
      // Official schema provides no report row envelope: preserve for account-scoped contract verification.
      // Never sum this attributed spend with already-booked Seller finance advertising.
      return {kind,from,to,observedAt,report,accountingComplete:false as const};
    },
  });
}
