import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return Response.json({error:'UNAUTHENTICATED'},{status:401,headers:privateHeaders()});
  if(!uuidPattern.test(id))return Response.json({error:'INVALID_ARGUMENT'},{status:400,headers:privateHeaders()});
  try{
    const result=await createWorkbenchClient(session).decisions.get({id,consistency:'Strong'},{
      signal:request.signal,
    });
    return Response.json(result,{headers:privateHeaders()});
  }catch(error){
    return Response.json({error:errorText(error)},{status:502,headers:privateHeaders()});
  }
}

function privateHeaders():HeadersInit{
  return {'cache-control':'no-store','x-content-type-options':'nosniff'};
}
