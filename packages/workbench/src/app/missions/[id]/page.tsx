import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import Link from 'next/link';
import {Card,Message,SessionRequired} from '@/components/ui';
import {ActionForm} from '@/components/ActionForm';
import {cancelMissionAction,pauseMissionAction,resumeMissionAction} from '@/lib/actions';
import {LiveMissionProjection} from '@/components/LiveMissionProjection';
import {missionProjectionFieldSet} from '@/lib/query-keys';
import {workbenchConfig} from '@/lib/config';
import {formatDateTime} from '@/lib/format';

export const dynamic='force-dynamic';

export default async function MissionPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return <SessionRequired/>;
  try{
    const client=createWorkbenchClient(session);
    const [view,projection,runs]=await Promise.all([
      client.missions.get(id),
      client.projections.get(id,{type:'abh.projection.mission-summary',
        id,fieldSet:missionProjectionFieldSet}),
      client.runs.list({missionId:id,limit:25}),
    ]);
    const mission=view.mission;
    return <main><h1>{mission.domainType}</h1>
      <Message kind="stale">强读版本 {mission.missionRef.version}；投影版本 {projection.projection.subjectRef.version}，时点 {formatDateTime(view.asOf)}。</Message>
      <div className="grid">
        <Card title="状态"><dl><dt>生命周期</dt><dd>{mission.status}</dd>
          <dt>目标修订</dt><dd>{mission.goalRevision}</dd><dt>停止代次</dt><dd>{mission.stopEpoch}</dd>
          <dt>待处理触发</dt><dd>{view.pendingTriggers.length}</dd>
          <dt>阻塞</dt><dd>{view.blockers.length}</dd></dl></Card>
        <LiveMissionProjection identity={{
          actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
          resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
          purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
        }} missionId={id} initial={projection} staleSeconds={workbenchConfig.queryStaleSeconds}
          sseEnabled={workbenchConfig.sseEnabled}/>
      </div>
      <div className="grid">
        <Card title="Run 历史"><dl aria-label="Mission Run 历史">
          {runs.runs.length===0?<div><dt>记录</dt><dd>暂无 Run。</dd></div>:runs.runs.map(run=>(
            <div key={run.runRef.id}>
              <dt><Link href={`/runs/${run.runRef.id}`}>{run.triggerKey} · 版本 {run.runRef.version}</Link></dt>
              <dd>{run.status} · {run.executionMode} · {formatDateTime(run.updatedAt)}</dd>
            </div>
          ))}
        </dl><p className="message stale">显示最近 25 条；数据时点 {formatDateTime(runs.asOf)}。</p></Card>
        {mission.status==='Active'?<Card title="暂停"><ActionForm action={pauseMissionAction} confirm="暂停后进行中的自动化将停止？">
          <input type="hidden" name="missionId" value={id}/><input type="hidden" name="version" value={mission.missionRef.version}/>
        </ActionForm></Card>:null}
        {mission.status==='Paused'?<Card title="恢复"><ActionForm action={resumeMissionAction}>
          <input type="hidden" name="missionId" value={id}/><input type="hidden" name="version" value={mission.missionRef.version}/>
        </ActionForm></Card>:null}
        {['Draft','Active','Paused','Blocked'].includes(mission.status)?(
          <Card title="取消项目"><ActionForm action={cancelMissionAction}
            confirm="取消不回滚已发生的外部影响，是否继续？">
            <input type="hidden" name="missionId" value={id}/>
            <input type="hidden" name="version" value={mission.missionRef.version}/>
            <label htmlFor="mission-cancel-reason">取消理由</label>
            <textarea id="mission-cancel-reason" name="reason" rows={4} required
              minLength={1} maxLength={2000}/>
            <p>同一理由与版本复用稳定幂等键；清理状态以服务端确认为准。</p>
          </ActionForm></Card>
        ):null}
        <Card title="执行"><Link href={`/actions?missionId=${id}`}>查看该项目执行结果</Link></Card>
      </div>
    </main>;
  }catch(error){return <main><h1>Mission Detail</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
