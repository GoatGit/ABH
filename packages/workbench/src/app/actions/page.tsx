import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {LiveActionList} from '@/components/LiveActionList';
import {Message,SessionRequired} from '@/components/ui';
import {lifecycleLabels} from '@/lib/action-view';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

const lifecycles=['Proposed','Validated','Authorized','Executing','Reconciling','Closed','Rejected','Expired','Cancelled'] as const;
const outcomes=['NotStarted','Pending','Unknown','Succeeded','PartiallySucceeded','Failed'] as const;

type SearchParams=Record<string,string|string[]|undefined>;

function one(value:string|string[]|undefined):string|undefined{
  const item=Array.isArray(value)?value[0]:value;
  return typeof item==='string'&&item.length>0?item:undefined;
}

function uuid(value:string):string|undefined{
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:undefined;
}

export default async function ActionsPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const params=await searchParams,session=await currentSession();
  if(!session)return <SessionRequired/>;
  const missionIdRaw=one(params.missionId),missionId=missionIdRaw?uuid(missionIdRaw):undefined;
  const lifecycleRaw=one(params.lifecycle),lifecycle=lifecycles.find(item=>item===lifecycleRaw);
  const outcomeRaw=one(params.outcome),outcome=outcomes.find(item=>item===outcomeRaw);
  const cursor=one(params.cursor);
  try{
    const actions=await createWorkbenchClient(session).actions.list({
      ...(missionId?{missionId}:{}),...(lifecycle?{lifecycle}:{}),...(outcome?{outcome}:{}),
      ...(cursor?{cursor}:{}),limit:25,consistency:'Strong',
    });
    const identity={
      actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
      resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
      purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
    };
    return <main><h1>执行结果</h1>
      <form className="action-form" method="get">
        <label htmlFor="missionId">Mission ID（可选）</label>
        <input id="missionId" name="missionId" type="text" defaultValue={missionId??''} inputMode="numeric"/>
        <label htmlFor="lifecycle">阶段</label>
        <select id="lifecycle" name="lifecycle" defaultValue={lifecycle??''}>
          <option value="">全部</option>
          {lifecycles.map(item=><option key={item} value={item}>{lifecycleLabels[item]}</option>)}
        </select>
        <label htmlFor="outcome">结果</label>
        <select id="outcome" name="outcome" defaultValue={outcome??''}>
          <option value="">全部</option>
          {outcomes.map(item=><option key={item} value={item}>{item}</option>)}
        </select>
        <button type="submit">筛选</button>
      </form>
      <LiveActionList identity={identity} initial={actions}
        staleSeconds={workbenchConfig.queryStaleSeconds}
        filters={{...(missionId?{missionId}:{}),...(lifecycle?{lifecycle}:{}),
          ...(outcome?{outcome}:{}),...(cursor?{cursor}:{})}}/>
    </main>;
  }catch(error){return <main><h1>执行结果</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
