import type {MissionRecord,MissionConditionRecord} from '../generated/types.ts';
import type {CompatibleQueryEvidence} from '../generated/types.ts';
import type {QueryPackCapabilitiesQuery} from '../generated/types.ts';
import type {PackRetirementRecord,RetirePackPayload} from '../generated/types.ts';
import type {InstalledPackRecord} from '../generated/types.ts';
import type {PackCapabilitySetRecord} from '../generated/types.ts';
import type {PackEnableRecord,PackDeploymentRevisionRecord,PackEnableProposal} from '../generated/types.ts';
import type {PackInspectionFailureEvidence} from '../generated/types.ts';
import type {CliInspectionDiagnosticResult} from '../generated/types.ts';
import type {PackInspectionLeaseLossEvidence} from '../generated/types.ts';
import type {AcceptPackInspectionDeliveryCommand} from '../generated/types.ts';
import type { PackInspectionCancellationEvidence, PackInspectionWaitingEvidence, PackInspectionTimeoutEvidence, PackInspectionJobRecord, PackMigrationStructureObservation, PackMigrationStateObservation, PackMigrationDataObservation, PackMigrationDataReport, PackMigrationStructureReport, PackMigrationExecutionRecord, PackMigrationExecutionResult, PackMigrationEvidence, PackMigrationStep, PackDataImpactRecord, PackDataInventory, PackDataChange, PackDataImpact, PackGovernanceSnapshot, SignedTrustPolicyDocument, PackConformancePolicy, PackValidationReport, ConformanceReport, PackManifest, QueryExitRecord, QueryCaptureRecord, OperationWaitRecord, WaitPortReceiptRecord, ActionWaitRecord, DurableWaitRecord, DurableWakeupRecord, OutboxRoutingRecord, TransportCaptureRecord, OperationReconciliationRecord, DispatchPermitRecord, DispatchExitRecord, ResponsibilityAssignmentRecord, ResponsibilityRequestRecord, DecisionRecord, CommitmentRecord, SettlementRecord, ReleaseRecord, StaticAssignmentRecord, WorkspaceRecord, GrantRecord, LedgerRecord, OrganizationRecord, ActionRecord, DecisionEffectSummary, DecisionSubmittedResponse, DevelopmentConfig, ExecutionAuthority, EventEnvelope, ImpactUpperBound, JobEnvelope, OperationPlan, PinSet, RequestContext, VerifiedIdentity, ReadObjectRequest, ReadObjectDescriptor, DrainReport, EnqueueJobRequest, ScheduleWakeupRequest, CancelWakeupRequest, SignalWaitRequest, InspectDeliveryRequest, PutObjectRequest, StatObjectRequest } from '../generated/types.ts';
import type { ValidationIssue } from './schema.ts';
import { shapes, walkShape } from './shape.ts';

function issue(path: string, message: string): ValidationIssue {
  return { path, keyword: 'relationship', message };
}

/** UTC schemas allow microseconds; compare normalized strings without Date truncation. */
function instant(value: string): string {
  const [seconds, fraction = ''] = value.slice(0, -1).split('.');
  return `${seconds}.${fraction.padEnd(6, '0')}`;
}

export function inspectTenantRelationship(value: {
  actingOrganizationId: string;
  resourceOrganizationId: string;
  workspaceId?: string;
}): ValidationIssue[] {
  return value.actingOrganizationId !== value.resourceOrganizationId && !value.workspaceId
    ? [issue('/workspaceId', 'Cross-organization context requires a verified workspace.')]
    : [];
}

