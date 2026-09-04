import { builderDB } from '../../../../../lib/builder/server';
import { parseEnquiry } from '../../../../../lib/builder/public-model.ts';
import { boundedJSON,cors,formToken,publicFailure,publicLimit,publicSite,PublicError,verifyFormToken } from '../../../../../lib/builder/public-server';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function OPTIONS(request:Request,context:Context){
  try{const {origin}=await publicSite(request,(await context.params).id);return new Response(null,{status:204,headers:cors(origin)});}catch(error){return publicFailure(error);}
}
export async function GET(request:Request,context:Context){
  let origin:string|undefined;
  try{const id=(await context.params).id;const site=await publicSite(request,id);origin=site.origin;await publicLimit(request,id,'challenge',10);return Response.json({token:formToken(id,origin)},{headers:cors(origin)});}catch(error){return publicFailure(error,origin);}
}
export async function POST(request:Request,context:Context){
  let origin:string|undefined;
  try{
    const id=(await context.params).id;const contextSite=await publicSite(request,id);origin=contextSite.origin;
    await publicLimit(request,id,'enquiry',5);
    const body=await boundedJSON(request);verifyFormToken(body.token,id,origin);
    if(body.company_website) return Response.json({ok:true},{headers:cors(origin)});
    let enquiry;try{enquiry=parseEnquiry(body);}catch(error){throw new PublicError((error as Error).message);}
    const {error}=await builderDB().from('leads').insert({
      name:enquiry.name,contact_name:enquiry.name,email:enquiry.email,phone:enquiry.phone,
      business_name:contextSite.site.name,help_needed:enquiry.message,status:'New',
      source:`Website: ${contextSite.site.name}`.slice(0,200),
      builder_site_id:id,builder_client_id:contextSite.site.client_id,builder_submission_id:enquiry.submissionId,
      landing_page:`${origin}/contact.html`,next_action:'Respond to website enquiry',
    });
    if(error&&error.code!=='23505')throw new PublicError('Your enquiry could not be saved. Please try again or use email/phone.',503);
    return Response.json({ok:true},{headers:cors(origin)});
  }catch(error){return publicFailure(error,origin);}
}
