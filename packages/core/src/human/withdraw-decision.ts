import type {DecisionRecord,EntityRef,ResponsibilityRequestRecord,WithdrawDecisionPayload} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner} from './decisions.ts';

export interface DecisionWithdrawalChecks {
  fenceRefs(tx:TenantTransaction,request:ResponsibilityRequestRecord):Promise<EntityRef[]>;
  /** Current subject-management permission and evidence visibility, including historical Command replay. */
  admit(tx:TenantTransaction,request:ResponsibilityRequestRecord,payload:WithdrawDecisionPayload):Promise<void>;
  /** Lock the actual source aggregate in canonical order before the Human Request lock. */
  lockSubject(tx:TenantTransaction,request:ResponsibilityRequestRecord):Promise<void>;
  /** Re-read actual cancelled/replaced subject under those locks; free text is never proof of withdrawal. */
  source(tx:TenantTransaction,request:ResponsibilityRequestRecord):Promise<EntityRef[]>;
}

/** Withdraw the original matter's pending request through a Pending Decision; historical responses are immutable. */
export async function withdrawPendingDecision(tx:TenantTransaction,command:CommandIdentity,decisionRef:EntityRef,payload:WithdrawDecisionPayload,checks:DecisionWithdrawalChecks):Promise<DecisionRecord>{
  contract('DecisionRef',decisionRef);contract('WithdrawDecisionPayload',payload);
  const owner=new DecisionOwner(),first=await owner.getDecision(tx,decisionRef.id),initial=await owner.getRequest(tx,first.package.requestRef.id),c=tx.context.tenant,sql=tx.owner('HumanGateway');
  const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
  if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
  await checks.lockSubject(tx,initial);
  await tx.lock(4,`${c.resourceOrganizationId}/HumanGateway/abh.responsibility-request/${initial.requestRef.id}`,()=>sql`SELECT id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${initial.requestRef.id} FOR UPDATE`);
  const decision=await owner.getDecision(tx,decisionRef.id),request=await owner.getRequest(tx,initial.requestRef.id);
  if(request.subjectRef.type!==initial.subjectRef.type||request.subjectRef.id!==initial.subjectRef.id||request.subjectRef.version!==initial.subjectRef.version||request.proposalDigest!==initial.proposalDigest)throw new CoreError('VERSION_CONFLICT');
  if(decision.decisionRef.version!==decisionRef.version)throw new CoreError('VERSION_CONFLICT');
  if(decision.status!=='Pending'||request.status!=='Open'||request.routeRevision!==decision.package.routeRevision
    ||request.subjectRef.type!==decision.package.subjectRef.type||request.subjectRef.id!==decision.package.subjectRef.id||request.subjectRef.version!==decision.package.subjectRef.version||request.proposalDigest!==decision.package.proposalDigest)throw new CoreError('DECISION_STALE');
  const [clock]=await sql`SELECT clock_timestamp() AS now`;
  if(Date.parse(request.expiresAt)<=clock!.now.getTime()||Date.parse(decision.package.validUntil)<=clock!.now.getTime())throw new CoreError('DECISION_STALE');
  const evidenceRefs=await checks.source(tx,request);
  const proof=contract('DecisionWithdrawalRecord',{commandRef:{type:'abh.command',id:command.commandId,version:1},requestRef:request.requestRef,decisionRef:decision.decisionRef,reason:payload.reason,evidenceRefs,recordedAt:clock!.now.toISOString()});
  const rows=await sql`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${request.requestRef.id}
    AND route_revision=${request.routeRevision} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id`;
  const current=rows.map(row=>{const record=contract('DecisionRecord',row.record);
    if(record.status!==row.status||record.decisionRef.version!==Number(row.version)||record.package.requestRef.id!==request.requestRef.id||record.package.routeRevision!==request.routeRevision
      ||!request.decisionRefs.some(ref=>ref.type===record.decisionRef.type&&ref.id===record.decisionRef.id))throw new CoreError('INTERNAL_ERROR');return record;});
  if(current.length!==request.decisionRefs.length||!current.some(d=>d.decisionRef.id===decisionRef.id))throw new CoreError('INTERNAL_ERROR');
  const updated:DecisionRecord[]=[];
  for(const previous of current){
    if(previous.status!=='Pending'){updated.push(previous);continue;}
    const next=contract('DecisionRecord',{...previous,decisionRef:{...previous.decisionRef,version:previous.decisionRef.version+1},status:'Withdrawn'});
    const changed=await sql`UPDATE human.decisions SET status='Withdrawn',version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.decisionRef.id} AND version=${previous.decisionRef.version} AND status='Pending' RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');updated.push(next);
    await appendChange(tx,{command,target:next.decisionRef,eventType:'abh.decision.withdraw',changedFields:['status'],relatedRefs:[request.requestRef,proof.commandRef,...proof.evidenceRefs]});
  }
  const withdrawn=contract('ResponsibilityRequestRecord',{...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},status:'Withdrawn',decisionRefs:updated.map(d=>d.decisionRef)});
  const changed=await sql`UPDATE human.requests SET status='Withdrawn',version=version+1,record=${JSON.stringify(withdrawn)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id} AND version=${request.requestRef.version} RETURNING id,workspace_id`;
  if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  await sql`INSERT INTO human.decision_withdrawals(resource_organization_id,id,workspace_id,purpose_names,request_id,decision_id,record)
    VALUES (${c.resourceOrganizationId},${command.commandId},${changed[0].workspace_id},${[c.purposeOfUse]},${request.requestRef.id},${decisionRef.id},${JSON.stringify(proof)}::text::jsonb)`;
  await appendChange(tx,{command,target:withdrawn.requestRef,eventType:'abh.responsibility-request.withdraw',changedFields:['status','decisionRefs'],relatedRefs:[proof.commandRef,...proof.evidenceRefs]});
  return updated.find(d=>d.decisionRef.id===decisionRef.id)!;
}

export async function withdrawDecision(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,decisionRef:EntityRef,
  payload:WithdrawDecisionPayload,grantRefs:readonly EntityRef[],checks:DecisionWithdrawalChecks){
  contract('DecisionRef',decisionRef);contract('WithdrawDecisionPayload',payload);
  if(command.type!=='abh.decisions.withdraw'||command.digest!==await inputDigest({decisionRef,payload}))throw new CoreError('INVALID_ARGUMENT');
  const reference={...decisionRef},input=structuredClone(payload),grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{
      const owner=new DecisionOwner(),decision=await owner.getDecision(tx,reference.id),request=await owner.getRequest(tx,decision.package.requestRef.id);
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await checks.fenceRefs(tx,request)]);
      await assertCurrentGrants(tx,{objectRef:reference,scopeRefs:[scope],action:command.type},grants);await checks.admit(tx,request,input);
    },async()=>(await withdrawPendingDecision(tx,command,reference,input,checks)).decisionRef);
    const decisionRef=contract('DecisionRef',result.receipt.resultRef);
    if(decisionRef.id!==reference.id)throw new CoreError('INTERNAL_ERROR');
    return {decisionRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
  });
}