function inspectLocal(name: string, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if(name==='CliInspectionDiagnosticResult'){
    const report=value as CliInspectionDiagnosticResult;
    if(report.diagnostic&&JSON.stringify(report.evidenceRefs.map(identity))!==JSON.stringify(report.diagnostic.evidenceRefs.map(identity)))issues.push(issue('/evidenceRefs','CLI evidence references must match the actual diagnostic references.'));
  }
  if(name==='PackInspectionFailureEvidence'){
    const e=value as PackInspectionFailureEvidence,j=e.job;
    const micros=(v:string)=>{const t=Date.parse(v.slice(0,19)+'Z');return Number.isFinite(t)?BigInt(t)*1000n+BigInt((v.slice(19,-1).replace('.','')||'0').padEnd(6,'0')):null;};
    const at=micros(e.assessedAt),start=micros(j.updatedAt),expiry=micros(j.expiresAt);
    if(j.status!=='Running'||!j.lease||at===null||start===null||expiry===null||at<start){issues.push(issue('/job','Execution failure requires a Running attempt and nonregressing database assessment.'));return issues;}
    const elapsed=BigInt(j.budget.elapsedMs)+(at-start+999n)/1000n;
    if(elapsed!==BigInt(e.elapsedMs))issues.push(issue('/elapsedMs','Execution failure retains all elapsed Running work.'));
    if(e.disposition!==(elapsed>=BigInt(j.budget.maxDurationMs)?'BudgetExhausted':at>=expiry?'Expired':'InspectionFailed'))issues.push(issue('/disposition','Execution failure cannot hide actual budget or absolute expiry.'));
  }
  if(name==='PackInspectionLeaseLossEvidence'){
    const e=value as PackInspectionLeaseLossEvidence,j=e.job,l=e.observedLease,held=j.lease;
    const micros=(v:string)=>{const t=Date.parse(v.slice(0,19)+'Z');return Number.isFinite(t)?BigInt(t)*1000n+BigInt((v.slice(19,-1).replace('.','')||'0').padEnd(6,'0')):null;};
    const at=micros(e.assessedAt),start=micros(j.updatedAt),until=micros(l.leaseUntil),expiry=micros(j.expiresAt);
    if(j.status!=='Running'||!held||at===null||start===null||until===null||expiry===null||at<start){issues.push(issue('/job','Lease loss requires a Running attempt and valid nonregressing database assessment.'));return issues;}
    if(l.resourceOrganizationId!==j.resourceOrganizationId||identity(l.targetRef)!==identity(j.packRef)||l.leaseRef.id!==held.leaseRef.id||l.leaseRef.version<held.leaseRef.version||l.fencingToken<held.fencingToken||
      l.leaseRef.version-held.leaseRef.version<l.fencingToken-held.fencingToken)issues.push(issue('/observedLease','Lease observation must bind the same installed target and monotonic ownership history.'));
    const replaced=l.fencingToken>held.fencingToken;
    if(!replaced&&(l.workerId!==held.workerId||at<until)||e.cause!==(replaced?'Replaced':'Expired'))issues.push(issue('/cause','A renewed live token is not lease loss.'));
    const elapsed=BigInt(j.budget.elapsedMs)+(at-start+999n)/1000n;
    if(elapsed!==BigInt(e.elapsedMs))issues.push(issue('/elapsedMs','Lease loss retains all elapsed Running work.'));
    if(e.disposition!==(elapsed>=BigInt(j.budget.maxDurationMs)?'BudgetExhausted':at>=expiry?'Expired':'InspectionFailed'))issues.push(issue('/disposition','Lease loss cannot hide actual budget or absolute expiry.'));
  }
  if (name === 'PackInspectionCancellationEvidence') {
    const evidence=value as PackInspectionCancellationEvidence,job=evidence.job;
    const micros=(v:string)=>{const t=Date.parse(v.slice(0,19)+'Z');return Number.isFinite(t)?BigInt(t)*1000n+BigInt((v.slice(19,-1).replace('.','')||'0').padEnd(6,'0')):null;};
    const assessed=micros(evidence.assessedAt),started=micros(job.updatedAt);
    if(!['Pending','Running','Waiting'].includes(job.status)||assessed===null||started===null||assessed<started)
      issues.push(issue('/assessedAt','Cancellation requires nonterminal progress and nonregressing UTC assessment.'));
    else {
      const elapsed=BigInt(job.budget.elapsedMs)+(job.status==='Running'?(assessed-started+999n)/1000n:0n);
      if(elapsed!==BigInt(evidence.elapsedMs))issues.push(issue('/elapsedMs','Cancellation must retain the full Running wall-clock interval.'));
      if(evidence.disposition!==(elapsed>=BigInt(job.budget.maxDurationMs)?'BudgetExhausted':'Cancelled'))
        issues.push(issue('/disposition','Cancellation cannot hide duration exhaustion.'));
    }
  }
  if (name === 'PackInspectionWaitingEvidence' || name === 'PackInspectionRetryExhaustedEvidence') {
    const evidence=value as PackInspectionWaitingEvidence,job=evidence.job,block=evidence.block;
    const micros=(v:string)=>{const t=Date.parse(v.slice(0,19)+'Z');return Number.isFinite(t)?BigInt(t)*1000n+BigInt((v.slice(19,-1).replace('.','')||'0').padEnd(6,'0')):null;};
    const assessed=micros(evidence.assessedAt),started=micros(job.updatedAt),observed=micros(block.observedAt),expiry=micros(job.expiresAt);
    if(job.status!=='Running'||assessed===null||started===null||observed===null||expiry===null||observed<started||assessed<observed||assessed>=expiry)
      issues.push(issue('/assessedAt','Waiting requires a blocker observed during this live Running attempt.'));
    else if(BigInt(evidence.elapsedMs)!==BigInt(job.budget.elapsedMs)+(assessed-started+999n)/1000n)
      issues.push(issue('/elapsedMs','Waiting must retain the full Running wall-clock interval.'));
    if(name==='PackInspectionWaitingEvidence' && (evidence.elapsedMs>=job.budget.maxDurationMs||job.budget.attempts>=job.budget.maxAttempts))
      issues.push(issue('/job/budget','Waiting requires remaining retry and duration budget.'));
    if(name==='PackInspectionRetryExhaustedEvidence' && job.budget.attempts!==job.budget.maxAttempts)
      issues.push(issue('/job/budget/attempts','Retry exhaustion requires the final consumed attempt and a real blocker.'));
    for(const key of ['resourceOrganizationId','packageDigest','environmentDigest','deploymentVersion'] as const)
      if(block[key]!==job[key])issues.push(issue('/block','Blocker must bind the exact Job installation and environment.'));
    if(block.packRef.id!==job.packRef.id||block.packRef.version!==job.packRef.version)issues.push(issue('/block/packRef','Blocker must bind the exact installed Pack.'));
  }
  if (name === 'PackInspectionTimeoutEvidence') {
    const evidence = value as PackInspectionTimeoutEvidence, job = evidence.job;
    const micros = (value:string) => { const seconds=Date.parse(value.slice(0,19)+'Z'); return Number.isFinite(seconds)?BigInt(seconds)*1000n + BigInt((value.slice(19,-1).replace('.','') || '0').padEnd(6,'0')):null; };
    const assessed=micros(evidence.assessedAt),started=micros(job.updatedAt),expiry=micros(job.expiresAt);
    if(assessed===null||started===null||expiry===null){issues.push(issue('/assessedAt','Timeout arithmetic requires representable UTC instants.'));return issues;}
    const delta = assessed-started;
    if (!['Pending','Running','Waiting'].includes(job.status) || delta<0n)
      issues.push(issue('/job','Timeout evidence requires nonterminal progress and a nonregressing assessment time.'));
    else {
      const elapsed=BigInt(job.budget.elapsedMs)+(job.status==='Running'?(delta+999n)/1000n:0n);
      if(elapsed!==BigInt(evidence.elapsedMs))issues.push(issue('/elapsedMs','Elapsed budget must include the entire Running wall-clock interval rounded up to milliseconds.'));
      const exhausted=elapsed>=BigInt(job.budget.maxDurationMs);
      if(evidence.cause!==(exhausted?'BudgetExhausted':'Expired') || (!exhausted && assessed<expiry))
        issues.push(issue('/cause','Timeout cause must follow cumulative duration exhaustion or actual expiry.'));
    }
  }
  if (name === 'PackInspectionJobRecord') {
    const job = value as PackInspectionJobRecord;
    const { status, budget } = job;
    const terminal = ['Succeeded', 'Failed', 'Cancelled'].includes(status);
    if (instant(job.updatedAt) < instant(job.requestedAt) || instant(job.expiresAt) <= instant(job.requestedAt))
      issues.push(issue('/updatedAt', 'Progress timestamps must follow request time and expiry must follow request time.'));
    if ((!terminal || status === 'Succeeded') && instant(job.updatedAt) >= instant(job.expiresAt))
      issues.push(issue('/expiresAt', 'Expired work must fail or be cancelled.'));
    if (budget.attempts > budget.maxAttempts || budget.elapsedMs > budget.maxDurationMs) {
      if (status !== 'Failed' || job.diagnostic?.code !== 'BudgetExhausted')
        issues.push(issue('/budget', 'Budget overrun must remain visible as a BudgetExhausted failure.'));
    }
    if (status === 'Pending' && (budget.attempts !== 0 || budget.elapsedMs !== 0))
      issues.push(issue('/budget', 'Pending work cannot discard an earlier attempt budget.'));
    if (['Running', 'Waiting', 'Succeeded'].includes(status) && budget.attempts < 1)
      issues.push(issue('/budget/attempts', 'Started work must retain at least one attempt.'));
    if (status === 'Running' && budget.elapsedMs >= budget.maxDurationMs)
      issues.push(issue('/budget/elapsedMs', 'Running requires remaining duration budget.'));
    if (status === 'Waiting' && (budget.attempts >= budget.maxAttempts || budget.elapsedMs >= budget.maxDurationMs))
      issues.push(issue('/budget', 'Waiting requires remaining retry budget.'));
    if ((status === 'Running') !== (job.lease !== undefined))
      issues.push(issue('/lease', 'Only Running work must hold a fenced lease.'));
    if ((status === 'Succeeded') !== (job.observation !== undefined))
      issues.push(issue('/observation', 'Only Succeeded inspection work must reference its actual observation.'));
    const diagnosticRequired = ['Waiting', 'Failed', 'Cancelled'].includes(status);
    if (diagnosticRequired !== (job.diagnostic !== undefined))
      issues.push(issue('/diagnostic', 'Blocked, failed and cancelled work require formal diagnostic evidence.'));
    if (job.diagnostic) {
      const allowed = status === 'Waiting'
        ? ['Missing', 'Ambiguous', 'ObservationAmbiguous', 'ObservationSearchIncomplete', 'LeaseBusy']
        : status === 'Cancelled' ? ['Cancelled'] : ['BudgetExhausted', 'Expired', 'InspectionFailed'];
      if (!allowed.includes(job.diagnostic.code)) issues.push(issue('/diagnostic/code', 'Diagnostic must agree with progress state.'));
      if (job.diagnostic.code === 'BudgetExhausted' && budget.attempts < budget.maxAttempts && budget.elapsedMs < budget.maxDurationMs)
        issues.push(issue('/budget', 'BudgetExhausted requires an exhausted cumulative budget.'));
      if (job.diagnostic.code === 'Expired' && instant(job.updatedAt) < instant(job.expiresAt))
        issues.push(issue('/expiresAt', 'Expired failure requires elapsed expiry.'));
    }
  }
  if(name==='SignedTrustPolicyDocument'){
    const document=value as SignedTrustPolicyDocument;
    if(instant(document.expiresAt)<=instant(document.issuedAt))issues.push(issue('/expiresAt','Policy expiry must follow issuance.'));
    issues.push(...inspectRelationships('PackGovernanceSnapshot',document.snapshot));
  }
  if(name==='PackMigrationStateObservation'){
    const observation=value as PackMigrationStateObservation,result=observation.result;
    const structure=result.structure,data=result.data;
    issues.push(...inspectRelationships('PackMigrationStructureObservation',{result:structure,observedAt:observation.observedAt}).map(item=>({...item,path:`/result/structure${item.path}`})));
    issues.push(...inspectRelationships('PackMigrationDataObservation',{result:data,observedAt:observation.observedAt}).map(item=>({...item,path:`/result/data${item.path}`})));
    if(result.matched!==(structure.matched&&data.matched))issues.push(issue('/result/matched','Combined match must equal both observations.'));
    for(const key of ['organizationId','packId','packVersion','packageDigest','planDigest'] as const)if(structure.binding[key]!==data.binding[key])issues.push(issue('/result','Both observations must bind the same package and plan.'));
    if(structure.signature.report.environmentDigest!==data.signature.report.environmentDigest||structure.signature.report.deploymentVersion!==data.signature.report.deploymentVersion)issues.push(issue('/result','Both observations must bind the same environment and deployment.'));
    if(new Set([structure.reportRef.id,structure.bundleRef.id,data.reportRef.id,data.bundleRef.id]).size!==4)issues.push(issue('/result','Four distinct expectation and Bundle sources are required.'));
  }
  if(name==='PackMigrationStructureObservation'){
    const observation=value as PackMigrationStructureObservation,result=observation.result,report=result.signature.report;
    if(result.expectedDigest!==result.binding.expectedDigest||Object.entries(result.binding).some(([key,value])=>report.binding[key as keyof typeof report.binding]!==value))issues.push(issue('/result/binding','Observation and signed expectation must have the same binding.'));
    if(result.reportRef.type!=='abh.artifact'||result.bundleRef.type!=='abh.artifact'||result.reportRef.id===result.bundleRef.id)issues.push(issue('/result/reportRef','Distinct report and Bundle Artifact sources are required.'));
    if(instant(result.signature.verifiedAt)<instant(report.issuedAt)||instant(result.signature.verifiedAt)>=instant(report.expiresAt)||instant(observation.observedAt)<instant(result.signature.verifiedAt))issues.push(issue('/observedAt','Observation must follow verification within the signed expectation lifetime.'));
    const unique=(keys:string[],path:string)=>{if(new Set(keys).size!==keys.length)issues.push(issue(path,'Duplicate structural observation.'));};
    unique(result.inventory.results.map(row=>row.schema),'/result/inventory');
    for(const row of result.inventory.results){
      for(const list of [row.actual,row.missing,row.unexpected,row.changed])unique(list.map(item=>item.name),'/result/inventory');
      if(row.changed.some(item=>item.expectedKind===item.actualKind))issues.push(issue('/result/inventory','Changed relation kinds must differ.'));
    }
    if(result.inventory.matched!==result.inventory.results.every(row=>!row.missing.length&&!row.unexpected.length&&!row.changed.length))issues.push(issue('/result/inventory/matched','Inventory match must agree with observed differences.'));
    for(const key of ['tables','sequences','views','acl'] as const){
      const group=result[key];if(!group)continue;
      unique(group.results.map(row=>JSON.stringify([row.schema,row.name])),`/result/${key}`);
      if(group.matched!==group.results.every(row=>'differences' in row?!row.differences.length:!row.missing.length&&!row.unexpected.length))issues.push(issue(`/result/${key}/matched`,'Detailed match must agree with observed differences.'));
      for(const row of group.results){
        if(!result.inventory.results.some(item=>item.schema===row.schema))issues.push(issue(`/result/${key}`,'Detailed observation requires its schema inventory.'));
        if(row.actual&&!Array.isArray(row.actual)&&(row.actual.schema!==row.schema||row.actual.name!==row.name))issues.push(issue(`/result/${key}`,'Actual definition must identify the checked object.'));
      }
    }
    unique(result.requiresAdditionalVerification.map(row=>JSON.stringify([row.schema,row.name])),'/result/requiresAdditionalVerification');
    if(result.matched!==[result.inventory,result.tables,result.sequences,result.views,result.acl].every(group=>group?.matched??true))issues.push(issue('/result/matched','Structural match must equal every component match.'));
  }
  if(name==='PackMigrationDataObservation'){
    const observation=value as PackMigrationDataObservation,result=observation.result,report=result.signature.report;
    if(result.expectedDigest!==result.binding.expectedDigest||Object.entries(result.binding).some(([key,value])=>report.binding[key as keyof typeof report.binding]!==value))issues.push(issue('/result/binding','Observation and signed expectation must have the same binding.'));
    if(result.reportRef.type!=='abh.artifact'||result.bundleRef.type!=='abh.artifact'||result.reportRef.id===result.bundleRef.id)issues.push(issue('/result/reportRef','Distinct report and Bundle Artifact sources are required.'));
    if(instant(result.signature.verifiedAt)<instant(report.issuedAt)||instant(result.signature.verifiedAt)>=instant(report.expiresAt)||instant(observation.observedAt)<instant(result.signature.verifiedAt))issues.push(issue('/observedAt','Observation must follow verification within the signed expectation lifetime.'));
    if(result.matched!==result.results.every(row=>row.matched))issues.push(issue('/result/matched','Aggregate match must equal every table match.'));
    const tables=new Set<string>();
    for(const [index,row] of result.results.entries()){
      const path=`/result/results/${index}`,name=JSON.stringify([row.schema,row.table]);
      if(tables.has(name))issues.push(issue(path,'Duplicate table observation.'));tables.add(name);
      const total=BigInt(row.rowCount),counts=[row.rowCount,...row.nulls.map(item=>item.count),...row.duplicates.map(item=>item.groups)];
      if(counts.some(count=>BigInt(count)>9223372036854775807n))issues.push(issue(path,'Counts must fit a nonnegative PostgreSQL bigint.'));
      if(row.nulls.some(item=>BigInt(item.count)>total)||row.duplicates.some(item=>BigInt(item.groups)*2n>total))issues.push(issue(path,'Null and duplicate-group counts must be possible for the observed row count.'));
      if(row.matched&&(row.nulls.some(item=>item.count!=='0')||row.duplicates.some(item=>item.groups!=='0')))issues.push(issue(path,'A matching table cannot contain declared null or uniqueness violations.'));
      if(new Set(row.nulls.map(item=>item.column)).size!==row.nulls.length||new Set(row.duplicates.map(item=>JSON.stringify([...item.columns].sort()))).size!==row.duplicates.length)issues.push(issue(path,'Duplicate column or semantic key observation.'));
    }
  }
  if(name==='PackMigrationExecutionResult'){
    const result=value as PackMigrationExecutionResult;
    if(result.kind==='CommitAcknowledged'&&!result.sqlStarted)issues.push(issue('/sqlStarted','A commit acknowledgement requires SQL execution.'));
  }
  if(name==='PackMigrationExecutionRecord'){
    const record=value as PackMigrationExecutionRecord;
    if(instant(record.observedAt)<instant(record.attempt.claimedAt))issues.push(issue('/observedAt','Execution observation cannot precede its claim.'));
  }
  if(name==='PackMigrationStructureReport'||name==='PackMigrationDataReport'){
    const record=value as PackMigrationStructureReport|PackMigrationDataReport;
    if(instant(record.expiresAt)<=instant(record.issuedAt))issues.push(issue('/expiresAt','Migration expectation expiry must follow issuance.'));
  }
  if(name==='PackMigrationEvidence'){
    const record=value as PackMigrationEvidence;
    if(instant(record.expiresAt)<=instant(record.issuedAt))issues.push(issue('/expiresAt','Migration evidence expiry must follow issuance.'));
  }
  if(name==='PackMigrationStep'){
    const step=value as PackMigrationStep;
    if(step.operations.includes('Drop')&&step.phase!=='Contract')issues.push(issue('/operations','Drop requires the Contract phase.'));
    if(step.phase==='Contract'&&!step.retirementRef)issues.push(issue('/retirementRef','Contract requires old-code retirement evidence.'));
  }
  if(name==='PackDeploymentRevisionRecord'){
    const revision=value as PackDeploymentRevisionRecord;
    if(revision.deploymentVersion!==revision.previousDeploymentVersion+1||revision.revisionRef.version!==1)issues.push(issue('/deploymentVersion','Deployment revisions advance exactly once and remain immutable.'));
  }
  if(name==='QueryPackCapabilitiesQuery'){
    const query=value as QueryPackCapabilitiesQuery;
    if(query.version&&(!query.capabilityId||query.versionRange))issues.push(issue('/version','An exact version requires a capability ID and excludes versionRange.'));
  }
  if(name==='RetirePackPayload'||name==='PackRetirementRecord'){
    const record=value as RetirePackPayload;
    if(record.packRef.version!==3)issues.push(issue('/packRef','Retirement requires the exact suspended installation version.'));
  }
  if(name==='PackRetirementRecord'){
    const record=value as PackRetirementRecord;
    if(record.retiredPackRef.id!==record.packRef.id||record.retiredPackRef.version!==record.packRef.version+1||record.deploymentVersion!==record.expectedDeploymentVersion+1
      ||instant(record.retiredAt)<instant(record.rollbackWindowEndsAt))issues.push(issue('/retiredPackRef','Retirement advances the suspended Pack and deployment once, after the reviewed rollback window.'));
  }
  if(name==='InstalledPackRecord'){
    const record=value as InstalledPackRecord,e=record.enablement;
    if(record.status!=='Retired'&&record.retirement)issues.push(issue('/retirement','Only retired installations carry retirement evidence.'));
    if(record.status==='Staged'){
      if(record.packRef.version!==1||e||record.suspension)issues.push(issue('/status','Staged installations are initial version 1 records without enablement.'));
    }else if(!e)issues.push(issue('/enablement','Enabled installations require the complete approved transition.'));
    else{
      issues.push(...inspectRelationships('PackEnableRecord',e),...inspectRelationships('PackEnableProposal',e.proposal));
      if((record.status==='Enabled'&&(record.packRef.version!==2||identity(record.packRef)!==identity(e.enabledPackRef)||record.deploymentVersion!==e.deploymentVersion||record.suspension!==undefined))||
        record.manifest.integrity.packageDigest!==e.proposal.subjectDigest||identity(record.validationRef)!==identity(e.proposal.validationRef)||
        identity(record.governanceRef)!==identity(e.proposal.governanceRef)||record.governanceDigest!==e.proposal.governanceDigest||instant(e.enabledAt)<instant(record.stagedAt))issues.push(issue('/enablement','Enabled state must match the exact approved installation and deployment transition.'));
    }
  }
  if(name==='InstalledPackRecord'&&(value as InstalledPackRecord).status==='Suspended'){
    const record=value as InstalledPackRecord,s=record.suspension,e=record.enablement;
    if(!s||!e||identity(s.packRef)!==identity(e.enabledPackRef)||record.packRef.id!==s.packRef.id||record.packRef.version!==s.packRef.version+1||s.expectedDeploymentVersion<e.deploymentVersion||record.deploymentVersion!==s.expectedDeploymentVersion+1||instant(s.suspendedAt)<instant(e.enabledAt))issues.push(issue('/suspension','Suspension must advance the prior Enabled installation and current deployment revision, preserving enablement.'));
  }
  if(name==='InstalledPackRecord'&&(value as InstalledPackRecord).status==='Retired'){
    const record=value as InstalledPackRecord,r=record.retirement,s=record.suspension,e=record.enablement;
    if(!r||!s||!e||identity(record.packRef)!==identity(r.retiredPackRef)||record.packRef.version!==4||r.packRef.version!==3||r.packRef.id!==record.packRef.id
      ||record.deploymentVersion!==r.deploymentVersion||r.expectedDeploymentVersion<s.expectedDeploymentVersion+1||identity(s.packRef)!==identity(e.enabledPackRef)
      ||s.expectedDeploymentVersion<e.deploymentVersion||instant(s.suspendedAt)<instant(e.enabledAt)||instant(r.retiredAt)<instant(s.suspendedAt))issues.push(issue('/retirement','Retirement must preserve the original Enable and Suspend history and advance the current deployment.'));
  }
  if(name==='PackEnableRecord'){
    const record=value as PackEnableRecord,p=record.proposal;
    if(identity(record.previousPackRef)!==identity(p.packRef)||record.enabledPackRef.id!==p.packRef.id||record.enabledPackRef.version!==p.packRef.version+1)issues.push(issue('/enabledPackRef','Enable must advance the exact approved Pack version once.'));
    if(record.deploymentVersion!==p.expectedDeploymentVersion+1)issues.push(issue('/deploymentVersion','Enable must advance the approved deployment version once.'));
    if(instant(record.enabledAt)>=instant(p.expiresAt))issues.push(issue('/enabledAt','Enable must precede proposal expiration.'));
  }
  if(name==='PackCapabilitySetRecord'){
    const record=value as PackCapabilitySetRecord;
    const keys=record.registrations.map(r=>`${r.capability.kind}/${r.capability.id}/${r.capability.version}`);
    if(record.setRef.version!==1||new Set(keys).size!==keys.length||record.registrations.some(r=>identity(r.packRef)!==identity(record.packRef)))issues.push(issue('/registrations','Capability sets are immutable, unique and bound to one exact Pack.'));
  }
  if(name==='PackEnableProposal'){
    const proposal=value as PackEnableProposal;
    if(proposal.capabilitySetRef.version!==1)issues.push(issue('/capabilitySetRef/version','Capability sets are immutable version 1 records.'));
    if(proposal.impactUpperBound.scopeRefs.some(ref=>ref.type!=='abh.organization'||ref.id!==proposal.resourceOrganizationId))issues.push(issue('/impactUpperBound/scopeRefs','Pack enable governance requires the proposal resource organization scope.'));
  }
  if(name==='PackMigrationNonApplicabilityReport'){
    const record=value as PackDataImpactRecord;
    const normalized=(inventory:PackDataInventory)=>JSON.stringify(inventory.entries.map(entry=>[entry.kind,entry.id,entry.digest]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if(normalized(record.baseline)!==normalized(record.target))issues.push(issue('/target','Non-applicability requires identical complete definition inventories.'));
  }
  if(name==='PackDataImpactRecord'){
    const record=value as PackDataImpactRecord;
    if(instant(record.expiresAt)<=instant(record.issuedAt))issues.push(issue('/expiresAt','Impact evidence must expire after issuance.'));
    if(record.compilerRef.kind!=='Compiler')issues.push(issue('/compilerRef','Data inventory evidence requires an exact Compiler capability.'));
    issues.push(...inspectRelationships('PackDataInventory',record.baseline),...inspectRelationships('PackDataInventory',record.target),...inspectRelationships('PackDataImpact',record.impact));
    if(record.impact.reasons.includes('InventoryIncomplete')!==(!record.baseline.complete||!record.target.complete))issues.push(issue('/impact','Impact completeness must agree with both source inventories.'));
  }
  if(name==='PackDataInventory'){
    const entries=(value as PackDataInventory).entries,keys=entries.map(entry=>`${entry.kind}/${entry.id}`);
    if(new Set(keys).size!==keys.length)issues.push(issue('/entries','Data inventory identities must be unique.'));
  }
  if(name==='PackDataChange'){
    const change=value as PackDataChange,before=change.beforeDigest!==undefined,after=change.afterDigest!==undefined;
    if(change.change==='Added'&&(before||!after)||change.change==='Removed'&&(!before||after)||
      change.change==='Changed'&&(!before||!after||change.beforeDigest===change.afterDigest))issues.push(issue('/change','Change kind must agree with distinct before/after digests.'));
  }
  if(name==='PackDataImpact'){
    const report=value as PackDataImpact,keys=report.changes.map(entry=>`${entry.kind}/${entry.id}`),reasons=new Set(report.reasons);
    if(new Set(keys).size!==keys.length||new Set(report.migrationRefs).size!==report.migrationRefs.length)issues.push(issue('/changes','Impact identities and migration paths must be unique.'));
    if(reasons.has('DefinitionsChanged')!==(report.changes.length>0)||reasons.has('DeclaredMigrations')!==(report.migrationRefs.length>0))issues.push(issue('/reasons','Impact reasons must describe the actual changes and declared migrations.'));
    const expected=reasons.has('InventoryIncomplete')?'Incomplete':reasons.size?'Required':'NotApplicable';
    if(report.status!==expected)issues.push(issue('/status','Impact status must agree with completeness and required verification.'));
    if(report.status==='NotApplicable'&&report.baselineDigest!==report.targetDigest||report.changes.length>0&&report.baselineDigest===report.targetDigest)issues.push(issue('/targetDigest','Inventory commitments must agree with the reported definition changes.'));
    for(const change of report.changes)issues.push(...inspectRelationships('PackDataChange',change));
  }
  if(name==='PackGovernanceSnapshot'){
    const snapshot=value as PackGovernanceSnapshot,id=snapshot.policy.packId;
    if(Object.values(snapshot.trust).some(policy=>policy.packId!==id))issues.push(issue('/trust','Every proof policy must bind the same Pack identity.'));
    const identities=snapshot.reservedVersions.map(item=>`${item.packId}@${item.version}`);
    if(new Set(identities).size!==identities.length||new Set(snapshot.revokedPackIds).size!==snapshot.revokedPackIds.length||new Set(snapshot.revokedDigests).size!==snapshot.revokedDigests.length)issues.push(issue('/reservedVersions','Governance histories and revocations must be unique.'));
    issues.push(...inspectRelationships('PackConformancePolicy',snapshot.trust.conformance));
  }
  if(name==='PackConformancePolicy'){
    const policy=value as PackConformancePolicy,cases=policy.cases.map(item=>item.caseId),claims=policy.claimedCapabilities.map(item=>`${item.kind}/${item.id}/${item.version}`);
    if(new Set(cases).size!==cases.length||new Set(claims).size!==claims.length)issues.push(issue('/cases','Suite cases and capability identities must be unique.'));
  }
  if (name === 'PackValidationReport') {
    const report=value as PackValidationReport;
    if(instant(report.validUntil)<=instant(report.validatedAt))issues.push(issue('/validUntil','Validation evidence must expire after validation.'));
  }
  if (name === 'ConformanceReport') {
    const report=value as ConformanceReport, ids=report.caseResults.map(result=>result.caseId);
    if(new Set(ids).size!==ids.length)issues.push(issue('/caseResults','Case identities must be unique.'));
    if(report.status==='Complete'&&(ids.length===0||report.caseResults.some(result=>result.status==='NotRun')))issues.push(issue('/status','Complete reports must contain results and cannot contain unrun cases.'));
    if(report.caseResults.some(result=>(result.status==='Passed')!==(result.reason===null)))issues.push(issue('/caseResults','Non-passing cases require a reason; passing cases have no failure reason.'));
    const claims=report.claimedCapabilities.map(claim=>`${claim.kind}/${claim.id}/${claim.version}`);
    if(new Set(claims).size!==claims.length)issues.push(issue('/claimedCapabilities','Capability claims must be unique.'));
    const deviations=report.knownDeviations.map(deviation=>deviation.caseId);
    if(new Set(deviations).size!==deviations.length||deviations.some(id=>!ids.includes(id)))issues.push(issue('/knownDeviations','Deviations must reference unique reported cases.'));
    if(instant(report.finishedAt)<instant(report.startedAt))issues.push(issue('/finishedAt','Report completion cannot precede its start.'));
    if(report.signatureRef.normalize('NFC')!==report.signatureRef||report.signatureRef.split('/').some(part=>part.endsWith('.')))issues.push(issue('/signatureRef','Signature path must be unambiguous.'));
  }
  if (name === 'PackManifest') {
    const pack=value as PackManifest,mode=pack.trust.mode;
    const enforcement={Declarative:'None',TrustedCode:'HostProfile',Isolated:'IsolatedLimits'};
    if(pack.resources.enforcement!==enforcement[mode])issues.push(issue('/resources','Resource enforcement must match trust mode.'));
    if(mode!=='TrustedCode'&&pack.migrations.length)issues.push(issue('/migrations','Only TrustedCode may declare migrations.'));
    if(mode==='Declarative'&&(pack.permissions.networkEgress.length||pack.permissions.secretClasses.length))issues.push(issue('/permissions','Declarative packs cannot request network or secrets.'));
    const paths=[...pack.artifacts,...pack.migrations].map(entry=>entry.ref).concat([pack.integrity.signatureRef,pack.integrity.provenanceRef,pack.integrity.conformanceRef]);
    if(new Set(paths.map(path=>path.toLowerCase())).size!==paths.length||paths.some(path=>path.normalize('NFC')!==path||path.split('/').some(part=>part.endsWith('.'))))issues.push(issue('/artifacts','Payload and proof paths must be unique and unambiguous.'));
    const provides=pack.capabilities.provides.map(capability=>`${capability.kind}/${capability.id}/${capability.version}`);
    if(new Set(provides).size!==provides.length)issues.push(issue('/capabilities/provides','Duplicate capability identity.'));
  }
  if (name === 'WaitPortReceiptRecord') {
    const receipt=value as WaitPortReceiptRecord,result=receipt.result;
    const ref=(r:{type:string;id:string;version:number})=>`${r.type}/${r.id}/${r.version}`;
    if(ref(receipt.waitRef)!==ref(result.waitRef) || (receipt.method==='signal')!==Boolean(receipt.triggerEventRef)
      || (receipt.method==='signal')!==('wakeupRef' in result) || (receipt.method==='cancelWakeup')!==('disposition' in result)
      || 'wakeupRef' in result && ref(result.wakeupRef)!==ref(receipt.receiptRef) || 'receiptRef' in result && ref(result.receiptRef)!==ref(receipt.receiptRef)) issues.push(issue('/result','Wait Port receipt must bind its method, signal and exact result.'));
  }
  if (name === 'ActionWaitRecord' || name === 'OperationWaitRecord') {
    const wait=value as ActionWaitRecord | OperationWaitRecord;
    if((['SourceClosed','Deadline'].includes(wait.outcome))!==Boolean(wait.wakeupRef) || (wait.outcome==='Cancelled')!==Boolean(wait.cancelledWaitRef)) issues.push(issue('/outcome','Action waiting evidence must match its notification outcome.'));
  }
  if (name === 'DurableWaitRecord') {
    const wait=value as DurableWaitRecord;
    if ((wait.status!=='Pending')!==Boolean(wait.resolvedAt) || (wait.status==='Succeeded')!==Boolean(wait.wakeupRef) || (wait.status==='Cancelled')!==Boolean(wait.cancelReason)) issues.push(issue('/status','Wait terminal evidence must match its state.'));
    if (wait.sourceRef.type!==wait.source.sourceRef.type || wait.sourceRef.id!==wait.source.sourceRef.id || wait.source.sourceRef.version<wait.sourceRef.version) issues.push(issue('/source','Wait source watermark cannot substitute or precede the registered source.'));
    if (wait.resolvedAt && instant(wait.resolvedAt)<instant(wait.registeredAt)) issues.push(issue('/resolvedAt','Resolution cannot precede registration.'));
  }
  if (name === 'DurableWakeupRecord') {
    const wake=value as DurableWakeupRecord;
    if ((wake.reason==='Condition')!==wake.source.satisfied) issues.push(issue('/reason','Wakeup reason must agree with the reread source condition.'));
  }
  if (name === 'RequestContext' || name === 'AuthorizedRequestContext') {
    const context = value as RequestContext;
    issues.push(...inspectTenantRelationship(context));
    if (instant(context.receivedAt) >= instant(context.contextExpiresAt)) {
      issues.push(issue('/contextExpiresAt', 'Context expiry must follow receipt time.'));
    }
  }
  if (name === 'OutboxRoutingRecord') {
    const routing=value as OutboxRoutingRecord;
    if(new Set(routing.deliveries.map(delivery=>delivery.consumerId)).size!==routing.deliveries.length)issues.push(issue('/deliveries','Each consumer appears once in a frozen routing set.'));
    for(const delivery of routing.deliveries)if(delivery.job.causeRef.type!=='abh.event'||delivery.job.causeRef.id!==routing.eventRef.id||delivery.job.causeRef.version!==1)issues.push(issue('/deliveries','Every delivery must reference the committed source event.'));
  }
  if(name==='MissionRecord'){
    const mission=value as MissionRecord;
    if(mission.goalRevision>mission.missionRef.version||instant(mission.updatedAt)<instant(mission.createdAt))issues.push(issue('/goalRevision','Goal revision and timestamps cannot exceed aggregate progress.'));
    if(mission.status==='Draft'&&(mission.authorityRef||mission.activeRunRef||mission.pauseRequested||mission.cleanupStatus!=='NotRequired'))issues.push(issue('/status','Draft Mission cannot assert execution authority, Run, pause or cleanup.'));
    if(mission.status!=='Draft'&&!mission.authorityRef)issues.push(issue('/authorityRef','Activated Mission history requires its authority reference.'));
    if(mission.status==='Paused'&&!mission.pauseRequested)issues.push(issue('/pauseRequested','Paused Mission retains explicit pause intent.'));
    if(mission.status==='Completed'&&mission.cleanupStatus==='Pending')issues.push(issue('/cleanupStatus','Mission cannot complete with unresolved effects.'));
  }
  if(name==='MissionConditionRecord'){
    const value2=value as MissionConditionRecord;
    if(value2.goalRevision>value2.missionRef.version)issues.push(issue('/goalRevision','Conditions cannot claim a future goal revision.'));
  }
  if(name==='CompatibleQueryEvidence'){
    const proof=value as CompatibleQueryEvidence;
    if(capabilityIdentity(proof.originalConnectorRef)===capabilityIdentity(proof.queryConnectorRef))issues.push(issue('/queryConnectorRef','Compatibility evidence requires a distinct replacement Connector.'));
  }
  if (name === 'QueryExitRecord') {
    const exit=value as QueryExitRecord;
    if(Boolean(exit.queryConnectorRef)!==Boolean(exit.compatibilityEvidenceRef)||Boolean(exit.queryConnectorRef)!==Boolean(exit.compatibilityEvidenceDigest)
      ||(exit.queryConnectorRef&&capabilityIdentity(exit.queryConnectorRef)===capabilityIdentity(exit.connectorRef)))issues.push(issue('/queryConnectorRef','A replacement query capability requires exact compatibility evidence and retains the distinct original Connector.'));

    if(instant(exit.expiresAt)<=instant(exit.claimedAt)||Date.parse(exit.expiresAt)-Date.parse(exit.claimedAt)>30_000)issues.push(issue('/expiresAt','Query exits have a positive lifetime of at most thirty seconds.'));
    if(new Set(exit.reservationRefs.map(ref=>ref.id)).size!==exit.reservationRefs.length)issues.push(issue('/reservationRefs','Query costs require distinct reservation evidence.'));
  }
  if (name === 'TransportCaptureRecord' || name === 'QueryCaptureRecord') {
    const capture=value as TransportCaptureRecord | QueryCaptureRecord;
    if(capture.transportStatus==='Responded'){
      if(!capture.rawArtifactRef||capture.normalization==='NotApplicable'||(capture.normalization==='Normalized')!==Boolean(capture.receiptRef))issues.push(issue('/normalization','Every response retains raw evidence, with a receipt only after valid normalization.'));
    }else if(capture.rawArtifactRef||capture.receiptRef||capture.normalization!=='NotApplicable')issues.push(issue('/normalization','Transport failure cannot invent response evidence.'));
  }
  if (name === 'OperationReconciliationRecord') {
    const report=value as OperationReconciliationRecord;
    if((report.verdict==='ConfirmedSuccess')!==Boolean(report.confirmedExternal))issues.push(issue('/confirmedExternal','Only confirmed success must bind the selected external identity and version.'));
  }
  if (name === 'DispatchPermitRecord' || name === 'DispatchExitRecord') {
    const record=value as DispatchPermitRecord|DispatchExitRecord;
    const start='issuedAt' in record?record.issuedAt:record.claimedAt;
    const micros=(time:string)=>BigInt(Date.parse(time.split('.')[0]!.replace(/Z$/,'')+'Z'))*1000n+BigInt((time.slice(0,-1).split('.')[1]??'').padEnd(6,'0'));
    const duration=micros(record.expiresAt)-micros(start);
    if(duration<=0n||duration>5_000_000n)issues.push(issue('/expiresAt','Dispatch validity must be positive and at most five seconds.'));
  }
  if (name === 'ResponsibilityAssignmentRecord') {
    const assignment=value as ResponsibilityAssignmentRecord;
    if(instant(assignment.validFrom)>=instant(assignment.validUntil))issues.push(issue('/validUntil','Responsibility validity must be increasing.'));
  }
  if (name === 'ResponsibilityRequestRecord') {
    const request=value as ResponsibilityRequestRecord,slots=request.requiredSlots;
    const ids=slots.map(slot=>slot.slotId);
    if(new Set(ids).size!==ids.length||!slots.some(slot=>slot.required))issues.push(issue('/requiredSlots','Slots must be unique and include a required seat.'));
    const reached=new Set<string>(),active=new Set<string>();
    const visit=(id:string):boolean=>{if(active.has(id))return false;if(reached.has(id))return true;const slot=slots.find(slot=>slot.slotId===id);if(!slot)return false;active.add(id);for(const dependency of slot.dependsOnSlotIds)if(!visit(dependency))return false;active.delete(id);reached.add(id);return true;};
    if(ids.some(id=>!visit(id)))issues.push(issue('/requiredSlots','Slot dependencies must be known and acyclic.'));
    for(const slot of slots)if(new Set(slot.seats.map(seat=>seat.seatId)).size!==slot.seats.length||(slot.selectionMode==='ANY'&&slot.seats.length!==1))issues.push(issue('/requiredSlots','ANY uses one seat; ALL seats must be unique.'));
  }
  if (name === 'DecisionRecord') {
    const decision=value as DecisionRecord,responded=['Approved','Rejected'].includes(decision.status);
    for(const field of ['respondedBy','responsibilityRef','decisionGrantRefs','submission','decidedAt'] as const)if(responded!==Object.hasOwn(decision,field))issues.push(issue('/'+field,'Decision response evidence must match its terminal status.'));
    if(decision.submission&&(decision.status!==decision.submission.response||decision.submission.packageDigest!==decision.package.packageDigest))issues.push(issue('/submission','Response must bind the exact displayed package.'));
  }
  if (name === 'CommitmentRecord') {
    const commitment=value as CommitmentRecord;
    const key=(amount:string)=>{const [integer,fraction='']=amount.split('.');return integer!.padStart(26,'0')+fraction.padEnd(12,'0');};
    if(key(commitment.remaining)>key(commitment.upperBound))issues.push(issue('/remaining','Remaining liability cannot exceed its bound.'));
    if(commitment.status==='Closed'&&!/^0(?:\.0+)?$/.test(commitment.remaining))issues.push(issue('/remaining','Closed commitments cannot retain liability.'));
  }
  if (name === 'SettlementRecord') {
    const settlement=value as SettlementRecord;
    if(!settlement.commitmentDelta.startsWith('-')&&!/^0(?:\.0+)?$/.test(settlement.commitmentDelta))issues.push(issue('/commitmentDelta','Settlement cannot increase commitment.'));
  }
  if (name === 'ReleaseRecord') {
    const release=value as ReleaseRecord;
    if(new Set(release.assets.map(asset=>asset.behaviorSlot)).size!==release.assets.length) issues.push(issue('/assets','Each release slot must be unique.'));
  }
  if (name === 'StaticAssignmentRecord') {
    const assignment=value as StaticAssignmentRecord;
    if(!['Active','Paused','Retired'].includes(assignment.status)) issues.push(issue('/status','Static assignments cannot declare experimental modes.'));
    if((assignment.status!=='Active' && assignment.selectable)||(assignment.status==='Paused' && assignment.executionAllowed)) issues.push(issue('/status','Stopped assignments cannot admit new work.'));
  }
  if (name === 'WorkspaceRecord') {
    const workspace=value as WorkspaceRecord;
    const ids=workspace.participantOrganizationRefs.map(ref=>ref.id);
    if (!ids.includes(workspace.resourceOrganizationId) || new Set(ids).size!==ids.length) issues.push(issue('/participantOrganizationRefs','Workspace participants must uniquely include its resource organization.'));
  }
  if (name === 'OrganizationRecord') {
    const organization = value as OrganizationRecord;
    if (organization.organizationRef.id !== organization.resourceOrganizationId) issues.push(issue('/resourceOrganizationId', 'Organization must own its record.'));
  }
  if (name === 'GrantRecord') {
    const grant = value as GrantRecord;
    if (instant(grant.validFrom) >= instant(grant.validUntil)) issues.push(issue('/validUntil', 'Grant validity must be increasing.'));
  }
  if (name === 'LedgerRecord') {
    const ledger = value as LedgerRecord;
    if (ledger.meteringMode === 'capacity' && [ledger.confirmedUsage,ledger.openCommitment].some(amount=>!/^0(?:\.0+)?$/.test(amount))) issues.push(issue('/meteringMode', 'Capacity cannot accumulate usage or commitment.'));
  }
  if (name === 'ExecutionAuthority') {
    const authority = value as ExecutionAuthority;
    if (instant(authority.validFrom) >= instant(authority.validUntil)) {
      issues.push(issue('/validUntil', 'Authority must have a finite, increasing validity interval.'));
    }
    for (const field of ['grantRefs', 'allowedProposerRefs', 'scopeRefs', 'purposeRefs'] as const) {
      const identities = authority[field].map(ref => `${ref.type}:${ref.id}`);
      if (new Set(identities).size !== identities.length) {
        issues.push(issue(`/${field}`, 'An identity may only appear once in this reference set.'));
      }
    }
  }
  if (name === 'PinSet') {
    const pins = (value as PinSet).pins;
    if (new Set(pins.map(pin => pin.behaviorSlot)).size !== pins.length) {
      issues.push(issue('/pins', 'Each behavior slot must have exactly one pin.'));
    }
  }
  if (name === 'DevelopmentConfig' || name === 'ResolvedDevelopmentConfig') {
    const { database, runtime } = value as DevelopmentConfig;
    if ((database.lockTimeoutMs ?? 1000) > (database.statementTimeoutMs ?? 5000)) {
      issues.push(issue('/database/lockTimeoutMs', 'Lock timeout cannot exceed statement timeout.'));
    }
    if (database.runtimeUrlRef === database.queueUrlRef) issues.push(issue('/database/queueUrlRef', 'Runtime and queue must use distinct credential references.'));
    if ((runtime.reconciliation?.initialDelaySeconds ?? 5) > (runtime.reconciliation?.maxDelaySeconds ?? 300)) issues.push(issue('/runtime/reconciliation/maxDelaySeconds', 'Maximum reconciliation delay cannot precede the initial delay.'));
  }
  if (name === 'ActionRecord') {
    const action = value as ActionRecord;
    if (action.runRef && !action.missionRef) issues.push(issue('/missionRef', 'A Run requires its verified Mission source.'));
    if (action.executionAuthorityRef && action.executionAuthorityRef.type !== (action.missionRef ? 'abh.mission-authority' : 'abh.execution-authority')) {
      issues.push(issue('/executionAuthorityRef', 'Authority kind must match the Action source.'));
    }
    if (['Authorized', 'Executing', 'Reconciling', 'Closed'].includes(action.position.lifecycle)) {
      for (const field of ['executionAuthorityRef', 'pinSetRef', 'planRef'] as const) if (!action[field]) issues.push(issue(`/${field}`, 'Execution requires fixed authority, versions and plan.'));
    }
  }
  if (name === 'OperationPlan') issues.push(...inspectPlan(value as OperationPlan));
  if (name === 'ImpactUpperBound') {
    const impact = value as ImpactUpperBound;
    if (new Set(impact.maxMoney.map(money => money.currency)).size !== impact.maxMoney.length) issues.push(issue('/maxMoney', 'A currency must have a single explicit upper bound.'));
    if (new Set(impact.resourceRequirements.map(item => identity(item.resourceRef))).size !== impact.resourceRequirements.length) issues.push(issue('/resourceRequirements', 'A resource must have a single explicit upper bound.'));
  }
  if (name === 'DecisionPackage' && new TextEncoder().encode(JSON.stringify(value)).byteLength > 65_536) {
    issues.push(issue('', 'Decision packages cannot exceed 64 KiB.'));
  }
  if (name === 'DecisionEffectSummary') {
    const effect = value as DecisionEffectSummary;
    if (effect.status === 'Applied' && !effect.receiptRef) issues.push(issue('/receiptRef', 'Applied effects require an Owner receipt.'));
    if (['Blocked', 'Abandoned'].includes(effect.status) && !effect.failureRef) issues.push(issue('/failureRef', 'Blocked or abandoned effects require failure evidence.'));
  }
  if (name === 'DecisionSubmittedResponse') {
    const result = (value as DecisionSubmittedResponse).data;
    if (result.status === 'Rejected' && result.effectTrackingRefs.length) issues.push(issue('/data/effectTrackingRefs', 'A rejected decision cannot create approval effects.'));
  }
  if (name === 'EventEnvelope') {
    const event = value as EventEnvelope;
    issues.push(...inspectTenantRelationship(event));
    if (event.aggregateVersion !== event.aggregateRef.version) issues.push(issue('/aggregateVersion', 'Event and aggregate versions must agree.'));
  }
  if(name==='AcceptPackInspectionDeliveryCommand'&&(value as {type?:string}).type==='abh.pack-inspection-jobs.accept-delivery'){
    const command=value as AcceptPackInspectionDeliveryCommand;
    if(command.target.id!==command.payload.jobRef.id)issues.push(issue('/target','Delivery acceptance target must match the exact source Job.'));
  }
  if (name === 'JobEnvelope') {
    const job = value as JobEnvelope;
    const targetTypes = { 'abh.action.advance': 'abh.action', 'abh.operation.reconcile': 'abh.operation', 'abh.operation.notify-wait': 'abh.operation', 'abh.decision.apply-effect': 'abh.decision', 'abh.pack-inspection-job.advance':'abh.pack-inspection-job' };
    if (job.targetRef.type !== targetTypes[job.jobType]) issues.push(issue('/targetRef', 'Job target must match its registered Owner.'));
    if (instant(job.notBefore) >= instant(job.deadline)) issues.push(issue('/deadline', 'Job deadline must follow its earliest execution time.'));
    if(job.jobType==='abh.pack-inspection-job.advance'){
      if(job.authorityRef)issues.push(issue('/authorityRef','Inspection delivery does not carry Mission or execution authority; the Owner requires current management Grants.'));
      if(job.causeRef.type!=='abh.event'||job.causeRef.version!==1)issues.push(issue('/causeRef','Inspection advancement must reference a committed lifecycle event.'));
      if(job.commandRef.version!==1)issues.push(issue('/commandRef','Inspection delivery references the original lifecycle command.'));
    }
    if (job.jobType === 'abh.operation.reconcile' && !job.authorityRef) issues.push(issue('/authorityRef', 'Reconciliation requires an explicit query authority reference.'));
  }
  if (name === 'VerifiedIdentity') {
    const identity = value as VerifiedIdentity;
    if (instant(identity.verifiedAt) >= instant(identity.expiresAt)) issues.push(issue('/expiresAt', 'Identity evidence must have an increasing validity interval.'));
    if ((identity.identityKind === 'Service') !== (identity.authnStrength.level === 'Workload')) issues.push(issue('/authnStrength', 'Authentication strength must match the verified identity kind.'));
  }
  if (name === 'EnqueueJobRequest') {
    const request = value as EnqueueJobRequest;
    if (identity(request.context.target.objectRef) !== identity(request.job.targetRef)) issues.push(issue('/job/targetRef', 'Job and call target must refer to the same versioned object.'));
  }
  if (['ScheduleWakeupRequest','CancelWakeupRequest','SignalWaitRequest','InspectDeliveryRequest','PutObjectRequest','ReadObjectRequest','StatObjectRequest','DeleteObjectRequest'].includes(name)) {
    const request = value as ScheduleWakeupRequest | CancelWakeupRequest | SignalWaitRequest | InspectDeliveryRequest | PutObjectRequest | ReadObjectRequest | StatObjectRequest;
    const target = 'ownerRef' in request ? request.ownerRef : 'waitRef' in request ? request.waitRef : 'subjectRef' in request ? request.subjectRef : 'stagedArtifactRef' in request ? request.stagedArtifactRef : request.objectRef;
    if (identity(request.context.target.objectRef) !== identity(target)) issues.push(issue('/context/target/objectRef', 'Port target must match the requested resource version.'));
    if ('expectedVersion' in request && request.expectedVersion !== request.waitRef.version) issues.push(issue('/expectedVersion', 'CAS version must agree with the Wait reference.'));
  }
  if (name === 'ReadObjectRequest' || name === 'ReadObjectDescriptor') {
    const descriptor = value as ReadObjectRequest | ReadObjectDescriptor;
    if (descriptor.range) {
      if (descriptor.range.start > descriptor.range.endInclusive) issues.push(issue('/range', 'Byte range must be increasing.'));
      if ('object' in descriptor && descriptor.range.endInclusive >= descriptor.object.sizeBytes) issues.push(issue('/range/endInclusive', 'Byte range must remain inside the stored object.'));
    }
  }
  if (name === 'DrainReport') {
    const report = value as DrainReport;
    if (report.drained !== (report.remainingRefs.length === 0)) issues.push(issue('/drained', 'Drain completion must agree with remaining work.'));
  }
  return issues;
}

const identity = (ref: { type: string; id: string; version: number }) => `${ref.type}:${ref.id}:${ref.version}`;
const capabilityIdentity = (ref: { kind: string; id: string; version: string; digest: string }) => `${ref.kind}:${ref.id}:${ref.version}:${ref.digest}`;

function inspectPlan(plan: OperationPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = new Map(plan.nodes.map(node => [node.nodeKey, node]));
  if (nodes.size !== plan.nodes.length) return [issue('/nodes', 'Plan node keys must be unique.')];
  const connectors = new Set(plan.connectorRefs.map(capabilityIdentity));
  const scopes = new Set(plan.impactUpperBound.scopeRefs.map(identity));
  const pending = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const [i, node] of plan.nodes.entries()) {
    const path = `/nodes/${i}`;
    if (!connectors.has(capabilityIdentity(node.connectorRef))) issues.push(issue(`${path}/connectorRef`, 'Node connector must be in the fixed plan capability set.'));
    if (node.scopeRefs.some(ref => !scopes.has(identity(ref)))) issues.push(issue(`${path}/scopeRefs`, 'Node scopes must stay inside the declared plan scope.'));
    if (new Set(node.inputBindings.map(binding => binding.inputPath)).size !== node.inputBindings.length) issues.push(issue(`${path}/inputBindings`, 'An input can have only one parent output binding.'));
    for (const binding of node.inputBindings) if (!node.dependsOn.includes(binding.parentNodeKey)) issues.push(issue(`${path}/inputBindings`, 'Parent output bindings require an explicit dependency.'));
    pending.set(node.nodeKey, node.dependsOn.length);
    for (const parent of node.dependsOn) {
      if (!nodes.has(parent)) issues.push(issue(`${path}/dependsOn`, 'Plan dependency must reference an existing node.'));
      const list = children.get(parent) ?? [];
      list.push(node.nodeKey);
      children.set(parent, list);
    }
  }
  const ready = [...pending].filter(([, count]) => count === 0).map(([key]) => key);
  for (let i = 0; i < ready.length; i++) for (const child of children.get(ready[i]!) ?? []) {
    const remaining = pending.get(child)! - 1;
    pending.set(child, remaining);
    if (remaining === 0) ready.push(child);
  }
  if (ready.length !== nodes.size) issues.push(issue('/nodes', 'Plan dependencies must form a complete acyclic graph.'));
  return issues;
}

export function inspectRelationships(name: string, value: unknown): ValidationIssue[] {
  const issues = inspectLocal(name, value);
  walkShape(shapes[name]!, value, '', (child, input, path) => {
    issues.push(...inspectLocal(child, input).map(item => ({ ...item, path: `${path}${item.path}` })));
  }, (items, path) => {
    // A versioned reference set must not carry two versions of the same identity.
    const identities = items.map(item => {
      if (!item || typeof item !== 'object') return undefined;
      const ref = item as Record<string, unknown>;
      return typeof ref.id === 'string' && typeof (ref.type ?? ref.kind) === 'string' ? `${ref.type ?? ref.kind}:${ref.id}` : undefined;
    }).filter((id): id is string => id !== undefined);
    if (new Set(identities).size !== identities.length) issues.push(issue(path, 'An identity may only appear once in this reference set.'));
  });
  return [...new Map(issues.map(item => [`${item.path}:${item.message}`, item])).values()];
}
