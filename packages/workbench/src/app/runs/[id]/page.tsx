import Link from 'next/link';
import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {Card,Message,SessionRequired} from '@/components/ui';
import {formatDateTime} from '@/lib/format';

export const dynamic='force-dynamic';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return <SessionRequired/>;
  if(!uuidPattern.test(id))return <main><h1>Run 详情</h1><Message kind="error">INVALID_ARGUMENT</Message></main>;
  try{
    const view=await createWorkbenchClient(session).runs.get(id),run=view.run;
    return <main><h1>{run.triggerKey}</h1>
      <Message kind="stale">强读 Run v{run.runRef.version}；时点 {formatDateTime(view.asOf)}。</Message>
      <div className="grid">
        <Card title="执行状态"><dl>
          <dt>状态</dt><dd>{run.status}</dd>
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
              <strong>{task.nodeKey}</strong> · {task.kind} · {task.status}
              <span> v{task.taskRef.version} · 第 {task.attemptOrdinal} 次 · {task.required?'必需':'可选'} · {formatDateTime(task.updatedAt)}</span>
            </li>
          ))}</ol>
        )}
      </Card>
      <div className="grid"><Card title="相关视图">
        <Link href={`/actions?missionId=${run.missionRef.id}`}>查看执行结果</Link>
      </Card></div>
    </main>;
  }catch(error){return <main><h1>Run 详情</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
