import { OzonReadError } from './read-client';
import { parseOzonSourceJson } from './source-json';
export type OzonPostingScheme='fbo'|'fbs';
export type OzonPostingEvidence={posting_number:string;order_id:string;order_number:string;status:string;substatus:string|null;created_at:string|null;in_process_at:string|null;products:Record<string,unknown>[]};
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown)=>typeof value==='string'&&/^[1-9]\d*$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):null;
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;

/** Privacy allowlist. Fulfillment evidence only; delivered status is not recognized Finance revenue. */
export function projectOzonPosting(raw:unknown):OzonPostingEvidence {
  if(!record(raw)||typeof raw.posting_number!=='string'||!raw.posting_number.trim()||!id(raw.order_id)||typeof raw.order_number!=='string'||
    typeof raw.status!=='string'||!raw.status||!Array.isArray(raw.products))throw new Error('ozon_posting_identity_invalid');
  const products=raw.products.map(product=>{
    if(!record(product)||!id(product.sku)||typeof product.offer_id!=='string'||typeof product.quantity!=='number'||!Number.isSafeInteger(product.quantity)||product.quantity<=0)throw new Error('ozon_posting_product_invalid');
    const output:Record<string,unknown>={sku:id(product.sku),offer_id:product.offer_id,quantity:product.quantity};
    if(typeof product.name==='string')output.name=product.name;
    if(record(product.price)) {
      if(typeof product.price.amount!=='string'||!/^\d+(?:\.\d+)?$/.test(product.price.amount)||typeof product.price.currency!=='string')throw new Error('ozon_posting_price_invalid');
      output.price={amount:product.price.amount,currency:product.price.currency};
    } else if(product.price!=null)throw new Error('ozon_posting_price_invalid');
    return output;
  });
  return {posting_number:raw.posting_number.trim(),order_id:id(raw.order_id)!,order_number:raw.order_number,status:raw.status,
    substatus:typeof raw.substatus==='string'?raw.substatus:null,created_at:date(raw.created_at),in_process_at:date(raw.in_process_at),products};
}

/** Official current versions: FBO v3 / FBS v4; explicit has_next completion, no legacy offsets. */
export function createOzonPostingReadClient(input:{clientId:string;apiKey:string;fetch?:typeof fetch;now?:()=>number}) {
  if(typeof window!=='undefined'||!input.clientId.trim()||!input.apiKey.trim()||/[\r\n]/.test(input.clientId+input.apiKey))throw new OzonReadError('configuration',null,null,'invalid_credentials');
  const clientId=input.clientId.trim(),apiKey=input.apiKey.trim();
  const request=input.fetch??fetch;
  return {async capture(scheme:OzonPostingScheme,from:string,to:string,maxPages=5){
    const endpoint=scheme==='fbo'?'/v3/posting/fbo/list':scheme==='fbs'?'/v4/posting/fbs/list':null;
    const start=Date.parse(from),end=Date.parse(to);
    if(!endpoint||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>366*86400000||!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw new OzonReadError('configuration',endpoint,null,'invalid_posting_window');
    // Date the source observation at capture start, not completion, so slower older work cannot win.
    const observedAt=new Date((input.now??Date.now)()).toISOString();
    let cursor='';const cursors=new Set<string>(),seen=new Set<string>(),postings:OzonPostingEvidence[]=[];
    for(let page=0;page<maxPages;page++){
      let response:Response;
      try{response=await request(`https://api-seller.ozon.ru${endpoint}`,{method:'POST',headers:{'Client-Id':clientId,'Api-Key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({cursor,filter:{since:from,to},limit:100,sort_dir:'ASC',with:{analytics_data:false,financial_data:false,legal_info:false}}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new OzonReadError('request',endpoint,null,'transport_failed')}
      if(!response.ok)throw new OzonReadError('request',endpoint,response.status,'http_error');
      let raw:unknown;try{raw=parseOzonSourceJson(await response.text())}catch{throw new OzonReadError('response',endpoint,response.status,'invalid_json')}
      if(!record(raw)||typeof raw.has_next!=='boolean'||typeof raw.cursor!=='string'||!Array.isArray(raw.postings)||raw.postings.length>100)throw new OzonReadError('response',endpoint,response.status,'invalid_posting_page');
      for(const item of raw.postings){let posting:OzonPostingEvidence;try{posting=projectOzonPosting(item)}catch{throw new OzonReadError('response',endpoint,response.status,'invalid_posting_evidence')}
        if(seen.has(posting.posting_number))throw new OzonReadError('response',endpoint,response.status,'duplicate_posting');seen.add(posting.posting_number);postings.push(posting);}
      if(!raw.has_next)return {scheme,from,to,postings,pagesFetched:page+1,complete:true as const,observedAt};
      if(!raw.postings.length||!raw.cursor||raw.cursor===cursor||cursors.has(raw.cursor))throw new OzonReadError('response',endpoint,response.status,'posting_cursor_not_advancing');
      cursor=raw.cursor;cursors.add(cursor);
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new OzonReadError('response',endpoint,null,'posting_page_budget_exhausted');
  }};
}
