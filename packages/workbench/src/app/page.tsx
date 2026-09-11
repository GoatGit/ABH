import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {Message,SessionRequired} from '@/components/ui';
import {LiveOverview} from '@/components/LiveOverview';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

export default async function Overview(){
  const session=await currentSession();
  if(!session)return <SessionRequired/>;
  try{
    const client=createWorkbenchClient(session);
    const [missions,inbox]=await Promise.all([
      client.missions.list({}),
      client.decisions.listInbox({status:'Pending',limit:25}),
    ]);
    return <LiveOverview identity={{
      actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
      resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
      purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
    }} initialMissions={missions} initialInbox={inbox}
      staleSeconds={workbenchConfig.queryStaleSeconds}/>;
  }catch(error){return <main><h1>业务总览</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
