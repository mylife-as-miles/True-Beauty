import Fastify from 'fastify';
import {setGlobalProxyFromEnv} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {registerMerchantRoutes} from '../../../apps/api/src/merchant';
import {MERCHANT_SOURCES} from '../../../packages/commerce-engine/src/merchant';
setGlobalProxyFromEnv();
const requests:Array<{url:string;status:number;at:string}>=[];
const realFetch:typeof fetch=async(input,init)=>{const response=await fetch(input,init);requests.push({url:String(input),status:response.status,at:new Date().toISOString()});return response;};
const app=Fastify();registerMerchantRoutes(app,{fetcher:realFetch});
const observations=[];
for(const source of MERCHANT_SOURCES)for(const reference of source.references){const result=await app.inject({method:'POST',url:'/api/merchants/refresh',payload:{sourceId:source.id,referenceId:reference.id}});observations.push({httpStatus:result.statusCode,result:result.json()});}
const evidence={kind:'real-outbound-public-HTTP-contract',recordedAt:new Date().toISOString(),note:'Route invoked in-process with Fastify inject. The fetch wrapper calls real native fetch through inherited proxy; no merchant response is mocked. These observations do not establish checkout, shipping, a partnership or lasting availability.',requests,observations};
await writeFile('cook/evidence/merchant-r06/live-contract.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await app.close();
