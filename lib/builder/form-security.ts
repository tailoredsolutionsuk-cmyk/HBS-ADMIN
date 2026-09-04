import { createHmac, timingSafeEqual } from 'node:crypto';
export class PublicError extends Error { status:number; constructor(message:string, status=400){super(message);this.status=status;} }
export function secret() {
  const value=process.env.BUILDER_FORM_SECRET;
  if(!value||value.length<32) throw new PublicError('This form is not configured yet. Please contact the business by email or phone.',503);
  return value;
}
export function formToken(id:string,origin:string,now=Date.now()) {
  const payload=Buffer.from(JSON.stringify({id,origin,at:now,nonce:crypto.randomUUID()})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret()).update(payload).digest('base64url')}`;
}
export function verifyFormToken(token:unknown,id:string,origin:string,now=Date.now()) {
  if(typeof token!=='string'||token.length>1500) throw new PublicError('Reload the contact form before sending.');
  const [payload,signature,...extra]=token.split('.');
  const expected=createHmac('sha256',secret()).update(payload).digest();
  const actual=Buffer.from(signature||'','base64url');
  if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new PublicError('Reload the contact form before sending.');
  let data;try{data=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new PublicError('Invalid form token.');}
  if(data.id!==id||data.origin!==origin||!Number.isFinite(data.at)||now-data.at<2500||now-data.at>3600000) throw new PublicError('Please reload the form, then wait a moment before sending.');
}
