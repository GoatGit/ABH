import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request):Promise<Response>{
  const session=await currentSession();
  if(!session)return boundedError('UNAUTHENTICATED',401);
  try{
    const result=await createWorkbenchClient(session).decisions.listInbox(
      {status:'Pending',limit:25},{signal:request.signal});
    return Response.json(result,{headers:privateHeaders()});
  }catch(error){
    return boundedError(errorText(error),502);
  }
}

function privateHeaders():HeadersInit{
  return {'cache-control':'no-store','x-content-type-options':'nosniff'};
}

function boundedError(error:string,status:number):Response{
  return Response.json({error},{status,headers:privateHeaders()});
}
