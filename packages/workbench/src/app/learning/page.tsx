import {currentSession} from '@/lib/session';
import {createWorkbenchClient,errorText} from '@/lib/client';
import {formatDateTime} from '@/lib/format';
import {SessionRequired} from '@/components/ui';
import {Message, PageHeader} from '@/components/primitives';
import {ActionForm} from '@/components/ActionForm';
import {pauseAssignmentAction,releaseLearningCandidateAction,rollbackAssignmentAction,requestEvaluationAction,retryEvaluationAction} from '@/lib/actions';

export const dynamic='force-dynamic';

type SearchParams=Record<string,string|string[]|undefined>;

function one(value:string|string[]|undefined):string|undefined{
  const item=Array.isArray(value)?value[0]:value;
  return typeof item==='string'&&item.length>0?item:undefined;
}

function uuid(value:string|undefined):string|undefined{
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:undefined;
}

export default async function LearningPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const params=await searchParams,session=await currentSession();
  if(!session)return <SessionRequired/>;
  const candidateIdRaw=one(params.candidateId),runStatusRaw=one(params.runStatus);
  const candidateId=uuid(candidateIdRaw);
  const runStatus=['Queued','Completed','Inconclusive'].find(item=>item===runStatusRaw) as
    'Queued'|'Completed'|'Inconclusive'|undefined;
  const cursor=one(params.cursor);
  try{
    const client=createWorkbenchClient(session);
    const [candidates,runs,gates,assignments]=await Promise.all([
      client.learning.listCandidates({limit:25}),
      client.learning.listEvaluationRuns({
        ...(candidateId?{candidateId}:{}),...(runStatus?{runStatus}:{}),
        ...(cursor?{cursor}:{}),limit:25,
      }),
      client.learning.listGates({
        ...(candidateId?{candidateId}:{}),limit:25,
      }),
      client.assignments.list({limit:25}),
    ]);
    const visibleCandidates=candidateId
      ?candidates.candidates.filter(item=>item.candidateRef.id===candidateId)
      :candidates.candidates;
    const visibleGates=candidateId
      ?gates.gates.filter(item=>item.candidateRef.id===candidateId)
      :gates.gates;
    const runCount=(id:string)=>runs.runs.filter(run=>run.candidateRef.id===id).length;
    const nextQuery=new URLSearchParams();
    if(candidateId)nextQuery.set('candidateId',candidateId);
    if(runStatus)nextQuery.set('runStatus',runStatus);
    if(runs.cursor)nextQuery.set('cursor',runs.cursor);
    return <main>
      <PageHeader eyebrow="Learning" title="Learning 治理"
        description={<>数据时点 {formatDateTime(candidates.asOf)}；候选 {candidates.candidates.length} 条，评测 {runs.runs.length} 条，Gate {visibleGates.length} 条。Assignment {assignments.assignments.length} 条。恢复由受授权的宿主 Worker 执行。</>}/>
      <p className="message stale" role="status">
        数据时点 {formatDateTime(candidates.asOf)}；候选 {candidates.candidates.length} 条，
        评测 {runs.runs.length} 条，Gate {visibleGates.length} 条。
        Assignment {assignments.assignments.length} 条。
        恢复由受授权的宿主 Worker 执行。
      </p>
      <form className="action-form" method="get" aria-label="Learning 筛选">
        <label htmlFor="candidateId">Candidate ID（可选）</label>
        <input id="candidateId" name="candidateId" type="text" defaultValue={candidateId??''}/>
        <label htmlFor="runStatus">评测状态</label>
        <select id="runStatus" name="runStatus" defaultValue={runStatus??''}>
          <option value="">全部</option><option value="Queued">Queued</option>
          <option value="Completed">Completed</option><option value="Inconclusive">Inconclusive</option>
        </select>
        <button type="submit">筛选</button>
      </form>
      {visibleCandidates.length===0?<p className="message empty">没有可见 Learning Candidate。</p>:(
        <div className="grid">{visibleCandidates.map(item=>(
          <section key={item.candidateRef.id} className="card">
            <h2>model · {item.assetKind}</h2>
            <dl>
              <dt>Candidate</dt><dd><code>{item.candidateRef.id}</code></dd>
              <dt>风险</dt><dd>{item.risk}</dd><dt>状态</dt><dd>{item.status}</dd>
              <dt>Case</dt><dd><code>{item.caseRef.id}</code></dd>
              <dt>可见评测</dt><dd>{runCount(item.candidateRef.id)}</dd>
              <dt>可见 Gate</dt><dd>{visibleGates.filter(gate=>gate.candidateRef.id===item.candidateRef.id).length}</dd>
              <dt>创建时间</dt><dd>{formatDateTime(item.createdAt)}</dd>
            </dl>
          </section>))}</div>)}
      {visibleCandidates.length===0?null:(
        <ActionForm action={requestEvaluationAction}>
          <input type="hidden" name="candidateId" value={visibleCandidates[0]!.candidateRef.id}/>
          <input type="hidden" name="candidateVersion" value={visibleCandidates[0]!.candidateRef.version}/>
          <label htmlFor="baselineArtifactId">Baseline Artifact ID</label>
          <input id="baselineArtifactId" name="baselineArtifactId" type="text" required
            pattern="[0-9a-fA-F-]{36}" defaultValue="00000000-0000-4000-8000-000000000037"/>
          <label htmlFor="baselineVersion">Baseline Version</label>
          <input id="baselineVersion" name="baselineVersion" type="number" min="1" defaultValue="1"/>
          <p>请求只绑定 Candidate 与 Baseline；Profile 由服务端策略冻结。</p>
        </ActionForm>)}
      <section aria-labelledby="evaluation-runs-heading" className="card">
        <h2 id="evaluation-runs-heading">Evaluation Runs</h2>
        {runs.runs.length===0?<p className="message empty">没有可见评测请求。</p>:(
          <div className="grid">{runs.runs.map(item=>(
            <section key={item.runRef.id} aria-label={`Evaluation Run ${item.runRef.id}`}>
              <h3>{item.status} · v{item.runRef.version}</h3>
              <dl>
                <dt>Candidate</dt><dd><code>{item.candidateRef.id}</code></dd>
                <dt>到期</dt><dd>{formatDateTime(item.expiresAt)}</dd>
                <dt>Result</dt><dd>{item.resultRef?.id?<code>{item.resultRef.id}</code>:'尚未收口'}</dd>
              </dl>
              {item.status==='Inconclusive'?(
                <ActionForm action={retryEvaluationAction}>
                  <input type="hidden" name="runId" value={item.runRef.id}/>
                  <input type="hidden" name="version" value={item.runRef.version}/>
                  <p>重试将冻结同一次 Candidate、Baseline 与 Profile。</p>
                </ActionForm>):null}
            </section>))}</div>)}
        {runs.cursor?<p><a href={`/learning?${nextQuery.toString()}`}>下一页</a></p>:null}
      </section>
      <section aria-labelledby="learning-gates-heading" className="card">
        <h2 id="learning-gates-heading">Learning Gates</h2>
        {visibleGates.length===0?<p className="message empty">没有可见 Gate Artifact。</p>:(
          <div className="grid">{visibleGates.map(item=>(
            <section key={item.gateRef.id} aria-label={`Learning Gate ${item.gateRef.id}`}>
              <h3>{item.verdict} · v{item.gateRef.version}</h3>
              <dl>
                <dt>Candidate</dt><dd><code>{item.candidateRef.id}</code></dd>
                <dt>Profile</dt><dd><code>{item.profileRef.id}</code></dd>
                <dt>评测证据</dt><dd>{item.evaluationRefs.length}</dd>
                <dt>置信区间</dt>
                <dd>{item.uncertainty.map(value=>`${value.metric} ${value.lowerBound}–${value.upperBound}`).join('；')}</dd>
                <dt>局限</dt>
                <dd>{item.limitations.map(value=>value.detail).join('；')}</dd>
                <dt>签署时间</dt><dd>{formatDateTime(item.createdAt)}</dd>
              </dl>
              {item.verdict==='Pass'?(
                <ActionForm action={releaseLearningCandidateAction}>
                  <input type="hidden" name="candidateId" value={item.candidateRef.id}/>
                  <input type="hidden" name="candidateVersion" value={item.candidateRef.version}/>
                  <input type="hidden" name="gateId" value={item.gateRef.id}/>
                  <input type="hidden" name="gateVersion" value={item.gateRef.version}/>
                  <label htmlFor={`behaviorSlot-${item.gateRef.id}`}>Behavior Slot</label>
                  <input id={`behaviorSlot-${item.gateRef.id}`} name="behaviorSlot" required
                    minLength={3} maxLength={100} defaultValue="learning.policy"/>
                  <label htmlFor={`capabilityId-${item.gateRef.id}`}>Capability ID</label>
                  <input id={`capabilityId-${item.gateRef.id}`} name="capabilityId" required
                    minLength={3} maxLength={100} defaultValue="learning.passed-candidate"/>
                  <label htmlFor={`capabilityVersion-${item.gateRef.id}`}>Capability Version</label>
                  <input id={`capabilityVersion-${item.gateRef.id}`} name="capabilityVersion"
                    required defaultValue="0.1.0"/>
                  <label htmlFor={`capabilityDigest-${item.gateRef.id}`}>Capability Digest</label>
                  <input id={`capabilityDigest-${item.gateRef.id}`} name="capabilityDigest" required
                    pattern="sha256:[0-9a-f]{64}"
                    defaultValue={`sha256:${'c'.repeat(64)}`}/>
                  <label htmlFor={`compatibilityArtifactId-${item.gateRef.id}`}>Compatibility Artifact ID</label>
                  <input id={`compatibilityArtifactId-${item.gateRef.id}`} name="compatibilityArtifactId"
                    required pattern="[0-9a-fA-F-]{36}"
                    defaultValue="00000000-0000-4000-8000-000000000037"/>
                  <label htmlFor={`compatibilityArtifactVersion-${item.gateRef.id}`}>Compatibility Version</label>
                  <input id={`compatibilityArtifactVersion-${item.gateRef.id}`}
                    name="compatibilityArtifactVersion" type="number" min="1" defaultValue="1"/>
                  <p>发布将强读 Pass Gate、绑定精确能力版本，并创建唯一的 Assignment。</p>
                </ActionForm>):null}
            </section>))}</div>)}
      </section>
      <section aria-labelledby="assignments-heading" className="card">
        <h2 id="assignments-heading">Assignments</h2>
        {assignments.assignments.length===0?<p className="message empty">没有可见 Assignment。</p>:(
          <div className="grid">{assignments.assignments.map(item=>{
            const rollbackCandidates=assignments.assignments.filter(candidate=>
              candidate.releaseRef.id!==item.releaseRef.id
              &&candidate.evidenceRefs.some(evidence=>evidence.type==='abh.learning-gate')
              &&candidate.evidenceRefs.filter(evidence=>evidence.type==='abh.artifact').length===1);
            const previousReleaseIds=[...new Set(rollbackCandidates.map(candidate=>candidate.releaseRef.id))];
            return (
            <section key={item.assignmentRef.id} aria-label={`Assignment ${item.assignmentRef.id}`}>
              <h3>{item.status} · v{item.assignmentRef.version}</h3>
              <dl>
                <dt>Release</dt><dd><code>{item.releaseRef.id}</code></dd>
                <dt>可选择</dt><dd>{item.selectable?'是':'否'}</dd>
                <dt>可执行</dt><dd>{item.executionAllowed?'是':'否'}</dd>
                <dt>证据</dt><dd>{item.evidenceRefs.length}</dd>
                {item.rollbackOfAssignmentRef?<><dt>回滚自 Assignment</dt>
                  <dd><code>{item.rollbackOfAssignmentRef.id}</code></dd></>:null}
                {item.rollbackFromReleaseRef?<><dt>回滚自 Release</dt>
                  <dd><code>{item.rollbackFromReleaseRef.id}</code></dd></>:null}
                {item.stopReason?<><dt>暂停原因</dt><dd>{item.stopReason}</dd></>:null}
              </dl>
              {item.status==='Active'?(
                <ActionForm action={pauseAssignmentAction} confirm="暂停会停止新的选择与执行资格。">
                  <input type="hidden" name="assignmentId" value={item.assignmentRef.id}/>
                  <input type="hidden" name="version" value={item.assignmentRef.version}/>
                  <label htmlFor={`assignmentReason-${item.assignmentRef.id}`}>暂停原因</label>
                  <input id={`assignmentReason-${item.assignmentRef.id}`} name="reason"
                    required minLength={1} maxLength={2000}/>
                  <p>服务端会强读当前版本并绑定 Assignment 已有证据；不取消在途执行。</p>
                </ActionForm>):null}
              {item.status==='Active'&&previousReleaseIds.length>0?(
                <ActionForm action={rollbackAssignmentAction} confirm="回滚会创建指向前继 Release 的新 Assignment。">
                  <input type="hidden" name="assignmentId" value={item.assignmentRef.id}/>
                  <input type="hidden" name="version" value={item.assignmentRef.version}/>
                  <label htmlFor={`rollbackRelease-${item.assignmentRef.id}`}>前继 Release</label>
                  <select id={`rollbackRelease-${item.assignmentRef.id}`} name="previousReleaseId" required>
                    {previousReleaseIds.map(releaseId=>(
                      <option key={releaseId} value={releaseId}>{releaseId}</option>))}
                  </select>
                  <label htmlFor={`rollbackReason-${item.assignmentRef.id}`}>回滚原因</label>
                  <input id={`rollbackReason-${item.assignmentRef.id}`} name="reason"
                    required minLength={1} maxLength={2000}/>
                  <p>服务端强读前继 Assignment 后派生证据；只恢复新选择，不取消在途工作。</p>
                </ActionForm>):null}
            </section>);})}</div>)}
      </section>
    </main>;
  }catch(error){return <main><h1>Learning 治理</h1>
    <Message kind="error">{errorText(error)}</Message></main>;}
}
