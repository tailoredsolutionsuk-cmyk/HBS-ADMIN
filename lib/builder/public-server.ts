import { PublicError, secret } from './form-security.ts';
export { PublicError, formToken, verifyFormToken } from './form-security.ts';
import { createHmac } from 'node:crypto';
import { builderDB } from './server';
import { resourceName } from './providers.ts';
import { allowedOrigin } from './public-model.ts';

export async function publicSite(request:Request,id:string) {
  try{resourceName(id);}catch{throw new PublicError('Website not found.',404);}
  const {data,error}=await builderDB().from('builder_sites').select('id,name,client_id,live_url,published_revision,custom_domain,domain_verified').eq('id',id).maybeSingle();
  if(error) throw new PublicError('Website temporarily unavailable.',503);
  const origin=request.headers.get('origin');
  if(!data||data.published_revision===null||!allowedOrigin(origin,data.live_url,data.custom_domain,data.domain_verified)) throw new PublicError('This form is only available on its published website.',403);
  return {site:data,origin:origin!};
}
export function cors(origin:string) {
  return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','Vary':'Origin'};
}
export async function publicLimit(request:Request,id:string,action:string,limit:number) {
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const fingerprint=createHmac('sha256',secret()).update(`${Math.floor(Date.now()/86400000)}:${ip}`).digest('hex').slice(0,32);
  const db=builderDB();
  for(const [key,max] of [[`public:${id}:${action}:all`,limit*10],[`public:${id}:${action}:${fingerprint}`,limit]] as const) {
    const {data,error}=await db.rpc('builder_rate_limit',{p_key:key,p_limit:max,p_seconds:60});
    if(error) throw new PublicError('Service temporarily unavailable.',503);
    if(!data) throw new PublicError('Too many requests. Please wait a minute and try again.',429);
  }
}
export async function boundedJSON(request:Request,limit=10000):Promise<Record<string,unknown>> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new PublicError('Send JSON.',415);
  const reader=request.body?.getReader();if(!reader)throw new PublicError('Missing form.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new PublicError('Form is too large.',413);}chunks.push(value);}
  try{const data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw new PublicError('Invalid form.');}
}
export function publicFailure(error:unknown,origin?:string) {
  return Response.json({error:error instanceof PublicError?error.message:'Service temporarily unavailable. Please contact the business by email or phone.'},{status:error instanceof PublicError?error.status:503,headers:origin?cors(origin):{'Cache-Control':'no-store'}});
}
