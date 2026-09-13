import Link from 'next/link';
import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {ActionForm} from '@/components/ActionForm';
import {CompensationSection} from '@/components/CompensationSection';
import {SessionRequired} from '@/components/ui';
import {Badge, Card, Message, PageHeader} from '@/components/primitives';
import {actionPositionLabel,canCancelAction} from '@/lib/action-view';
import {cancelActionAction} from '@/lib/actions';
import {formatDateTime} from '@/lib/format';
import {currentCompensationAdapter} from '@/lib/compensation-install';
import {LiveActionStatus} from '@/components/LiveActionStatus';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ActionPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return <SessionRequired/>;
  if(!uuidPattern.test(id))return <main><h1>执行详情</h1><Message kind="error">INVALID_ARGUMENT</Message></main>;
  try{
    const action=await createWorkbenchClient(session).actions.get(id,{consistency:'Strong'});
    const item=action.data,unknown=item.position.outcome==='Unknown';
    const compensationAvailable=item.position.lifecycle==='Closed'
      &&['Failed','PartiallySucceeded'].includes(item.position.outcome);
    const compensation=compensationAvailable
      ?await currentCompensationAdapter().resolve(session,{action:item}):null;
    return <main>
      <PageHeader eyebrow="执行" title={item.actionType}
        description={<>数据时点 {formatDateTime(action.meta.asOf)}；状态 {actionPositionLabel(item.position)}。</>}
        aside={<Badge status={item.position.lifecycle}>{item.position.lifecycle}</Badge>}/>
      {unknown?<Message kind="stale">外部结果待确认；不能据此创建新的普通写入意图。</Message>:null}
      <LiveActionStatus sseEnabled={workbenchConfig.sseEnabled} identity={{
        actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
        resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
        purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
      }} actionId={id} initial={action} staleSeconds={workbenchConfig.queryStaleSeconds}/>
      <div className="grid">
        <Card title="审批与生效">
          <dl>
            <dt>Action</dt><dd>{item.actionRef.id} v{item.actionRef.version}</dd>
            <dt>授权</dt><dd>{item.authorizationSummary.authorityRef?item.authorizationSummary.authorityRef.id:'暂不可见'}</dd>
            <dt>快照</dt><dd>{item.authorizationSummary.snapshotRef?item.authorizationSummary.snapshotRef.id:'暂不可见'}</dd>
            <dt>过期</dt><dd>{item.authorizationSummary.expiresAt?formatDateTime(item.authorizationSummary.expiresAt):'—'}</dd>
          </dl>
          <p>已授权表示可执行；生效必须以后续服务端状态或对账证据为准。</p>
        </Card>
        <Card title={`子项时间线（${item.operationSummary.length}）`}>
          {item.operationSummary.length===0?<Message kind="empty">尚无可见子操作。</Message>:(
            <ol>{item.operationSummary.map(operation=>(
              <li key={operation.operationRef.id}>
                <code>{operation.operationRef.id}</code> v{operation.operationRef.version} ·
                {' '}{operation.position.lifecycle} / {operation.position.outcome}
              </li>))}</ol>)}
        </Card>
        <Card title={`待确认引用（${item.unresolvedRefs.length}）`}>
          {item.unresolvedRefs.length===0?<Message kind="empty">没有待确认的外部状态。</Message>:(
            <ul>{item.unresolvedRefs.map(ref=>(
              <li key={`${ref.type}/${ref.id}`}><code>{ref.type}</code> {ref.id} v{ref.version}</li>))}</ul>)}
        </Card>
      </div>
      <div className="grid">
        {canCancelAction(item)?(
          <Card title="请求取消"><ActionForm action={cancelActionAction} confirm="取消也不回滚已发生的外部影响，是否继续？">
            <input type="hidden" name="actionId" value={id}/>
            <input type="hidden" name="version" value={item.actionRef.version}/>
            <label htmlFor="reason">取消理由</label>
            <textarea id="reason" name="reason" rows={4} required minLength={1} maxLength={2000}/>
            <p>同一理由与版本复用稳定幂等键；最终以服务端状态为准。</p>
          </ActionForm></Card>
        ):<Card title="可用操作"><Message kind="empty">当前服务端没有开放取消操作。</Message></Card>}
        <Card title="补偿">
          {compensation?<CompensationSection actionId={id} actionVersion={item.actionRef.version} template={compensation}/>:(
            <p>补偿必须作为新的明确业务意图提交；当前服务端没有开放注册补偿模板。</p>)}
          <Link href="/">返回总览</Link>
        </Card>
      </div>
    </main>;
  }catch(error){return <main><h1>执行详情</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
