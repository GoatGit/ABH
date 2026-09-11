import type {EntityRef,RevokeResponsibilityPayload,ResponsibilityAssignmentRecord,ResponsibilityRequestRecord} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,appendChange,type CommandIdentity} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {currentResponsibility} from './responsibilities.ts';

export interface ResponsibilityRevocationChecks {
  /** Declare all management, candidate qualification and domain continuity fences before locking. */
  fenceRefs(tx:TenantTransaction,input:RevokeResponsibilityPayload):Promise<EntityRef[]>;
  /** Current management rights, evidence, replacement policy and required duties beyond open Requests. Never optional. */
  continuity(tx:TenantTransaction,assignment:ResponsibilityAssignmentRecord,input:RevokeResponsibilityPayload):Promise<void>;
  /** Current approval Grant, subject policy and separation of duties for a surviving frozen candidate. */
  candidate(tx:TenantTransaction,assignment:ResponsibilityAssignmentRecord,request:ResponsibilityRequestRecord):Promise<boolean>;
}
const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id&&a.version===b.version;

/** Called only after current management admission and all declared fences are held in this UoW. */
export async function revokeResponsibility(tx:TenantTransaction,command:CommandIdentity,input:RevokeResponsibilityPayload,checks:ResponsibilityRevocationChecks):Promise<EntityRef>{
  contract('RevokeResponsibilityPayload',input);const c=tx.context.tenant,sql=tx.owner('HumanGateway'),reference=input.assignmentRef;
  const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},reference]);
  if(fences.some(f=>f.scopeRef.type==='abh.organization'&&f.stopFlag))throw new CoreError('EPOCH_REVOKED');
  const [row]=await sql`SELECT record,version,status,workspace_id FROM human.responsibilities WHERE resource_organization_id=${c.resourceOrganizationId}
    AND id=${reference.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==reference.version)throw new CoreError('VERSION_CONFLICT');
  const assignment=contract('ResponsibilityAssignmentRecord',row.record);
  if(!same(assignment.responsibilityRef,reference)||assignment.status!==row.status||assignment.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
  if(row.status!=='Active')throw new CoreError('AUTHORITY_REQUIRED');
  if(input.replacementRef){
    if(input.replacementRef.id===reference.id)throw new CoreError('INVALID_ARGUMENT');
    const replacement=await currentResponsibility(tx,input.replacementRef);
    const [scope]=await sql`SELECT workspace_id FROM human.responsibilities WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.replacementRef.id}`;
    if(!replacement||!scope||scope.workspace_id!==null&&scope.workspace_id!==row.workspace_id||replacement.responsibilityType!==assignment.responsibilityType
      ||assignment.scopeRefs.some(ref=>!replacement.scopeRefs.some(candidate=>same(ref,candidate)))||Date.parse(replacement.validUntil)<Date.parse(assignment.validUntil))throw new CoreError('LAST_REQUIRED_RESPONSIBILITY');
  }
  // Organization-scoped assignments can support Requests in multiple Workspaces. Hidden dependencies fail closed;
  // the installed governance must arrange a legal route before revocation, never silently replace frozen seats.
  const requests=await sql`SELECT record,workspace_id,purpose_names FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId}
    AND status IN ('Open','Unresolved') AND expires_at>clock_timestamp() AND deleted_at IS NULL
    AND record->'requiredSlots' @> ${JSON.stringify([{seats:[{responsibilityRefs:[reference]}]}])}::text::jsonb`;
  for(const row of requests){
    const request=contract('ResponsibilityRequestRecord',row.record);
    for(const slot of request.requiredSlots.filter(slot=>slot.required))for(const seat of slot.seats){
      if(!seat.responsibilityRefs.some(ref=>same(ref,reference)))continue;
      if(row.workspace_id&&row.workspace_id!==c.workspaceId||!row.purpose_names.includes(c.purposeOfUse))throw new CoreError('LAST_REQUIRED_RESPONSIBILITY');
      let survives=false;
      for(const candidateRef of seat.responsibilityRefs){
        if(candidateRef.id===reference.id)continue;
        // A survivor must cover the Request, not only the caller Workspace.
        const candidate=await currentResponsibility(tx,candidateRef,row.workspace_id);
        if(candidate&&candidate.responsibilityType===slot.responsibilityType&&slot.responsibleOrganizationId===c.resourceOrganizationId
          &&candidate.scopeRefs.some(scope=>scope.type==='abh.organization'&&scope.id===c.resourceOrganizationId||same(scope,request.subjectRef))
          &&await checks.candidate(tx,candidate,request)){survives=true;break;}
      }
      if(!survives)throw new CoreError('LAST_REQUIRED_RESPONSIBILITY');
    }
  }
  await checks.continuity(tx,assignment,input);
  const next=contract('ResponsibilityAssignmentRecord',{...assignment,responsibilityRef:{...reference,version:reference.version+1},status:'Revoked'});
  const changed=await sql`UPDATE human.responsibilities SET status='Revoked',version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${reference.id} AND version=${reference.version} AND status='Active' RETURNING id`;
  if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  await sql`INSERT INTO human.responsibility_revocations(resource_organization_id,id,workspace_id,purpose_names,assignment_id,assignment_version,record)
    VALUES (${c.resourceOrganizationId},${command.commandId},${row.workspace_id},${[c.purposeOfUse]},${reference.id},${reference.version},${JSON.stringify(input)}::text::jsonb)`;
  const fence=fences.find(f=>f.scopeRef.type===reference.type&&f.scopeRef.id===reference.id)!;
  const advanced=await tx.owner('Control')`UPDATE control.fences SET epoch=epoch+1,version=version+1,stop_flag=true,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fence.fenceRef.id} AND version=${fence.fenceRef.version} RETURNING version`;
  if(!advanced[0])throw new CoreError('VERSION_CONFLICT');
  const fenceRef={...fence.fenceRef,version:Number(advanced[0].version)};
  await appendChange(tx,{command,target:next.responsibilityRef,eventType:'abh.responsibility-assignment.revoked',changedFields:['status'],relatedRefs:[fenceRef,...input.evidenceRefs,...(input.replacementRef?[input.replacementRef]:[])]});
  await appendChange(tx,{command,target:fenceRef,eventType:'abh.fence.advanced',changedFields:['epoch','stopFlag'],relatedRefs:[next.responsibilityRef]});
  return next.responsibilityRef;
}

export async function revokeResponsibilityAssignment(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  input:RevokeResponsibilityPayload,grantRefs:readonly EntityRef[],checks:ResponsibilityRevocationChecks){
  contract('RevokeResponsibilityPayload',input);
  if(command.type!=='abh.responsibilities.revoke'||command.digest!==await inputDigest(input))throw new CoreError('INVALID_ARGUMENT');
  const payload=structuredClone(input),grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},payload.assignmentRef,...(payload.replacementRef?[payload.replacementRef]:[]),...grants,...await checks.fenceRefs(tx,payload)]);
      await assertCurrentGrants(tx,{objectRef:payload.assignmentRef,scopeRefs:[scope],action:command.type},grants);
    },()=>revokeResponsibility(tx,command,payload,checks));
    return {assignmentRef:result.receipt.resultRef,replayed:result.replayed};
  });
}
