import {randomUUID} from 'node:crypto';
import type {ReviseResponsibilityRoutePayload,DecisionPackage,DecisionRecord,EntityRef,OpenResponsibilityRequestPayload,RequestCompletionEvidence,ResponsibilityAssignmentRecord,ResponsibilityRequestRecord,SubmitDecisionPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from '../control/fences.ts';
import {currentResponsibility} from './responsibilities.ts';

/** Eligibility callbacks must check current Grants, separation of duties and subject evidence in this transaction. */
export interface DecisionEligibility {
  lock(tx:TenantTransaction,request:ResponsibilityRequestRecord):Promise<void>;
  candidate(tx:TenantTransaction,assignment:ResponsibilityAssignmentRecord,request:ResponsibilityRequestRecord):Promise<boolean>;
  submit(tx:TenantTransaction,decision:DecisionRecord,assignment:ResponsibilityAssignmentRecord,request:ResponsibilityRequestRecord,submission:SubmitDecisionPayload):Promise<EntityRef[]>;
  revalidate(tx:TenantTransaction,decision:DecisionRecord,request:ResponsibilityRequestRecord):Promise<void>;
  conditions(tx:TenantTransaction,decisions:readonly DecisionRecord[]):Promise<EntityRef[]>;
}
const identity=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id;
const exact=(a:EntityRef,b:EntityRef)=>identity(a,b)&&a.version===b.version;
export class DecisionOwner {
  async getRequest(tx:TenantTransaction,id:string):Promise<ResponsibilityRequestRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ResponsibilityRequestRecord',rows[0].record);
    if(record.requestRef.version!==Number(rows[0].version)||record.status!==rows[0].status)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async getDecision(tx:TenantTransaction,id:string):Promise<DecisionRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('DecisionRecord',rows[0].record);
    if(record.decisionRef.version!==Number(rows[0].version)||record.status!==rows[0].status)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async #fence(tx:TenantTransaction):Promise<void>{
    const c=tx.context.tenant;
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
    if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
  }
  async #lockRequest(tx:TenantTransaction,id:string):Promise<void>{
    const c=tx.context.tenant,sql=tx.owner('HumanGateway');
    await tx.lock(4,`${c.resourceOrganizationId}/HumanGateway/abh.responsibility-request/${id}`,()=>sql`SELECT id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} FOR UPDATE`);
  }
  async #currentSeat(tx:TenantTransaction,decision:DecisionRecord,request:ResponsibilityRequestRecord,reference:EntityRef):Promise<ResponsibilityAssignmentRecord|undefined>{
    const slot=request.requiredSlots.find(slot=>slot.slotId===decision.package.slotId),seat=slot?.seats.find(seat=>seat.seatId===decision.seatId);
    if(!slot||!seat||!request.decisionRefs.some(ref=>identity(ref,decision.decisionRef))||!exact(request.subjectRef,decision.package.subjectRef)
      ||request.proposalDigest!==decision.package.proposalDigest||request.routeRevision!==decision.package.routeRevision
      ||!seat.responsibilityRefs.some(ref=>exact(ref,reference))||!decision.candidateResponsibilityRefs.some(ref=>exact(ref,reference)))return undefined;
    const c=tx.context.tenant;
    const [scope]=await tx.owner('HumanGateway')`SELECT workspace_id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id}`;
    if(!scope)return undefined;
    const assignment=await currentResponsibility(tx,reference,scope.workspace_id);
    return assignment&&assignment.responsibilityType===slot.responsibilityType&&slot.responsibleOrganizationId===tx.context.tenant.resourceOrganizationId
      &&assignment.scopeRefs.some(scope=>identity(scope,request.subjectRef)||scope.type==='abh.organization'&&scope.id===tx.context.tenant.resourceOrganizationId)?assignment:undefined;
  }
  /** Current frozen-seat qualification also applies to historical command replay. */
  async assertCurrentSubmitter(tx:TenantTransaction,decision:DecisionRecord,request:ResponsibilityRequestRecord):Promise<void>{
    const actor=tx.context.tenant.actor;
    if(actor.type!=='Human'||decision.respondedBy&&decision.respondedBy.id!==actor.id)throw new CoreError('DECIDER_NOT_ELIGIBLE');
    for(const reference of decision.responsibilityRef?[decision.responsibilityRef]:decision.candidateResponsibilityRefs){
      const assignment=await this.#currentSeat(tx,decision,request,reference);
      if(assignment?.principalRef.id===actor.id)return;
    }
    throw new CoreError('DECIDER_NOT_ELIGIBLE');
  }
  /** Advisory UI readiness still comes from the current frozen route and database deadline. */
  async assertSubmissionReady(tx:TenantTransaction,decision:DecisionRecord):Promise<void>{
    const request=await this.getRequest(tx,decision.package.requestRef.id),c=tx.context.tenant;
    const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    if(decision.status!=='Pending'||request.status!=='Open'||request.routeRevision!==decision.package.routeRevision
      ||Date.parse(request.expiresAt)<=clock!.now.getTime()||Date.parse(decision.package.validUntil)<=clock!.now.getTime()
      ||await digestContract('DecisionPackage',decision.package)!==decision.package.packageDigest)throw new CoreError('DECISION_STALE');
    await this.assertCurrentSubmitter(tx,decision,request);
    const slot=request.requiredSlots.find(slot=>slot.slotId===decision.package.slotId);
    if(!slot)throw new CoreError('DECISION_STALE');
    this.#assertDependencies(request,slot,await this.#routeDecisions(tx,request));
  }
  async #routeDecisions(tx:TenantTransaction,request:ResponsibilityRequestRecord):Promise<DecisionRecord[]>{
    const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT id,version,status,slot_id,seat_id,record FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId}
      AND request_id=${request.requestRef.id} AND route_revision=${request.routeRevision} AND deleted_at IS NULL
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names)`;
    return rows.map(row=>{
      const decision=contract('DecisionRecord',row.record);
      if(decision.decisionRef.id!==row.id||decision.decisionRef.version!==Number(row.version)||decision.status!==row.status
        ||decision.package.slotId!==row.slot_id||decision.seatId!==row.seat_id||decision.package.requestRef.id!==request.requestRef.id
        ||decision.package.routeRevision!==request.routeRevision||decision.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
      return decision;
    });
  }
  #assertDependencies(request:ResponsibilityRequestRecord,slot:ResponsibilityRequestRecord['requiredSlots'][number],decisions:readonly DecisionRecord[]):void{
    for(const dependency of slot.dependsOnSlotIds){
      const predecessor=request.requiredSlots.find(candidate=>candidate.slotId===dependency),responses=decisions.filter(d=>d.package.slotId===dependency);
      if(!predecessor||responses.length!==predecessor.seats.length)throw new CoreError('PRECONDITION_FAILED');
      for(const seat of predecessor.seats){
        const matches=responses.filter(d=>d.seatId===seat.seatId&&request.decisionRefs.some(ref=>identity(ref,d.decisionRef)));
        if(matches.length!==1)throw new CoreError('PRECONDITION_FAILED');
        const decision=matches[0]!;
        if(decision.status!=='Approved'||decision.submission?.response!=='Approved'||!exact(decision.package.subjectRef,request.subjectRef)
          ||decision.package.proposalDigest!==request.proposalDigest||decision.submission.packageDigest!==decision.package.packageDigest)throw new CoreError('PRECONDITION_FAILED');
      }
    }
  }
  async open(tx:TenantTransaction,command:CommandIdentity,input:OpenResponsibilityRequestPayload,eligibility:DecisionEligibility):Promise<ResponsibilityRequestRecord>{
    contract('OpenResponsibilityRequestPayload',input);const request=input.request,c=tx.context.tenant;
    if(request.resourceOrganizationId!==c.resourceOrganizationId||request.status!=='Unresolved'||request.requestRef.version!==1||request.decisionRefs.length||request.routeRevision!==1)throw new CoreError('INVALID_ARGUMENT');
    if(request.requiredSlots.length>8||request.requiredSlots.some(slot=>slot.responsibleOrganizationId!==c.resourceOrganizationId))throw new CoreError('FORBIDDEN');
    if(Date.parse(request.expiresAt)<=Date.now())throw new CoreError('DECISION_STALE');
    await eligibility.lock(tx,request);await this.#fence(tx);const sql=tx.owner('HumanGateway');
    const {decisions,routable}=await this.#candidates(tx,input,eligibility);
    await sql`INSERT INTO human.requests(resource_organization_id,id,workspace_id,purpose_names,route_revision,expires_at,status,record) VALUES (${c.resourceOrganizationId},${request.requestRef.id},${c.workspaceId??null},${[...new Set([c.purposeOfUse,'abh.runtime.deliver','abh.decision.review'])]},1,${request.expiresAt},'Unresolved',${JSON.stringify(request)}::text::jsonb)`;
    await this.#saveRoutingProposal(tx,input);
    await appendChange(tx,{command,target:request.requestRef,eventType:'abh.responsibility-request.created',changedFields:['status','requiredSlots'],relatedRefs:[request.subjectRef]});
    if(!routable)return request;
    return this.#activate(tx,command,request,decisions);
  }
  /** Retry an unchanged frozen request after current candidate eligibility recovers. No seat replacement or deadline extension. */
  async retryUnresolved(tx:TenantTransaction,command:CommandIdentity,input:OpenResponsibilityRequestPayload,eligibility:DecisionEligibility):Promise<ResponsibilityRequestRecord>{
    contract('OpenResponsibilityRequestPayload',input);
    const request=input.request;
    await eligibility.lock(tx,request);await this.#fence(tx);await this.#lockRequest(tx,request.requestRef.id);
    const current=await this.getRequest(tx,request.requestRef.id);
    if(!exact(current.requestRef,request.requestRef))throw new CoreError('VERSION_CONFLICT');
    if(current.status!=='Unresolved'||current.decisionRefs.length)throw new CoreError('PRECONDITION_FAILED');
    if(canonicalJson(current)!==canonicalJson(request))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    const frozen=await this.getRoutingProposal(tx,current.requestRef);
    if(canonicalJson(frozen)!==canonicalJson(input))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    if(Date.parse(current.expiresAt)<=clock!.now.getTime())throw new CoreError('DECISION_STALE');
    const c=tx.context.tenant;
    const [scope]=await tx.owner('HumanGateway')`SELECT workspace_id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.requestRef.id}`;
    if(!scope)throw new CoreError('RESOURCE_NOT_FOUND');
    const {decisions,routable}=await this.#candidates(tx,input,eligibility,scope.workspace_id);
    if(!routable)return current;
    return this.#activate(tx,command,current,decisions);
  }
  /** A governed route replacement requires fresh responses; previous approvals remain immutable history. */
  async reviseRoute(tx:TenantTransaction,command:CommandIdentity,input:ReviseResponsibilityRoutePayload,eligibility:DecisionEligibility,
    govern:(tx:TenantTransaction,current:ResponsibilityRequestRecord,input:ReviseResponsibilityRoutePayload)=>Promise<void>):Promise<ResponsibilityRequestRecord>{
    contract('ReviseResponsibilityRoutePayload',input);const proposed=input.proposal.request,c=tx.context.tenant,sql=tx.owner('HumanGateway');
    await eligibility.lock(tx,proposed);await this.#fence(tx);await this.#lockRequest(tx,input.expectedRequestRef.id);
    const current=await this.getRequest(tx,input.expectedRequestRef.id);
    if(!exact(current.requestRef,input.expectedRequestRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Open','Unresolved'].includes(current.status))throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    if(Date.parse(current.expiresAt)<=clock!.now.getTime())throw new CoreError('DECISION_STALE');
    const expected={...current,requestRef:{...current.requestRef,version:current.requestRef.version+1},routeRevision:current.routeRevision+1,requiredSlots:proposed.requiredSlots,decisionRefs:[],status:'Unresolved'};
    // Re-routing cannot silently replace the subject, proposal, evidence, deadline or required responsibility kinds.
    if(canonicalJson(proposed)!==canonicalJson(expected)||proposed.requiredSlots.length>8||proposed.requiredSlots.some(slot=>slot.responsibleOrganizationId!==c.resourceOrganizationId))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    for(const slot of current.requiredSlots.filter(slot=>slot.required)){
      const replacement=proposed.requiredSlots.find(candidate=>candidate.slotId===slot.slotId);
      if(!replacement||!replacement.required||replacement.responsibilityType!==slot.responsibilityType||replacement.responsibleOrganizationId!==slot.responsibleOrganizationId
        ||replacement.selectionMode!==slot.selectionMode||canonicalJson(replacement.dependsOnSlotIds)!==canonicalJson(slot.dependsOnSlotIds)
        ||replacement.seats.length<slot.seats.length)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    }
    await govern(tx,current,input);
    const [scope]=await sql`SELECT workspace_id,purpose_names FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.requestRef.id}`;
    if(!scope)throw new CoreError('RESOURCE_NOT_FOUND');
    const {decisions,routable}=await this.#candidates(tx,input.proposal,eligibility,scope.workspace_id);
    const rows=await sql`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${current.requestRef.id}
      AND route_revision=${current.routeRevision} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id`;
    if(rows.length!==current.decisionRefs.length)throw new CoreError('INTERNAL_ERROR');
    for(const row of rows){
      const previous=contract('DecisionRecord',row.record);
      if(previous.status!==row.status||previous.decisionRef.version!==Number(row.version)||!current.decisionRefs.some(ref=>identity(ref,previous.decisionRef)))throw new CoreError('INTERNAL_ERROR');
      if(previous.status!=='Pending')continue;
      const next=contract('DecisionRecord',{...previous,decisionRef:{...previous.decisionRef,version:previous.decisionRef.version+1},status:'Superseded'});
      const changed=await sql`UPDATE human.decisions SET status='Superseded',version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.decisionRef.id} AND version=${previous.decisionRef.version} AND status='Pending' RETURNING id`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');
      await appendChange(tx,{command,target:next.decisionRef,eventType:'abh.decision.supersede',changedFields:['status'],relatedRefs:[proposed.requestRef,...input.evidenceRefs]});
    }
    const changed=await sql`UPDATE human.requests SET status='Unresolved',route_revision=${proposed.routeRevision},version=version+1,record=${JSON.stringify(proposed)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.requestRef.id} AND version=${current.requestRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await sql`INSERT INTO human.route_revisions(resource_organization_id,id,workspace_id,purpose_names,request_id,route_revision,record)
      VALUES (${c.resourceOrganizationId},${command.commandId},${scope.workspace_id},${scope.purpose_names},${current.requestRef.id},${proposed.routeRevision},${JSON.stringify(contract('ResponsibilityRouteRevisionRecord',{previousRequest:current,change:input}))}::text::jsonb)`;
    await this.#saveRoutingProposal(tx,input.proposal);
    if(current.status==='Open')await appendChange(tx,{command,target:proposed.requestRef,eventType:'abh.responsibility-request.unroute',changedFields:['status','decisionRefs'],relatedRefs:current.decisionRefs});
    await appendChange(tx,{command,target:proposed.requestRef,eventType:'abh.responsibility-request.route-revised',eventOrdinal:current.status==='Open'?1:0,changedFields:['routeRevision','requiredSlots'],relatedRefs:[input.directoryRef,...input.frozenPolicyRefs,...input.evidenceRefs]});
    return routable?this.#activate(tx,command,proposed,decisions):proposed;
  }
  async #saveRoutingProposal(tx:TenantTransaction,input:OpenResponsibilityRequestPayload):Promise<void>{
    const c=tx.context.tenant;
    await tx.owner('HumanGateway')`INSERT INTO human.routing_proposals(resource_organization_id,id,workspace_id,purpose_names,request_id,route_revision,record)
      SELECT ${c.resourceOrganizationId},${randomUUID()},workspace_id,purpose_names,${input.request.requestRef.id},${input.request.routeRevision},${JSON.stringify(input)}::text::jsonb
      FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.request.requestRef.id}`;
  }
  /** Immutable original package lookup for recovery, never synthesis from current directory content. */
  async getRoutingProposal(tx:TenantTransaction,reference:EntityRef):Promise<OpenResponsibilityRequestPayload>{
    contract('RequestRef',reference);const request=await this.getRequest(tx,reference.id),c=tx.context.tenant;
    if(!exact(request.requestRef,reference))throw new CoreError('VERSION_CONFLICT');
    if(request.status!=='Unresolved'||request.decisionRefs.length)throw new CoreError('PRECONDITION_FAILED');
    const [row]=await tx.owner('HumanGateway')`SELECT record FROM human.routing_proposals WHERE resource_organization_id=${c.resourceOrganizationId}
      AND request_id=${reference.id} AND route_revision=${request.routeRevision} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const input=contract('OpenResponsibilityRequestPayload',row.record);
    if(canonicalJson(input.request)!==canonicalJson(request))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    if(input.packages.length!==request.requiredSlots.length||new Set(input.packages.map(pkg=>pkg.slotId)).size!==input.packages.length)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    for(const pkg of input.packages)if(!exact(pkg.requestRef,reference)||pkg.routeRevision!==request.routeRevision||!exact(pkg.subjectRef,request.subjectRef)||pkg.proposalDigest!==request.proposalDigest
      ||!request.requiredSlots.some(slot=>slot.slotId===pkg.slotId)||Date.parse(pkg.validUntil)>Date.parse(request.expiresAt)||await digestContract('DecisionPackage',pkg)!==pkg.packageDigest)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    return input;
  }
  /** Discover live Unresolved requests; persisted frozen packages are checked before retry. */
  async pendingRouting(tx:TenantTransaction,limit=100,after?:string):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');if(after)contract('UUID',after);
    const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT id,version FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId}
      AND status='Unresolved' AND expires_at>clock_timestamp() AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND (${after??null}::uuid IS NULL OR id>${after??null}::uuid) ORDER BY id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.responsibility-request',id:row.id,version:Number(row.version)}));
  }
  /** Discover due requests in one verified tenant/purpose/Workspace; expired credentials never authorize mutation. */
  async pendingExpiry(tx:TenantTransaction,limit=100,after?:string):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');if(after)contract('UUID',after);
    const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT id,version FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId}
      AND status IN ('Unresolved','Open') AND expires_at<=clock_timestamp() AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND (${after??null}::uuid IS NULL OR id>${after??null}::uuid) ORDER BY id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.responsibility-request',id:row.id,version:Number(row.version)}));
  }
  /** Whole-request expiry. Keep every already-submitted Decision and never synthesize completion evidence. */
  async expire(tx:TenantTransaction,command:CommandIdentity,requestRef:EntityRef):Promise<ResponsibilityRequestRecord>{
    contract('RequestRef',requestRef);await this.#fence(tx);await this.#lockRequest(tx,requestRef.id);
    const request=await this.getRequest(tx,requestRef.id),c=tx.context.tenant,sql=tx.owner('HumanGateway');
    if(!exact(request.requestRef,requestRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Unresolved','Open'].includes(request.status))throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    if(Date.parse(request.expiresAt)>clock!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
    const rows=await sql`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId}
      AND request_id=${requestRef.id} AND route_revision=${request.routeRevision} AND deleted_at IS NULL
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id`;
    const current=rows.map(row=>{const decision=contract('DecisionRecord',row.record);
      if(decision.decisionRef.version!==Number(row.version)||decision.status!==row.status||decision.package.requestRef.id!==requestRef.id
        ||decision.package.routeRevision!==request.routeRevision||!request.decisionRefs.some(ref=>identity(ref,decision.decisionRef)))throw new CoreError('INTERNAL_ERROR');return decision;});
    if(current.length!==request.decisionRefs.length)throw new CoreError('INTERNAL_ERROR');
    const refs:EntityRef[]=[];
    for(const decision of current){
      if(decision.status!=='Pending'){refs.push(decision.decisionRef);continue;}
      const next=contract('DecisionRecord',{...decision,decisionRef:{...decision.decisionRef,version:decision.decisionRef.version+1},status:'Expired'});
      const changed=await sql`UPDATE human.decisions SET status='Expired',version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${decision.decisionRef.id} AND version=${decision.decisionRef.version} AND status='Pending' RETURNING id`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');refs.push(next.decisionRef);
      await appendChange(tx,{command,target:next.decisionRef,eventType:'abh.decision.expire',changedFields:['status'],relatedRefs:[requestRef]});
    }
    const closed=contract('ResponsibilityRequestRecord',{...request,requestRef:{...requestRef,version:requestRef.version+1},decisionRefs:refs,status:'Closed'});
    const changed=await sql`UPDATE human.requests SET status='Closed',version=version+1,record=${JSON.stringify(closed)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${requestRef.id} AND version=${requestRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:closed.requestRef,eventType:'abh.responsibility-request.close',changedFields:['status','decisionRefs'],relatedRefs:refs});
    return closed;
  }
  async #candidates(tx:TenantTransaction,input:OpenResponsibilityRequestPayload,eligibility:DecisionEligibility,requiredWorkspace?:string|null){
    const request=input.request,c=tx.context.tenant;
    const packages=new Map<string,DecisionPackage>();
    for(const pkg of input.packages){
      if(packages.has(pkg.slotId)||!exact(pkg.requestRef,request.requestRef)||pkg.routeRevision!==request.routeRevision||!identity(pkg.subjectRef,request.subjectRef)
        ||pkg.subjectRef.version!==request.subjectRef.version||pkg.proposalDigest!==request.proposalDigest||Date.parse(pkg.validUntil)<=Date.now()||Date.parse(pkg.validUntil)>Date.parse(request.expiresAt)
        ||await digestContract('DecisionPackage',pkg)!==pkg.packageDigest)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
      packages.set(pkg.slotId,pkg);
    }
    if(packages.size!==request.requiredSlots.length||request.requiredSlots.some(slot=>!packages.has(slot.slotId)))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    const decisions:DecisionRecord[]=[];let routable=true;
    for(const slot of request.requiredSlots)for(const seat of slot.seats){
      const candidates:EntityRef[]=[];
      for(const reference of seat.responsibilityRefs){
        const assignment=await currentResponsibility(tx,reference,requiredWorkspace);
        if(assignment&&assignment.responsibilityType===slot.responsibilityType&&assignment.scopeRefs.some(scope=>identity(scope,request.subjectRef)||scope.type==='abh.organization'&&scope.id===c.resourceOrganizationId)
          &&await eligibility.candidate(tx,assignment,request))candidates.push(reference);
      }
      if(!candidates.length){if(slot.required)routable=false;continue;}
      decisions.push(contract('DecisionRecord',{decisionRef:{type:'abh.decision',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
        package:packages.get(slot.slotId),seatId:seat.seatId,candidateResponsibilityRefs:candidates,status:'Pending'}));
    }
    return {decisions,routable};
  }
  async #activate(tx:TenantTransaction,command:CommandIdentity,request:ResponsibilityRequestRecord,decisions:DecisionRecord[]):Promise<ResponsibilityRequestRecord>{
    const c=tx.context.tenant,sql=tx.owner('HumanGateway');
    const [scope]=await sql`SELECT workspace_id,purpose_names FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id}`;
    if(!scope)throw new CoreError('RESOURCE_NOT_FOUND');
    for(const decision of decisions){
      await sql`INSERT INTO human.decisions(resource_organization_id,id,workspace_id,purpose_names,request_id,route_revision,slot_id,seat_id,valid_until,status,record)
        VALUES (${c.resourceOrganizationId},${decision.decisionRef.id},${scope.workspace_id},${scope.purpose_names},${request.requestRef.id},${request.routeRevision},${decision.package.slotId},${decision.seatId},${decision.package.validUntil},'Pending',${JSON.stringify(decision)}::text::jsonb)`;
      await appendChange(tx,{command,target:decision.decisionRef,eventType:'abh.decision.created',changedFields:['status','package'],relatedRefs:[request.requestRef]});
    }
    const opened=contract('ResponsibilityRequestRecord',{...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},status:'Open',decisionRefs:decisions.map(d=>d.decisionRef)});
    const changed=await sql`UPDATE human.requests SET status='Open',version=version+1,record=${JSON.stringify(opened)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id} AND version=${request.requestRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:opened.requestRef,eventType:'abh.responsibility-request.route',changedFields:['status','decisionRefs'],relatedRefs:opened.decisionRefs});
    return opened;
  }
  async submit(tx:TenantTransaction,command:CommandIdentity,decisionRef:EntityRef,submission:SubmitDecisionPayload,eligibility:DecisionEligibility):Promise<{decision:DecisionRecord;completion?:RequestCompletionEvidence}>{
    contract('EntityRef',decisionRef);contract('SubmitDecisionPayload',submission);if(decisionRef.type!=='abh.decision')throw new CoreError('INVALID_ARGUMENT');
    const first=await this.getDecision(tx,decisionRef.id),preliminary=await this.getRequest(tx,first.package.requestRef.id);
    await eligibility.lock(tx,preliminary);await this.#fence(tx);await this.#lockRequest(tx,first.package.requestRef.id);
    const decision=await this.getDecision(tx,decisionRef.id),request=await this.getRequest(tx,first.package.requestRef.id),c=tx.context.tenant,sql=tx.owner('HumanGateway');
    if(decision.decisionRef.version!==decisionRef.version)throw new CoreError('VERSION_CONFLICT');
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    if(decision.status!=='Pending'||request.status!=='Open'||request.routeRevision!==decision.package.routeRevision||Date.parse(request.expiresAt)<=clock!.now.getTime()
      ||Date.parse(decision.package.validUntil)<=clock!.now.getTime()||decision.package.packageDigest!==submission.packageDigest)throw new CoreError('DECISION_STALE');
    if(await digestContract('DecisionPackage',decision.package)!==decision.package.packageDigest)throw new CoreError('DECISION_STALE');
    if(!decision.package.allowedResponses.includes(submission.response))throw new CoreError('INVALID_ARGUMENT');
    const previous=await this.#routeDecisions(tx,request),slot=request.requiredSlots.find(slot=>slot.slotId===decision.package.slotId);
    if(!slot)throw new CoreError('DECISION_STALE');
    this.#assertDependencies(request,slot,previous);
    let chosen:ResponsibilityAssignmentRecord|undefined;
    for(const reference of decision.candidateResponsibilityRefs){const assignment=await this.#currentSeat(tx,decision,request,reference);if(assignment?.principalRef.id===c.actor.id){chosen=assignment;break;}}
    if(!chosen||c.actor.type!=='Human')throw new CoreError('DECIDER_NOT_ELIGIBLE');
    const grantRefs=await eligibility.submit(tx,decision,chosen,request,submission);
    const next=contract('DecisionRecord',{...decision,decisionRef:{...decision.decisionRef,version:decision.decisionRef.version+1},status:submission.response,
      submission,respondedBy:c.actor,responsibilityRef:chosen.responsibilityRef,decisionGrantRefs:grantRefs,decidedAt:clock!.now.toISOString()});
    const changed=await sql`UPDATE human.decisions SET status=${next.status},version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${decisionRef.id} AND version=${decisionRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.decisionRef,eventType:next.status==='Approved'?'abh.decision.approve':'abh.decision.reject',changedFields:['status','submission'],relatedRefs:[chosen.responsibilityRef,...grantRefs]});
    const current=previous.map(d=>d.decisionRef.id===next.decisionRef.id?next:d);
    for(const requiredSlot of request.requiredSlots.filter(slot=>slot.required))for(const seat of requiredSlot.seats){
      if(current.filter(d=>d.package.slotId===requiredSlot.slotId&&d.seatId===seat.seatId&&request.decisionRefs.some(ref=>ref.id===d.decisionRef.id)).length!==1)throw new CoreError('INTERNAL_ERROR');
    }
    const required=current.filter(d=>request.requiredSlots.some(slot=>slot.required&&slot.slotId===d.package.slotId));
    const rejected=required.some(d=>d.status==='Rejected');let completion:RequestCompletionEvidence|undefined;
    if(!rejected&&required.length&&required.every(d=>d.status==='Approved')){
      for(const d of required){
        const assignment=d.responsibilityRef?await this.#currentSeat(tx,d,request,d.responsibilityRef):undefined;
        if(!assignment||d.respondedBy?.type!=='Human'||d.respondedBy.id!==assignment.principalRef.id)throw new CoreError('DECIDER_NOT_ELIGIBLE');
        await eligibility.revalidate(tx,d,request);
      }
      const conditions=await eligibility.conditions(tx,required);
      completion=contract('RequestCompletionEvidence',{completionEvidenceRef:{type:'abh.request-completion-evidence',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
        requestRef:{...request.requestRef,version:request.requestRef.version+1},routeRevision:request.routeRevision,subjectRef:request.subjectRef,proposalDigest:request.proposalDigest,
        decisionRefs:required.map(d=>d.decisionRef),conditionRefs:conditions,recordedAt:clock!.now.toISOString()});
      await sql`INSERT INTO human.completion_evidence(resource_organization_id,id,workspace_id,request_id,route_revision,record)
        SELECT ${c.resourceOrganizationId},${completion.completionEvidenceRef.id},workspace_id,${request.requestRef.id},${request.routeRevision},${JSON.stringify(completion)}::text::jsonb
        FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id}`;
      await appendChange(tx,{command,target:completion.completionEvidenceRef,eventType:'abh.request-completion-evidence.created',changedFields:['decisionRefs'],relatedRefs:completion.decisionRefs});
    }
    if(rejected||completion){
      const closed=contract('ResponsibilityRequestRecord',{...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},status:'Closed',decisionRefs:current.map(d=>d.decisionRef)});
      const requestChanged=await sql`UPDATE human.requests SET status='Closed',version=version+1,record=${JSON.stringify(closed)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id} AND version=${request.requestRef.version} RETURNING id`;
      if(!requestChanged[0])throw new CoreError('VERSION_CONFLICT');
      await appendChange(tx,{command,target:closed.requestRef,eventType:'abh.responsibility-request.close',changedFields:['status'],relatedRefs:completion?[completion.completionEvidenceRef]:[next.decisionRef]});
    }
    return {decision:next,...(completion?{completion}:{})};
  }
}
