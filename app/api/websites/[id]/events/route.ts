import { builderDB } from '../../../../../lib/builder/server';
import { PAGE_KEYS } from '../../../../../lib/builder/model.ts';
import { boundedJSON,cors,publicFailure,publicLimit,publicSite,PublicError } from '../../../../../lib/builder/public-server';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function OPTIONS(request:Request,context:Context){
  try{const {origin}=await publicSite(request,(await context.params).id);return new Response(null,{status:204,headers:cors(origin)});}catch(error){return publicFailure(error);}
}
export async function POST(request:Request,context:Context){
  let origin:string|undefined;
  try{
    const id=(await context.params).id;origin=(await publicSite(request,id)).origin;
    if(request.headers.get('dnt')==='1')return new Response(null,{status:204,headers:cors(origin)});
    await publicLimit(request,id,'view',60);
    const body=await boundedJSON(request,1000);
    if(!PAGE_KEYS.includes(body.page as typeof PAGE_KEYS[number]))throw new PublicError('Unknown page.');
    const {error}=await builderDB().rpc('builder_count_view',{p_site:id,p_page:body.page});
    if(error)throw new PublicError('Analytics temporarily unavailable.',503);
    return new Response(null,{status:204,headers:cors(origin)});
  }catch(error){return publicFailure(error,origin);}
}
