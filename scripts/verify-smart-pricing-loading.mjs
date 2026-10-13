import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {withReadBudget,ReadBudgetExceeded} from '../src/lib/supabase/read-budget.ts';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';process.env.ORION_RLS_DATA_PLANE='0';
const today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
const product=(id,account='6')=>({id,marketplace_account_id:account,nm_id:100+Number(id),supplier_article:`SKU${id}`,name:`Product ${id}`,brand_id:'1',category_id:'1',brand:{id:'1',name:'Brand'},category:{id:'1',name:'Category'}});
const sale=(id,qty)=>({id,marketplace_account_id:'6',product_id:id,nm_id:100+Number(id),sale_date:yesterday,revenue:150,price_with_disc:200,for_pay:110,quantity:qty,is_return:false});
const sources={products:[product('1'),product('2'),product('3','2')],wb_sales:[sale('1',30),sale('2',15)],wb_orders:[{id:'1',marketplace_account_id:'6',product_id:'1',order_date:yesterday,quantity:31,status:'active'}],wb_ads:[],product_cost_history:[{id:'1',product_id:'1',cost:30,effective_from:'2026-01-01',effective_to:null,created_at:today},{id:'2',product_id:'2',cost:20,effective_from:'2026-01-01',effective_to:null,created_at:today}],marketplace_accounts_public:[{id:'6',marketplace:'wildberries'}],product_variants:[],wb_current_stocks:[{marketplace_account_id:'6',nm_id:101,chrt_id:1001,warehouse_key:'id:1',warehouse_id:1,warehouse_name:'WB',quantity:5,in_way_to_client:0,in_way_from_client:0,observed_at:today}],wb_finance:[...Array.from({length:5000},(_,i)=>({id:String(i+10),marketplace_account_id:'6',product_id:'1',operation_date:yesterday,amount:50,finance_category:'OTHER',operation_type:'other'})),{id:'1',marketplace_account_id:'6',product_id:'1',operation_date:yesterday,amount:30,finance_category:'LOGISTICS',operation_type:'logistics'},{id:'2',marketplace_account_id:'6',product_id:'1',operation_date:yesterday,amount:20,finance_category:null,source_key:'test:storage',operation_type:'storage'},{id:'3',marketplace_account_id:'6',product_id:null,operation_date:today,amount:0,finance_category:'OTHER',operation_type:'other'}]};
let calls=[],financeRows=0,fail=false,hang=false,aborts=0;const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=new URL(String(input instanceof Request?input.url:input)),table=url.pathname.split('/').at(-1);calls.push(url);
 if(hang){return new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>{aborts++;reject(init.signal.reason)},{once:true});});}
 if(fail&&table==='wb_finance')return Response.json({message:'unavailable'},{status:500});
 let rows=[...(sources[table]??[])];for(const [field,filter]of url.searchParams){if(filter.startsWith('eq.'))rows=rows.filter(r=>String(r[field])===filter.slice(3));if(filter.startsWith('neq.'))rows=rows.filter(r=>String(r[field])!==filter.slice(4));if(filter==='is.null')rows=rows.filter(r=>r[field]==null);if(filter.startsWith('gte.'))rows=rows.filter(r=>String(r[field])>=filter.slice(4));if(filter.startsWith('lte.'))rows=rows.filter(r=>String(r[field])<=filter.slice(4));if(filter.startsWith('in.')){const ids=filter.slice(4,-1).split(',');rows=rows.filter(r=>ids.includes(String(r[field])));}}
 if(url.searchParams.has('or'))rows=rows.filter(r=>r.finance_category==null||['LOGISTICS','RETURN_LOGISTICS','STORAGE'].includes(r.finance_category));
 const order=url.searchParams.get('order');if(order?.startsWith('operation_date.desc'))rows.sort((a,b)=>b.operation_date.localeCompare(a.operation_date));
 const total=rows.length,offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??1000);rows=rows.slice(offset,offset+limit);
 if(table==='wb_finance')financeRows+=rows.length;
 const select=url.searchParams.get('select');if(select&&!select.startsWith('*')){const keys=select.split(/,(?![^()]*\))/).map(k=>k.split(':')[0]);rows=rows.map(r=>Object.fromEntries(keys.map(k=>[k,r[k]])));}
 const single=(init?.headers instanceof Headers?init.headers.get('Accept'):init?.headers?.Accept)?.includes('object');
 return Response.json(single?rows[0]:rows,{headers:{'content-range':`${offset}-${offset+rows.length-1}/${total}`}});};
try{const {getSmartPricingInputs}=await import('../src/services/smart-pricing-service.ts');const scope={companyId:'3',marketplaceAccountId:'6',from:'2026-09-01',to:today};
 const result=await withReadBudget(()=>getSmartPricingInputs(scope),5000);assert.equal(result.length,2);assert.ok(result.every(r=>r.productId!=='3'));assert.equal(result[0].costAsOfDate,today,'zero latest fact must preserve date anchor');assert.equal(result[1].currentStock,0);assert.equal(result[1].hasSalesHistory,true);
 assert.ok(calls.filter(u=>u.pathname.endsWith('wb_finance')&&u.searchParams.get('select')!=='operation_date').every(u=>u.searchParams.get('amount')==='neq.0'&&u.searchParams.has('or')));
 const optimizedRows=financeRows;assert.ok(optimizedRows<20,'irrelevant money rows stay in DB');
 if(process.argv[2]){financeRows=0;const baseline=await import(pathToFileURL(process.argv[2]));const old=await baseline.getSmartPricingInputs(scope);assert.equal(old.length,1);assert.deepEqual(result[0],old[0],'every existing product cost/fee/commission replay and recommended input must stay identical');assert.ok(financeRows>5000);console.log(`PASS exact before/after pricing parity; Finance rows transferred ${financeRows} → ${optimizedRows}`);}
 fail=true;await assert.rejects(getSmartPricingInputs(scope),/wb_finance|anchor/);fail=false;
 hang=true;await assert.rejects(withReadBudget(()=>getSmartPricingInputs(scope),25),ReadBudgetExceeded);hang=false;assert.ok(aborts>0);
 await withReadBudget(()=>getSmartPricingInputs(scope),5000);
 console.log('PASS Smart Pricing: tenant isolation, date anchor, active zero-stock product, bounded cancellation/recovery, unchanged cost and commission inputs');
}finally{globalThis.fetch=originalFetch;}

// Root/layout stream failures must offer recovery without the failed router.
const React = await import('react');
globalThis.React = React;
const {renderToStaticMarkup} = await import('react-dom/server');
const {default: GlobalError} = await import('../src/app/global-error.tsx');
const tree = GlobalError();
const markup = renderToStaticMarkup(tree);
assert.match(markup, /<html/);
assert.match(markup, /<body/);
assert.match(markup, /Open dashboard/);
let reloads = 0;
let assignedPath = null;
const originalWindow = globalThis.window;
globalThis.window = {location:{reload(){reloads++;},assign(path){assignedPath=path;}}};
function visit(element){if(!element || typeof element !== 'object')return; if(element.type==='button')element.props.onClick(); for(const child of React.Children.toArray(element.props?.children))visit(child);}
try { visit(tree); assert.equal(reloads,1); assert.equal(assignedPath,'/'); } finally { globalThis.window=originalWindow; delete globalThis.React; }
console.log('PASS root-error recovery: standalone document, native dashboard navigation, full reload without router/providers');
