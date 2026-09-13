import { randomUUID } from 'node:crypto';
import type { CapabilityRef, ConfigureStaticReleasePayload, EntityRef, ExecutionPin, ListAssignmentsQuery, PinSet,
  ResolveAndPinRequest, RollbackStaticAssignmentPayload, StaticAssignmentRecord } from '@abh/contracts';
import { canonicalJson, digestCommandIntent, digestContract, digestRequiredSlots, checkPinInput } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { appendChange, contract, executeCommand, type CommandIdentity } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import {lifecyclePurposes} from '../data/purposes.ts';

const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id;
const exact=(a:EntityRef,b:EntityRef)=>canonicalJson(a)===canonicalJson(b);
const evidenceSet=(values:readonly EntityRef[])=>values.map(value=>canonicalJson(value)).sort();
/** Static Release/Assignment only. Caller verifies installation, gates, current preparation and governance authority. */
export class StaticReleaseOwner {
  async #selectionFence(tx:TenantTransaction):Promise<void> {
    const c=tx.context.tenant;
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
    if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
  }
  async configure(tx:TenantTransaction,command:CommandIdentity,input:ConfigureStaticReleasePayload):Promise<EntityRef> {
    contract('ConfigureStaticReleasePayload',input);
    const release=contract('ReleaseRecord',input.release),assignment=contract('StaticAssignmentRecord',input.assignment),c=tx.context.tenant;
    const purposeNames=lifecyclePurposes(input.purposeNames??[c.purposeOfUse],c.purposeOfUse);
    if(release.resourceOrganizationId!==c.resourceOrganizationId || assignment.resourceOrganizationId!==c.resourceOrganizationId
      || release.releaseRef.version!==1 || release.status!=='Ready' || assignment.assignmentRef.version!==1 || assignment.status!=='Active'
      || !assignment.selectable || !assignment.executionAllowed || !same(assignment.releaseRef,release.releaseRef) || assignment.releaseRef.version!==1)throw new CoreError('INVALID_ARGUMENT');
    if(assignment.scopeTier!=='Organization'||assignment.scopeRefs.length!==1||assignment.scopeRefs[0]!.type!=='abh.organization'||assignment.scopeRefs[0]!.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    await this.#selectionFence(tx);
    const sql=tx.owner('CapabilityRelease');
    // Baseline materializes Draft → Ready atomically after caller checks the required gates.
    const draft={...release,status:'Draft' as const};
    await sql`INSERT INTO release.releases(resource_organization_id,id,workspace_id,purpose_names,status,record) VALUES (${c.resourceOrganizationId},${release.releaseRef.id},${c.workspaceId??null},${purposeNames},'Draft',${JSON.stringify(draft)}::text::jsonb)`;
    await appendChange(tx,{command,target:draft.releaseRef,eventType:'abh.release.created',changedFields:['status','assets']});
    const ready=contract('ReleaseRecord',{...release,releaseRef:{...release.releaseRef,version:2}});
    await sql`UPDATE release.releases SET status='Ready',version=2,record=${JSON.stringify(ready)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${release.releaseRef.id} AND version=1`;
    await appendChange(tx,{command,target:ready.releaseRef,eventType:'abh.release.ready',changedFields:['status'],relatedRefs:release.gateRefs});
    const assigned=contract('StaticAssignmentRecord',{...assignment,releaseRef:ready.releaseRef});
    await sql`INSERT INTO release.assignments(resource_organization_id,id,workspace_id,purpose_names,release_id,status,selectable,execution_allowed,record)
      VALUES (${c.resourceOrganizationId},${assigned.assignmentRef.id},${c.workspaceId??null},${purposeNames},${ready.releaseRef.id},'Active',true,true,${JSON.stringify(assigned)}::text::jsonb)`;
    await appendChange(tx,{command,target:assigned.assignmentRef,eventType:'abh.assignment.created',changedFields:['status','releaseRef'],relatedRefs:[ready.releaseRef]});
    return assigned.assignmentRef;
  }
  async getPinSet(tx:TenantTransaction,subject:Pick<ResolveAndPinRequest['subjectRef'],'type'|'id'>):Promise<PinSet|undefined> {
    contract('UUID',subject.id);if(!['abh.action','abh.run'].includes(subject.type))throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('CapabilityRelease')`SELECT record FROM release.pin_sets WHERE resource_organization_id=${c.resourceOrganizationId}
      AND subject_type=${subject.type} AND subject_id=${subject.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    return rows[0]?contract('PinSet',rows[0].record):undefined;
  }
  async resolveAndPin(tx:TenantTransaction,command:CommandIdentity,request:ResolveAndPinRequest):Promise<PinSet> {
    contract('ResolveAndPinRequest',request);
    const c=tx.context.tenant;
    if(request.requestContextRef.id!==c.requestId || request.verifiedScope.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId))throw new CoreError('FORBIDDEN');
    await this.#selectionFence(tx);
    const key=`${c.resourceOrganizationId}/CapabilityRelease/${request.subjectRef.type}/${request.subjectRef.id}`,sql=tx.owner('CapabilityRelease');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const existing=await this.getPinSet(tx,request.subjectRef);
    if(existing){await checkPinInput(existing,request);return existing;}
    const rows=await sql`SELECT a.record AS assignment,r.record AS release,a.purpose_names AS assignment_purposes,r.purpose_names AS release_purposes FROM release.assignments a
      JOIN release.releases r ON r.resource_organization_id=a.resource_organization_id AND r.id=a.release_id
      WHERE a.resource_organization_id=${c.resourceOrganizationId} AND a.status='Active' AND a.selectable AND a.execution_allowed
        AND r.status='Ready' AND a.deleted_at IS NULL AND r.deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(a.purpose_names) AND ${c.purposeOfUse}=ANY(r.purpose_names)
        AND (a.workspace_id IS NULL OR a.workspace_id=${c.workspaceId??null}::uuid) AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)`;
    const candidates=rows.map(row=>({assignment:contract('StaticAssignmentRecord',row.assignment),release:contract('ReleaseRecord',row.release),
      purposes:lifecyclePurposes(row.assignment_purposes,c.purposeOfUse).filter(purpose=>lifecyclePurposes(row.release_purposes,c.purposeOfUse).includes(purpose))}))
      .filter(({assignment})=>assignment.scopeRefs.every(scope=>request.verifiedScope.some(input=>same(scope,input))));
    const pins:ExecutionPin[]=[];
    let purposeNames:string[]|undefined;
    for(const slot of [...request.requiredBehaviorSlots].sort()){
      const matching=candidates.filter(({release})=>release.assets.some(asset=>asset.behaviorSlot===slot));
      if(matching.length!==1)throw new CoreError(matching.length?'ASSIGNMENT_AMBIGUOUS':'RELEASE_SCOPE_MISMATCH');
      const {assignment,release,purposes}=matching[0]!;
      purposeNames=purposeNames?purposeNames.filter(purpose=>purposes.includes(purpose)):purposes;
      pins.push({behaviorSlot:slot,assignmentRef:assignment.assignmentRef,releaseRef:release.releaseRef,
        capabilityExactRefs:release.assets.find(asset=>asset.behaviorSlot===slot)!.capabilityExactRefs,versionVector:[assignment.assignmentRef,release.releaseRef]});
    }
    const unsigned:PinSet={pinSetRef:{type:'abh.pin-set',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,subjectRef:request.subjectRef,
      subjectInputDigest:request.subjectInputDigest,requiredSlotsDigest:await digestRequiredSlots(request.requiredBehaviorSlots),digest:'sha256:'+'0'.repeat(64),pins};
    const pinSet=contract('PinSet',{...unsigned,digest:await digestContract('PinSet',unsigned)});
    await sql`INSERT INTO release.pin_sets(resource_organization_id,id,workspace_id,purpose_names,subject_type,subject_id,subject_input_digest,required_slots_digest,record)
      VALUES (${c.resourceOrganizationId},${pinSet.pinSetRef.id},${c.workspaceId??null},${purposeNames!},${request.subjectRef.type},${request.subjectRef.id},${pinSet.subjectInputDigest},${pinSet.requiredSlotsDigest},${JSON.stringify(pinSet)}::text::jsonb)`;
    await appendChange(tx,{command,target:pinSet.pinSetRef,eventType:'abh.pin-set.created',changedFields:['pins'],relatedRefs:[request.subjectRef]});
    return pinSet;
  }
  async getAssignment(tx:TenantTransaction,assignmentRef:EntityRef):Promise<StaticAssignmentRecord> {
    contract('EntityRef',assignmentRef);if(assignmentRef.type!=='abh.assignment')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('CapabilityRelease')`SELECT record,version,status,selectable,execution_allowed
      FROM release.assignments WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${assignmentRef.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('StaticAssignmentRecord',rows[0].record);
    if(!same(record.assignmentRef,assignmentRef)||record.assignmentRef.version!==Number(rows[0].version)
      ||record.resourceOrganizationId!==c.resourceOrganizationId||record.status!==rows[0].status
      ||record.selectable!==rows[0].selectable||record.executionAllowed!==rows[0].execution_allowed)
      throw new CoreError('PIN_INPUT_CONFLICT');
    return record;
  }
  async listAssignments(tx:TenantTransaction,input:ListAssignmentsQuery & {
    after?:{createdAt:string;id:string};
  }):Promise<{
    records:StaticAssignmentRecord[];counts:Record<string,number>;
    next?:{createdAt:string;id:string};
  }> {
    const {releaseId,assignmentStatus,limit=25}=contract('ListAssignmentsQuery',input),c=tx.context.tenant;
    const rows=await tx.owner('CapabilityRelease')`SELECT record,version,status,selectable,execution_allowed,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
      FROM release.assignments
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${releaseId??null}::uuid IS NULL OR release_id=${releaseId??null}::uuid)
        AND (${assignmentStatus??null}::text IS NULL OR status=${assignmentStatus??null}::text)
        AND (${input.after?.createdAt??null}::text::timestamptz IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    const page=rows.slice(0,limit),records=page.map(row=>contract('StaticAssignmentRecord',row.record));
    for(const record of records)if(record.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('PIN_INPUT_CONFLICT');
    const countRows=await tx.owner('CapabilityRelease')`SELECT status,count(*)::int AS count FROM release.assignments
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${releaseId??null}::uuid IS NULL OR release_id=${releaseId??null}::uuid)
      GROUP BY status`;
    const counts:Record<string,number>={Active:0,Paused:0};
    for(const row of countRows)counts[String(row.status)]=Number(row.count);
    const last=page.at(-1);
    return {records,counts,...(rows.length>limit&&last?{next:{createdAt:String(last.created_at),id:String(last.id)}}:{})};
  }
  async stop(tx:TenantTransaction,command:CommandIdentity,assignmentRef:EntityRef,evidence:EntityRef,reason?:string):Promise<EntityRef>{
    contract('EntityRef',assignmentRef);contract('EntityRef',evidence);if(assignmentRef.type!=='abh.assignment')throw new CoreError('INVALID_ARGUMENT');
    await this.#selectionFence(tx);const c=tx.context.tenant,sql=tx.owner('CapabilityRelease');
    const rows=await sql`SELECT record,version,status FROM release.assignments WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${assignmentRef.id} AND deleted_at IS NULL FOR UPDATE`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');if(Number(rows[0].version)!==assignmentRef.version)throw new CoreError('VERSION_CONFLICT');
    const current=contract('StaticAssignmentRecord',rows[0].record);if(current.status!=='Active')throw new CoreError('PRECONDITION_FAILED');
    const record=contract('StaticAssignmentRecord',{...current,assignmentRef:{...assignmentRef,version:assignmentRef.version+1},
      status:'Paused',selectable:false,executionAllowed:false,
      ...(reason?{stopReason:reason,stopEvidenceRef:evidence}:{})});
    await sql`UPDATE release.assignments SET record=${JSON.stringify(record)}::text::jsonb,status='Paused',selectable=false,execution_allowed=false,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${assignmentRef.id} AND version=${assignmentRef.version}`;
    await appendChange(tx,{command,target:record.assignmentRef,eventType:'abh.assignment.pause',changedFields:['status','selectable','executionAllowed'],relatedRefs:[evidence]});
    return record.assignmentRef;
  }

  async stopAssignment(database:Database,context:VerifiedContext,
    options:TransactionOptions,supplied:import('@abh/contracts').StopStaticAssignmentCommand,
    grants:readonly EntityRef[]):Promise<StaticAssignmentRecord> {
    const input=contract('StopStaticAssignmentCommand',structuredClone(supplied));
    const refs=structuredClone([...grants]);
    requireVerifiedContext(context);
    const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
      digest:await digestCommandIntent(input)};
    const assignmentRef={type:'abh.assignment' as const,id:input.target.id,version:input.expectedVersion};
    const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
      const organization={type:'abh.organization' as const,id:tx.context.tenant.resourceOrganizationId,version:1};
      await assertCurrentGrants(tx,{objectRef:assignmentRef,scopeRefs:[organization],
        action:'abh.release.manage'},refs);
    },()=>this.stop(tx,command,assignmentRef,input.payload.evidenceRef,input.payload.reason)));
    return await database.transaction(context,options,async tx=>
      await this.getAssignment(tx,{type:'abh.assignment',id:assignmentRef.id,version:result.receipt.resultRef.version}));
  }

  async rollback(tx:TenantTransaction,command:CommandIdentity,assignmentRef:EntityRef,
    input:RollbackStaticAssignmentPayload):Promise<EntityRef> {
    input=contract('RollbackStaticAssignmentPayload',structuredClone(input));
    contract('EntityRef',assignmentRef);if(assignmentRef.type!=='abh.assignment')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,sql=tx.owner('CapabilityRelease');
    await this.#selectionFence(tx);
    const rows=await sql`SELECT record,version,status,purpose_names AS assignment_purposes FROM release.assignments
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${assignmentRef.id} AND deleted_at IS NULL FOR UPDATE`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    if(Number(rows[0].version)!==assignmentRef.version)throw new CoreError('VERSION_CONFLICT');
    const current=contract('StaticAssignmentRecord',rows[0].record);
    if(current.status!=='Active'||!current.selectable||!current.executionAllowed
      ||current.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('PRECONDITION_FAILED');
    const previousRows=await sql`SELECT record,version,status FROM release.releases
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.previousReleaseRef.id}
        AND deleted_at IS NULL AND status='Ready' AND version=${input.previousReleaseRef.version}
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    const previousRow=previousRows[0];if(!previousRow)throw new CoreError('RESOURCE_NOT_FOUND');
    const previous=contract('ReleaseRecord',previousRow.record);
    if(previous.resourceOrganizationId!==c.resourceOrganizationId||!exact(previous.releaseRef,input.previousReleaseRef)
      ||previous.releaseRef.version!==Number(previousRow.version)||same(previous.releaseRef,current.releaseRef))
      throw new CoreError('PIN_INPUT_CONFLICT');
    if(evidenceSet(previous.gateRefs).join()!==evidenceSet(input.gateRefs).join()
      ||!exact(previous.compatibilityRef,input.compatibilityRef))throw new CoreError('PIN_INPUT_CONFLICT');
    for(const evidence of [...input.gateRefs,input.compatibilityRef]) {
      contract('EntityRef',evidence);
      if(evidence.type==='abh.artifact') {
        const artifacts=await tx.owner('ArtifactStore')`SELECT record,version,status FROM data.artifacts
          WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${evidence.id} AND deleted_at IS NULL
            AND status='Available' AND version=${evidence.version}
            AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
        const artifact=artifacts[0]?contract('ArtifactRecord',artifacts[0].record):undefined;
        if(!artifact||artifact.artifactRef.id!==evidence.id||artifact.artifactRef.version!==evidence.version)
          throw new CoreError('PRECONDITION_FAILED');
      } else if(evidence.type==='abh.learning-gate') {
        const gates=await tx.owner('LearningController')`SELECT record,verdict FROM core.learning_gates
          WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${evidence.id} AND deleted_at IS NULL
            AND version=${evidence.version} AND verdict='Pass'
            AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
        const gate=gates[0]?contract('EvaluationGateArtifactRecord',gates[0].record):undefined;
        if(!gate||gate.gateRef.id!==evidence.id||gate.gateRef.version!==evidence.version)
          throw new CoreError('PRECONDITION_FAILED');
      } else throw new CoreError('INVALID_ARGUMENT');
    }
    const failed={...current,assignmentRef:{...assignmentRef,version:assignmentRef.version+1},
      status:'Paused' as const,selectable:false,executionAllowed:false,stopReason:input.reason,
      stopEvidenceRef:input.gateRefs[0]!};
    const failedRecord=contract('StaticAssignmentRecord',failed);
    await sql`UPDATE release.assignments SET record=${JSON.stringify(failedRecord)}::text::jsonb,status='Paused',selectable=false,
      execution_allowed=false,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${assignmentRef.id} AND version=${assignmentRef.version}`;
    await appendChange(tx,{command,target:failedRecord.assignmentRef,eventType:'abh.assignment.rollback',
      changedFields:['status','selectable','executionAllowed','stopReason'],relatedRefs:[previous.releaseRef]});
    const evidenceRefs=[...input.gateRefs,input.compatibilityRef],replacementId=randomUUID();
    const replacement=contract('StaticAssignmentRecord',{assignmentRef:{type:'abh.assignment',id:replacementId,version:1},
      resourceOrganizationId:c.resourceOrganizationId,releaseRef:previous.releaseRef,scopeRefs:current.scopeRefs,
      scopeTier:current.scopeTier,status:'Active',selectable:true,executionAllowed:true,evidenceRefs,
      rollbackOfAssignmentRef:failedRecord.assignmentRef,rollbackFromReleaseRef:current.releaseRef});
    await sql`INSERT INTO release.assignments(resource_organization_id,id,workspace_id,purpose_names,release_id,status,selectable,execution_allowed,record)
      VALUES (${c.resourceOrganizationId},${replacementId},${c.workspaceId??null},${rows[0].assignment_purposes},${previous.releaseRef.id},
        'Active',true,true,${JSON.stringify(replacement)}::text::jsonb)`;
    await appendChange(tx,{command,target:replacement.assignmentRef,eventType:'abh.assignment.created',
      changedFields:['status','releaseRef','rollbackOfAssignmentRef'],relatedRefs:[failedRecord.assignmentRef]});
    return replacement.assignmentRef;
  }

  async rollbackAssignment(database:Database,context:VerifiedContext,
    options:TransactionOptions,supplied:import('@abh/contracts').RollbackStaticAssignmentCommand,
    grants:readonly EntityRef[]):Promise<StaticAssignmentRecord> {
    const input=contract('RollbackStaticAssignmentCommand',structuredClone(supplied));
    const refs=structuredClone([...grants]);requireVerifiedContext(context);
    const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
      digest:await digestCommandIntent(input)};
    const assignmentRef={type:'abh.assignment' as const,id:input.target.id,version:input.expectedVersion};
    const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
      const organization={type:'abh.organization' as const,id:tx.context.tenant.resourceOrganizationId,version:1};
      await assertCurrentGrants(tx,{objectRef:assignmentRef,scopeRefs:[organization],
        action:'abh.release.manage'},refs);
    },()=>this.rollback(tx,command,assignmentRef,input.payload)));
    return await database.transaction(context,options,async tx=>
      await this.getAssignment(tx,result.receipt.resultRef));
  }
  /** Exact capability admission from an actual persisted pin set. Caller still
   * checks business authority and resolves current Enabled implementation/health. */
  async requirePinnedCapability(tx:TenantTransaction,input:PinSet,request:ResolveAndPinRequest,slot:string,capability:CapabilityRef):Promise<EntityRef>{
    const pins=contract('PinSet',structuredClone(input)),query=structuredClone(request),exact=contract('CapabilityRef',structuredClone(capability));
    contract('RegisteredName',slot);
    const c=tx.context.tenant;
    if(query.requestContextRef.id!==c.requestId||query.verifiedScope.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId))throw new CoreError('FORBIDDEN');
    await this.revalidate(tx,pins,query);
    const pin=pins.pins.find(value=>value.behaviorSlot===slot);
    if(!pin||!pin.capabilityExactRefs.some(value=>canonicalJson(value)===canonicalJson(exact)))throw new CoreError('PIN_INPUT_CONFLICT');
    return structuredClone(pin.assignmentRef);
  }
  /** Historical query evidence only. A paused Assignment must not prevent
   * independently authorized reconciliation; this never authorizes dispatch. */
  async requireHistoricalQueryPin(tx:TenantTransaction,input:PinSet,request:ResolveAndPinRequest,slot:string,capability:CapabilityRef):Promise<void>{
    const pins=contract('PinSet',structuredClone(input)),query=structuredClone(request),exact=contract('CapabilityRef',structuredClone(capability)),c=tx.context.tenant;
    contract('RegisteredName',slot);
    if(c.purposeOfUse!=='abh.operation.reconcile'||c.actor.type!=='Service'||query.requestContextRef.id!==c.requestId
      ||query.verifiedScope.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId))throw new CoreError('FORBIDDEN');
    await checkPinInput(pins,query);
    if(pins.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PinSet',pins)!==pins.digest)throw new CoreError('PIN_INPUT_CONFLICT');
    const stored=await this.getPinSet(tx,query.subjectRef),pin=pins.pins.find(value=>value.behaviorSlot===slot);
    if(!stored||canonicalJson(stored)!==canonicalJson(pins)||!pin||!pin.capabilityExactRefs.some(value=>canonicalJson(value)===canonicalJson(exact)))throw new CoreError('PIN_INPUT_CONFLICT');
  }
  async revalidate(tx:TenantTransaction,pins:PinSet,request:ResolveAndPinRequest):Promise<void>{
    pins=contract('PinSet',structuredClone(pins));request=structuredClone(request);
    const c=tx.context.tenant;await checkPinInput(pins,request);await this.#selectionFence(tx);
    if(pins.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PinSet',pins)!==pins.digest)throw new CoreError('PIN_INPUT_CONFLICT');
    const stored=await this.getPinSet(tx,request.subjectRef);if(!stored||canonicalJson(stored)!==canonicalJson(pins))throw new CoreError('PIN_INPUT_CONFLICT');
    for(const pin of pins.pins){
      const rows=await tx.owner('CapabilityRelease')`SELECT a.record AS assignment,r.record AS release,a.execution_allowed,a.version AS assignment_version,a.status AS assignment_status,a.selectable,r.version AS release_version,r.status FROM release.assignments a
        JOIN release.releases r ON r.resource_organization_id=a.resource_organization_id AND r.id=a.release_id
        WHERE a.resource_organization_id=${c.resourceOrganizationId} AND a.id=${pin.assignmentRef.id} AND r.id=${pin.releaseRef.id}
          AND a.deleted_at IS NULL AND r.deleted_at IS NULL AND ${c.purposeOfUse}=ANY(a.purpose_names) AND ${c.purposeOfUse}=ANY(r.purpose_names)
          AND (a.workspace_id IS NULL OR a.workspace_id=${c.workspaceId??null}::uuid) AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)`;
      if(!rows[0]||!rows[0].execution_allowed||rows[0].status==='Revoked')throw new CoreError('RELEASE_SCOPE_MISMATCH');
      const assignment=contract('StaticAssignmentRecord',rows[0].assignment),release=contract('ReleaseRecord',rows[0].release);
      const row=rows[0]!;
      if(assignment.resourceOrganizationId!==c.resourceOrganizationId||release.resourceOrganizationId!==c.resourceOrganizationId||
        canonicalJson(assignment.assignmentRef)!==canonicalJson(pin.assignmentRef)||canonicalJson(assignment.releaseRef)!==canonicalJson(pin.releaseRef)||
        canonicalJson(release.releaseRef)!==canonicalJson(pin.releaseRef)||assignment.assignmentRef.version!==Number(row.assignment_version)||release.releaseRef.version!==Number(row.release_version)||
        assignment.executionAllowed!==row.execution_allowed||assignment.selectable!==row.selectable||assignment.status!==row.assignment_status||release.status!==row.status)throw new CoreError('PIN_INPUT_CONFLICT');
      const asset=release.assets.find(asset=>asset.behaviorSlot===pin.behaviorSlot);
      if(!asset||canonicalJson(asset.capabilityExactRefs)!==canonicalJson(pin.capabilityExactRefs))throw new CoreError('PIN_INPUT_CONFLICT');
      if(!assignment.scopeRefs.every(scope=>request.verifiedScope.some(input=>same(scope,input))))throw new CoreError('RELEASE_SCOPE_MISMATCH');
    }
  }
}
