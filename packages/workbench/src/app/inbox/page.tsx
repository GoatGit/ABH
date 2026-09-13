import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {LiveInbox} from '@/components/LiveInbox';
import {SessionRequired} from '@/components/ui';
import {Message} from '@/components/primitives';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

export default async function InboxPage(){
  const session=await currentSession();
  if(!session)return <SessionRequired/>;
  try{
    const inbox=await createWorkbenchClient(session).decisions.listInbox({status:'Pending',limit:25});
    const identity={
      actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
      resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
      purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
    };
    return <LiveInbox identity={identity} initial={inbox}
      staleSeconds={workbenchConfig.queryStaleSeconds}/>;
  }catch(error){return <main><h1>待办与审批</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
