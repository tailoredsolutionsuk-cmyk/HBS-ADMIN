import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '../../../../lib/builder/jobs';
import { builderDB } from '../../../../lib/builder/server';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  const actual=Buffer.from(request.headers.get('authorization')||'');
  const expected=Buffer.from(`Bearer ${secret||''}`);
  if(!secret||secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected)) return new Response('Unauthorized',{status:401});
  try {
    await runJobs();
    // Retain aggregate analytics for one year; rate-limit identifiers at most two days.
    const db=builderDB();
    const cleanup=await db.from('builder_limits').delete().like('key','public:%').lt('bucket',Math.floor(Date.now()/1000/60)-2880);
    if(cleanup.error) throw new Error('Retention cleanup failed');
    const metrics=await db.from('builder_metrics').delete().lt('day',new Date(Date.now()-366*86400000).toISOString().slice(0,10));
    if(metrics.error) throw new Error('Metrics retention failed');
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Builder worker needs attention. Check saved job history.'},{status:503});}
}
