import {currentSession} from '@/lib/session';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subjects=new Set(['abh.mission','abh.decision','abh.action','abh.run','abh.organization']);

export async function GET(request:Request,{params}:{params:Promise<{type:string;id:string}>}){
  const {type,id}=await params,session=await currentSession();
  if(!session)return unavailable('UNAUTHENTICATED',401);
  if(!subjects.has(type)||!uuidPattern.test(id)||!workbenchConfig.apiUrl)return unavailable('INVALID_ARGUMENT',400);
  if(workbenchConfig.sseEnabled===false)return unavailable('SSE_DISABLED',404);
  const lastEventId=request.headers.get('last-event-id')
    ??new URL(request.url).searchParams.get('lastEventId');
  const headers=new Headers(await session.apiHeaders(request.signal));
  headers.set('accept','text/event-stream');
  headers.delete('cookie');
  if(lastEventId&&lastEventId.length<=64)headers.set('last-event-id',lastEventId);
  try{
    const upstream=await fetch(new URL(`/v1/events/${type}/${id}`,workbenchConfig.apiUrl),{
      headers,signal:request.signal,redirect:'error',cache:'no-store',
    });
    const contentType=upstream.headers.get('content-type')??'';
    if(!upstream.ok||!contentType.startsWith('text/event-stream')){
      void upstream.body?.cancel().catch(()=>{});
      return unavailable('UNAVAILABLE',upstream.status===401?401:502);
    }
    return new Response(upstream.body,{
      status:200,
      headers:{
        'content-type':'text/event-stream',
        'cache-control':'no-cache, no-store, no-transform',
        'x-accel-buffering':'no',
      },
    });
  }catch(error){
    if(request.signal.aborted)return new Response(null,{status:499});
    console.error('projection event proxy failed',error);
    return unavailable('UNAVAILABLE',502);
  }
}

function unavailable(error:string,status:number):Response{
  return Response.json({error},{status,headers:{'cache-control':'no-store'}});
}
