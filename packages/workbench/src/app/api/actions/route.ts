import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lifecycles=['Proposed','Validated','Authorized','Executing','Reconciling',
  'Closed','Rejected','Expired','Cancelled'] as const;
const outcomes=['NotStarted','Pending','Unknown','Succeeded','PartiallySucceeded','Failed'] as const;

function selectedValue<T extends readonly string[]>(values:T,value?:string):T[number]|undefined{
  return value!==undefined&&values.includes(value)?value as T[number]:undefined;
}

function boundedCursor(value:string):boolean{
  return /^[A-Za-z0-9._:~-]{1,256}$/.test(value);
}

export async function GET(request:Request):Promise<Response>{
  const session=await currentSession();
  if(!session)return Response.json({error:'UNAUTHENTICATED'},{status:401,headers:privateHeaders()});
  const query=new URL(request.url).searchParams;
  const missionId=query.get('missionId')??undefined;
  const lifecycle=query.get('lifecycle')??undefined;
  const outcome=query.get('outcome')??undefined;
  const cursor=query.get('cursor')??undefined;
  const selectedLifecycle=selectedValue(lifecycles,lifecycle);
  const selectedOutcome=selectedValue(outcomes,outcome);
  if((missionId!==undefined&&!uuidPattern.test(missionId))
    ||(lifecycle!==undefined&&!selectedLifecycle)
    ||(outcome!==undefined&&!selectedOutcome)
    ||(cursor!==undefined&&!boundedCursor(cursor))
    ||query.size>4)return Response.json({error:'INVALID_ARGUMENT'},
      {status:400,headers:privateHeaders()});
  try{
    const result=await createWorkbenchClient(session).actions.list({
      ...(missionId?{missionId}:{}),...(selectedLifecycle?{lifecycle:selectedLifecycle}:{}),
      ...(selectedOutcome?{outcome:selectedOutcome}:{}),...(cursor?{cursor}:{}),
      limit:25,consistency:'Strong',
    },{signal:request.signal});
    return Response.json(result,{headers:privateHeaders()});
  }catch(error){
    return Response.json({error:errorText(error)},{status:502,headers:privateHeaders()});
  }
}

function privateHeaders():HeadersInit{
  return {'cache-control':'no-store','x-content-type-options':'nosniff'};
}
