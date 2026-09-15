import type {Metadata} from 'next';
import {cache} from 'react';
import Link from 'next/link';
import type {WorkbenchSession} from '@/lib/identity';
import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {SessionRequired} from '@/components/ui';
import {Badge, Card, Message, PageHeader} from '@/components/primitives';
import {ActionForm} from '@/components/ActionForm';
import {LiveRunStatus} from '@/components/LiveRunStatus';
import {cancelRunAction} from '@/lib/actions';
import {formatDateTime} from '@/lib/format';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadRun=cache(async(session:WorkbenchSession,id:string)=>createWorkbenchClient(session).runs.get(id));

async function runTitle(session:WorkbenchSession,id:string):Promise<string>{
  if(!uuidPattern.test(id))return 'Run 详情';
  try{return (await loadRun(session,id)).run.triggerKey;}
  catch{return 'Run 详情';}
}

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
  const {id}=await params,session=await currentSession();
  if(!session)return {title:'Run 详情'};
  return {title:await runTitle(session,id)};
}

export default async function RunPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return <SessionRequired/>;
  if(!uuidPattern.test(id))return <main><h1>Run 详情</h1><Message kind="error">INVALID_ARGUMENT</Message></main>;
  try{
    const view=await loadRun(session,id),run=view.run;
    return <main>
      <PageHeader eyebrow="Run" title={run.triggerKey}
        description={<>当前强读 Run v{run.runRef.version}；时点 {formatDateTime(view.asOf)}。</>}
        aside={<Badge status={run.status}>{run.status}</Badge>}/>
      <LiveRunStatus sseEnabled={workbenchConfig.sseEnabled!==false} identity={{
        actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
        resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
        purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
      }} runId={run.runRef.id} initial={view} staleSeconds={workbenchConfig.queryStaleSeconds}/>
      <div className="grid">
        <Card title="执行状态"><dl>
          <dt>状态</dt><dd><Badge status={run.status}>{run.status}</Badge></dd>
          <dt>执行模式</dt><dd>{run.executionMode}</dd>
          <dt>目标修订</dt><dd>{run.goalRevision}</dd>
          <dt>停止代次</dt><dd>{run.stopEpoch}</dd>
          <dt>创建</dt><dd>{formatDateTime(run.createdAt)}</dd>
          <dt>更新</dt><dd>{formatDateTime(run.updatedAt)}</dd>
        </dl></Card>
        <Card title="来源"><dl>
          <dt>Mission</dt><dd><Link href={`/missions/${run.missionRef.id}`}>{run.missionRef.id} v{run.missionRef.version}</Link></dd>
          <dt>Workflow</dt><dd>{run.workflowRef.id} · {run.workflowRef.version}</dd>
          <dt>Assignment</dt><dd>{run.assignmentSnapshotRef.type} {run.assignmentSnapshotRef.id} v{run.assignmentSnapshotRef.version}</dd>
        </dl></Card>
      </div>
      <Card title={`任务（${view.tasks.length}）`}>
        {view.tasks.length===0?<Message kind="empty">当前强读没有可见任务。</Message>:(
          <ol aria-label="Run 任务列表">{view.tasks.map(task=>(
            <li key={task.taskRef.id}>
              <strong>{task.nodeKey}</strong> · {task.kind} · <Badge>{task.status}</Badge>
              <span> v{task.taskRef.version} · 第 {task.attemptOrdinal} 次 · {task.required?'必需':'可选'} · {formatDateTime(task.updatedAt)}</span>
            </li>
          ))}</ol>
        )}
      </Card>
      {['Running','Waiting','Paused'].includes(run.status)?(
        <Card title="取消 Run"><ActionForm action={cancelRunAction}
          confirm="取消不回滚已发生的外部影响，是否继续？">
          <input type="hidden" name="runId" value={id}/>
          <input type="hidden" name="version" value={run.runRef.version}/>
          <label htmlFor="run-cancel-reason">Run 取消理由</label>
          <textarea id="run-cancel-reason" name="reason" rows={4} required minLength={1} maxLength={2000}/>
          <p>同一理由与版本生成稳定幂等键；任务清理以服务端确认为准。</p>
        </ActionForm></Card>
      ):null}
      <div className="grid"><Card title="相关视图">
        <Link href={`/actions?missionId=${run.missionRef.id}`}>查看执行结果</Link>
      </Card></div>
    </main>;
  }catch(error){return <main><h1>Run 详情</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
