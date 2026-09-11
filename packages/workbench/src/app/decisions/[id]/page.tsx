import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {Card,Message,SessionRequired} from '@/components/ui';
import {DecisionFormsSection} from '@/components/DecisionFormsSection';
import {currentDecisionFormsAdapter} from '@/lib/decision-forms';
import {validateDecisionFormTemplate} from '@/lib/decision-forms-validation';
import {formatDateTime,formatImpact} from '@/lib/format';
import {LiveDecisionStatus} from '@/components/LiveDecisionStatus';
import {workbenchConfig} from '@/lib/config';

export const dynamic='force-dynamic';

export default async function DecisionPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,session=await currentSession();
  if(!session)return <SessionRequired/>;
  try{
    const decision=await createWorkbenchClient(session).decisions.get({id,consistency:'Strong'});
    const item=decision.data,alternatives=item.package.alternatives.join('、')||'无';
    const resolvedForms=item.status==='Pending'
      ?await currentDecisionFormsAdapter().resolve({session,decision:item})
      :[];
    const seenForms=new Set<string>();
    const forms=(resolvedForms??[]).filter(form=>validateDecisionFormTemplate(form)
      &&item.package.allowedResponses.includes(form.response)
      &&!seenForms.has(`${form.response}/${form.key}`)
      &&(seenForms.add(`${form.response}/${form.key}`),true));
    const identity={
      actorId:session.actorId,actingOrganizationId:session.actingOrganizationId,
      resourceOrganizationId:session.resourceOrganizationId,workspaceId:session.workspaceId,
      purposeOfUse:session.purposeOfUse,authorizationDigest:session.authorizationDigest,
    };
    return <main><h1>{item.package.question}</h1>
      <Message kind="stale">数据时点 {formatDateTime(decision.meta.asOf)}；当前状态 {item.status}。</Message>
      <LiveDecisionStatus identity={identity} decisionId={id} initial={decision}
        staleSeconds={workbenchConfig.queryStaleSeconds} sseEnabled={workbenchConfig.sseEnabled}/>
      <div className="grid">
        <Card title="推荐与备选"><dl><dt>推荐</dt><dd>{item.package.recommendation}</dd>
          <dt>备选</dt><dd>{alternatives}</dd></dl></Card>
        <Card title="影响与风险"><p>{formatImpact(item.package.impactUpperBound)}</p>
          {item.package.risks.length===0?<Message kind="empty">无额外风险摘要。</Message>:(
            <ul>{item.package.risks.map(risk=><li key={risk}>{risk}</li>)}</ul>)}</Card>
        <Card title="证据"><ul>{item.package.evidenceRefs.map(ref=>(
          <li key={`${ref.type}/${ref.id}`}><code>{ref.type}</code> {ref.id} v{ref.version}</li>))}</ul></Card>
      </div>
      {item.status==='Pending'?(
        <Card title="责任决定">
          {forms.length===0?<Message kind="empty">当前服务端没有开放责任表单。</Message>:(
            <DecisionFormsSection decisionId={id} decisionVersion={item.decisionRef.version}
              packageDigest={item.package.packageDigest} forms={forms}/>)}
          <p>提交使用稳定幂等键、冻结 Package 摘要与 If-Match；双击不会创建第二个意图。</p>
        </Card>
      ):<Message kind="empty">该决定已完成，可从总览查看后续结果。</Message>}
    </main>;
  }catch(error){return <main><h1>Decision Detail</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
