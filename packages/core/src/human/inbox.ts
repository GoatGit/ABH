import type {DecisionRecord,EntityRef,ResponsibilityRequestRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner} from './decisions.ts';
import {currentResponsibility} from './responsibilities.ts';

export interface DecisionInboxAdmission {
  /** Current query permission, identity and policy admission, including empty pages. Declare required control fences here. */
  admit(tx:TenantTransaction):Promise<void>;
  /** Current package/evidence visibility and domain-specific restrictions. False omits a row without exposing it. */
  canRead(tx:TenantTransaction,decision:DecisionRecord,request:ResponsibilityRequestRecord):Promise<boolean>;
}
export interface DecisionInboxFilter {status?:DecisionRecord['status'];kind?:ResponsibilityRequestRecord['kind'];expiresBefore?:string;after?:string;limit?:number;}
const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id&&a.version===b.version;

/** Strong Owner reads; no projection watermark, effect status or available-action claims are synthesized here. */
export class DecisionInboxOwner {
  async #visible(tx:TenantTransaction,decision:DecisionRecord,request:ResponsibilityRequestRecord,admission:DecisionInboxAdmission):Promise<boolean>{
    const c=tx.context.tenant;
    if(c.actor.type!=='Human')throw new CoreError('FORBIDDEN');
    if(decision.status!=='Pending'){
      if(decision.respondedBy?.type!=='Human'||decision.respondedBy.id!==c.actor.id)return false;
    }else{
      const slot=request.requiredSlots.find(slot=>slot.slotId===decision.package.slotId),seat=slot?.seats.find(seat=>seat.seatId===decision.seatId);
      if(request.status!=='Open'||request.routeRevision!==decision.package.routeRevision||!slot||!seat||slot.responsibleOrganizationId!==c.resourceOrganizationId
        ||!same(request.subjectRef,decision.package.subjectRef)||request.proposalDigest!==decision.package.proposalDigest
        ||!request.decisionRefs.some(ref=>same(ref,decision.decisionRef)))return false;
      const [source]=await tx.owner('HumanGateway')`SELECT workspace_id,clock_timestamp() AS now FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id}`;
      if(!source||Date.parse(request.expiresAt)<=source.now.getTime()||Date.parse(decision.package.validUntil)<=source.now.getTime())return false;
      let eligible=false;
      for(const ref of decision.candidateResponsibilityRefs){
        if(!seat.responsibilityRefs.some(candidate=>same(candidate,ref)))continue;
        const assignment=await currentResponsibility(tx,ref,source.workspace_id);
        if(assignment&&assignment.principalRef.id===c.actor.id&&assignment.responsibilityType===slot.responsibilityType
          &&assignment.scopeRefs.some(scope=>same(scope,request.subjectRef)||scope.type==='abh.organization'&&scope.id===c.resourceOrganizationId)){eligible=true;break;}
      }
      if(!eligible)return false;
    }
    return admission.canRead(tx,decision,request);
  }
  async get(tx:TenantTransaction,id:string,grantRefs:readonly EntityRef[],admission:DecisionInboxAdmission):Promise<DecisionRecord>{
    contract('UUID',id);await admission.admit(tx);const owner=new DecisionOwner(),c=tx.context.tenant;
    const decision=await owner.getDecision(tx,id),request=await owner.getRequest(tx,decision.package.requestRef.id);
    await assertCurrentGrants(tx,{objectRef:decision.decisionRef,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.decisions.read'},grantRefs);
    if(!await this.#visible(tx,decision,request,admission))throw new CoreError('RESOURCE_NOT_FOUND');return decision;
  }
  /** Cursor tracks rows scanned, not rows returned; an empty filtered page can still have a next cursor. */
  async list(tx:TenantTransaction,filter:DecisionInboxFilter,grantRefs:readonly EntityRef[],admission:DecisionInboxAdmission):Promise<{decisions:DecisionRecord[];nextCursor?:string}>{
    const limit=filter.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(filter.after)contract('UUID',filter.after);if(filter.expiresBefore)contract('Time',filter.expiresBefore);
    if(filter.status&&!['Pending','Approved','Rejected','Expired','Superseded','Withdrawn'].includes(filter.status))throw new CoreError('INVALID_ARGUMENT');
    if(filter.kind&&!['Goal','Authorization','Correction','Exception'].includes(filter.kind))throw new CoreError('INVALID_ARGUMENT');
    await admission.admit(tx);const c=tx.context.tenant;
    if(c.actor.type!=='Human')throw new CoreError('FORBIDDEN');
    const rows=await tx.owner('HumanGateway')`SELECT d.id FROM human.decisions d JOIN human.requests r ON r.resource_organization_id=d.resource_organization_id AND r.id=d.request_id
      WHERE d.resource_organization_id=${c.resourceOrganizationId} AND d.deleted_at IS NULL AND r.deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(d.purpose_names) AND ${c.purposeOfUse}=ANY(r.purpose_names)
      AND (d.workspace_id IS NULL OR d.workspace_id=${c.workspaceId??null}::uuid) AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
      AND (${filter.status??null}::text IS NULL OR d.status=${filter.status??null})
      AND (${filter.kind??null}::text IS NULL OR r.record->>'kind'=${filter.kind??null})
      AND (${filter.expiresBefore??null}::timestamptz IS NULL OR d.valid_until<=${filter.expiresBefore??null}::timestamptz)
      AND (${filter.after??null}::uuid IS NULL OR d.id>${filter.after??null}::uuid)
      AND (d.record->'respondedBy'->>'id'=${c.actor.id} OR d.status='Pending' AND EXISTS (
        SELECT 1 FROM human.responsibilities a WHERE a.resource_organization_id=d.resource_organization_id AND a.principal_id=${c.actor.id}
          AND d.record->'candidateResponsibilityRefs' @> jsonb_build_array(jsonb_build_object('type','abh.responsibility-assignment','id',a.id::text,'version',a.version))))
      ORDER BY d.id LIMIT ${limit}`;
    // Each visible object must pass current Grant admission; projection filtering never grants read access.
    const decisions:DecisionRecord[]=[];
    for(const row of rows){
      try{decisions.push(await this.get(tx,row.id,grantRefs,admission));}
      catch(error){if(error instanceof CoreError&&error.code==='RESOURCE_NOT_FOUND')continue;throw error;}
    }
    return {decisions,...(rows.length===limit?{nextCursor:rows.at(-1)!.id}:{})};
  }
}
