import {readRequestControlEffect} from '../src/human/request-effect.ts';
import {createAbhClient} from '../src/client.ts';
import {InboxCursorCodec} from '../src/server/inbox-cursor.ts';
import {readDecisionView,type DecisionViewAdmission} from '../src/human/decision-view.ts';
import {queryDecisionEffects} from '../src/human/effect-query.ts';
import {runControlEffectWorker} from '../src/human/control-effect-worker.ts';
import {prepareControlDecisionEffect,getControlDecisionEffectInput,applyControlDecisionEffect,getDecisionEffectReceipt,type ControlDecisionEffectChecks} from '../src/human/apply-control-effect.ts';
import {createCoreHttpApp} from '../src/server/http.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import type {IdentityProviderPort} from '@abh/contracts/ports';
import {DecisionInboxOwner,type DecisionInboxAdmission} from '../src/human/inbox.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {runResponsibilityRoutingWorker} from '../src/human/routing-worker.ts';
import {reviseResponsibilityRoute,type RouteRevisionInstallation} from '../src/human/revise-route.ts';
import {delegateResponsibilitySlot} from '../src/human/delegate-slot.ts';
import {escalateResponsibilitySlot} from '../src/human/escalate-slot.ts';
import type {ReviseResponsibilityRoutePayload} from '@abh/contracts';
import {withdrawDecision,withdrawPendingDecision,type DecisionWithdrawalChecks} from '../src/human/withdraw-decision.ts';
import {revokeResponsibility,revokeResponsibilityAssignment,type ResponsibilityRevocationChecks} from '../src/human/revoke-responsibility.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {expireResponsibilityRequest,runResponsibilityExpiryWorker} from '../src/human/expiry-worker.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {ExecutionAuthority,GrantRecord,RequestCompletionEvidence,DecisionPackage,DecisionRecord,ResponsibilityAssignmentRecord,ResponsibilityRequestRecord,SubmitDecisionPayload} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {Database} from '../src/data/uow.ts';
import {DecisionOwner,type DecisionEligibility} from '../src/human/decisions.ts';
import {assignResponsibility,currentResponsibility} from '../src/human/responsibilities.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {ExecutionAuthorityOwner,type AuthorityEffectChecks} from '../src/control/authority.ts';
import {CoreError} from '../src/internal/errors.ts';
import type {OpenResponsibilityRequestPayload} from '@abh/contracts';
import {retryResponsibilityRoute} from '../src/human/retry-route.ts';
import {revokeGrant} from '../src/control/revoke.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {approvalFenceRefs} from '../src/human/approval-proof.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('human decisions require all frozen seats before completion evidence',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const a=context(),b=context(a.tenant.resourceOrganizationId),org=a.tenant.resourceOrganizationId,owner=new DecisionOwner();
  const assignments:ResponsibilityAssignmentRecord[]=[];
  await db.transaction(a,options(),tx=>tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`);
  for(const c of [a,b]){
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${c.tenant.actor.id},'fixture reviewer','Human',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${c.tenant.actor.id},1,'Active')`;
    });
    const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),responsibilityType:'Authorization',scopeRefs:[ref('abh.organization',org)],
      validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),templateRef:ref('abh.artifact'),status:'Active'};
    const cmd=await command('abh.responsibilities.assign',assignment);
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>assignResponsibility(tx,cmd,assignment)));assignments.push(assignment);
  }
  // Fixture policy only. Production admission must use actual Grant and source/condition Owners.
  const eligible:DecisionEligibility={lock:async()=>{},candidate:async()=>true,submit:async()=>[ref('abh.grant')],revalidate:async()=>{},conditions:async (_tx,decisions)=>decisions.flatMap(d=>d.submission!.conditionRefs)};
  const proposals=new Map<string,OpenResponsibilityRequestPayload>();
  const open=async(mode:'ANY'|'ALL'='ALL',policy=eligible,openingContext=a,expiresAt=new Date(Date.now()+60_000).toISOString())=>{
    const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Authorization',subjectRef:ref('abh.action'),proposalDigest:'sha256:'+'a'.repeat(64),evidenceRefs:[ref('abh.artifact')],
      requiredSlots:[{slotId:'approve',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:mode,required:true,dependsOnSlotIds:[],
        seats:mode==='ANY'?[{seatId:'any',responsibilityRefs:assignments.map(a=>a.responsibilityRef)}]:assignments.map((a,i)=>({seatId:`seat-${i}`,responsibilityRefs:[a.responsibilityRef]}))}],routeRevision:1,decisionRefs:[],expiresAt,status:'Unresolved'};
    const unsigned:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'approve',subjectRef:request.subjectRef,proposalDigest:request.proposalDigest,question:'Publish this brief?',recommendation:'Review the attached fixture.',alternatives:['Reject'],
      impactUpperBound:{scopeRefs:[ref('abh.organization',org)],resourceRequirements:[],maxMoney:[],description:'Internal fixture only'},risks:['Publishing remains pending until authorized execution.'],evidenceRefs:request.evidenceRefs,validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)};
    const pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)},input={request,packages:[pkg]},cmd=await command('abh.responsibility-requests.open',input);let opened:ResponsibilityRequestRecord;
    await db.transaction(openingContext,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{opened=await owner.open(tx,cmd,input,policy);return opened.requestRef;}));proposals.set(request.requestRef.id,input);return opened!;
  };
  const load=(id:string)=>db.transaction(a,options(),tx=>owner.getDecision(tx,id));
  const submit=async(c:typeof a,decision:DecisionRecord,response:'Approved'|'Rejected'='Approved',policy=eligible)=>{
    const submission:SubmitDecisionPayload=response==='Approved'?{response,packageDigest:decision.package.packageDigest,conditionRefs:[]}:{response,packageDigest:decision.package.packageDigest,conditionRefs:[],reason:'Fixture rejection'};
    const cmd=await command('abh.decisions.submit',{decisionRef:decision.decisionRef,submission});let result:Awaited<ReturnType<DecisionOwner['submit']>>;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.submit(tx,cmd,decision.decisionRef,submission,policy);return result.decision.decisionRef;}));return result!;
  };
  const evidenceCount=(requestId:string)=>db.transaction(a,options(),async tx=>(await tx.owner('HumanGateway')`SELECT count(*) FROM human.completion_evidence WHERE request_id=${requestId}`)[0]!.count);

  let completed:RequestCompletionEvidence;
  await t.test('ALL does not complete after one seat; complete approval produces one immutable proof and no implicit Grant',async()=>{
    const request=await open(),d1=await load(request.decisionRefs[0]!.id),d2=await load(request.decisionRefs[1]!.id);
    const first=await submit(a,d1);assert.equal(first.decision.status,'Approved');assert.equal(first.completion,undefined);assert.equal(await evidenceCount(request.requestRef.id),'0');
    assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
    const second=await submit(b,d2);completed=second.completion!;assert.equal(second.completion!.decisionRefs.length,2);assert.equal(await evidenceCount(request.requestRef.id),'1');
    assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Closed');
    const grants=await db.transaction(a,options(),tx=>tx.owner('Control')`SELECT count(*) FROM control.grants`);assert.equal(grants[0]!.count,'0');
    await assert.rejects(submit(b,d2),{code:'VERSION_CONFLICT'});
    await assert.rejects(db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.completion_evidence SET record=record`),{code:'42501'});
  });
  await t.test('dependent submission requires every frozen predecessor seat and ignores hidden or deleted approvals',async()=>{
    const original=await open('ALL',{...eligible,candidate:async()=>false}),template=proposals.get(original.requestRef.id)!;
    const prerequisite={...template.request.requiredSlots[0]!,slotId:'prerequisite'},dependent={...prerequisite,slotId:'dependent',selectionMode:'ANY' as const,seats:[{seatId:'dependent-seat',responsibilityRefs:[assignments[0]!.responsibilityRef]}],dependsOnSlotIds:['prerequisite']};
    const request={...template.request,requestRef:ref('abh.responsibility-request'),requiredSlots:[prerequisite,dependent]};
    const packages=await Promise.all([prerequisite,dependent].map(async slot=>{const unsigned={...template.packages[0]!,requestRef:request.requestRef,slotId:slot.slotId};return {...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)};}));
    const input={request,packages},cmd=await command('abh.responsibility-requests.open',input);
    const opened=await db.transaction(a,options(),async tx=>{let result!:ResponsibilityRequestRecord;await executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.open(tx,cmd,input,eligible);return result.requestRef;});return result;});
    const decisions=await Promise.all(opened.decisionRefs.map(d=>load(d.id))),target=decisions.find(d=>d.package.slotId==='dependent')!,predecessors=decisions.filter(d=>d.package.slotId==='prerequisite');
    const ready=()=>db.transaction(a,options(),tx=>owner.assertSubmissionReady(tx,target));
    await assert.rejects(ready(),{code:'PRECONDITION_FAILED'});await assert.rejects(submit(a,target),{code:'PRECONDITION_FAILED'});
    const first=predecessors.find(d=>d.candidateResponsibilityRefs.some(r=>r.id===assignments[0]!.responsibilityRef.id))!,second=predecessors.find(d=>d!==first)!;
    await submit(a,first);await assert.rejects(submit(a,target),{code:'PRECONDITION_FAILED'});await submit(b,second);await ready();
    for(const hide of ['deleted','workspace','purpose'] as const){
      if(hide==='deleted')await f.admin`UPDATE human.decisions SET deleted_at=clock_timestamp() WHERE id=${second.decisionRef.id}`;
      if(hide==='workspace')await f.admin`UPDATE human.decisions SET workspace_id=${randomUUID()} WHERE id=${second.decisionRef.id}`;
      if(hide==='purpose')await f.admin`UPDATE human.decisions SET purpose_names=ARRAY['abh.decision.review'] WHERE id=${second.decisionRef.id}`;
      try{await assert.rejects(ready(),{code:'PRECONDITION_FAILED'});await assert.rejects(submit(a,target),{code:'PRECONDITION_FAILED'});}
      finally{await f.admin`UPDATE human.decisions SET deleted_at=NULL,workspace_id=NULL,purpose_names=ARRAY['abh.action.prepare','abh.runtime.deliver','abh.decision.review'] WHERE id=${second.decisionRef.id}`;}
    }
    assert.equal((await load(target.decisionRef.id)).status,'Pending');assert.equal(await evidenceCount(request.requestRef.id),'0');
    const result=await submit(a,target);assert.equal(result.decision.status,'Approved');assert.equal(result.completion?.decisionRefs.length,3);
  });
  await t.test('ANY accepts only the first valid concurrent response',async()=>{
    const request=await open('ANY'),decision=await load(request.decisionRefs[0]!.id);
    const results=await Promise.allSettled([submit(a,decision),submit(b,decision)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await evidenceCount(request.requestRef.id),'1');
  });
  await t.test('Request, Decisions and completion inherit Workspace scope through initial routing and retry',async()=>{
    const workspaceId=randomUUID(),scoped=deriveVerifiedContext({...a.request,workspaceId}),other=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    for(const retry of [false,true]){
      let request=await open('ANY',retry?{...eligible,candidate:async()=>false}:eligible,scoped);
      for(const denied of [a,other])await assert.rejects(db.transaction(denied,options(),tx=>owner.getRequest(tx,request.requestRef.id)),{code:'RESOURCE_NOT_FOUND'});
      if(retry){
        const input=proposals.get(request.requestRef.id)!,cmd=await command('abh.responsibility-requests.retry-route',input);
        await assert.rejects(db.transaction(other,options(),tx=>owner.retryUnresolved(tx,cmd,input,eligible)),{code:'RESOURCE_NOT_FOUND'});
        request=await db.transaction(scoped,options(),tx=>owner.retryUnresolved(tx,cmd,input,eligible));
      }
      const decision=await db.transaction(scoped,options(),tx=>owner.getDecision(tx,request.decisionRefs[0]!.id));
      for(const denied of [a,other])await assert.rejects(db.transaction(denied,options(),tx=>owner.getDecision(tx,decision.decisionRef.id)),{code:'RESOURCE_NOT_FOUND'});
      const result=await submit(scoped,decision);assert.ok(result.completion);
      for(const denied of [a,other])await assert.rejects(db.transaction(denied,options(),tx=>approvalFenceRefs(tx,result.completion!.completionEvidenceRef)),{code:'AUTHORITY_REQUIRED'});
      assert.ok((await db.transaction(scoped,options(),tx=>approvalFenceRefs(tx,result.completion!.completionEvidenceRef))).length>0);
      const rows=await f.admin`SELECT workspace_id FROM human.completion_evidence WHERE resource_organization_id=${org} AND id=${result.completion!.completionEvidenceRef.id}`;
      assert.equal(rows[0]!.workspace_id,workspaceId);
    }
    // An organization-scoped source stays organization-scoped even when retried inside a Workspace.
    const request=await open('ANY',{...eligible,candidate:async()=>false}),input=proposals.get(request.requestRef.id)!,cmd=await command('abh.responsibility-requests.retry-route',input);
    const opened=await db.transaction(scoped,options(),tx=>owner.retryUnresolved(tx,cmd,input,eligible));
    assert.equal((await load(opened.decisionRefs[0]!.id)).status,'Pending');
  });
  await t.test('Command receipt replay retains Workspace boundary and still authorizes before returning history',async()=>{
    const workspaceId=randomUUID(),scoped=deriveVerifiedContext({...a.request,workspaceId}),other=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    const resultRef=ref('abh.responsibility-request'),cmd=await command('abh.responsibility-requests.retry-route',{resultRef});let authorized=0,executed=0;
    const run=(c:typeof a)=>db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{authorized++;},async()=>{executed++;return resultRef;}));
    assert.equal((await run(scoped)).replayed,false);assert.equal((await run(scoped)).replayed,true);
    for(const denied of [a,other])await assert.rejects(run(denied),{code:'FORBIDDEN'});
    assert.equal(authorized,4);assert.equal(executed,1);
  });
  await t.test('Workspace responsibility assignments cannot qualify a reviewer in another Workspace or organization context',async()=>{
    const workspaceId=randomUUID(),scoped=deriveVerifiedContext({...a.request,workspaceId}),other=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    const assignment={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment')},cmd=await command('abh.responsibilities.assign',assignment);
    await db.transaction(scoped,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>assignResponsibility(tx,cmd,assignment)));
    assert.deepEqual(await db.transaction(scoped,options(),tx=>currentResponsibility(tx,assignment.responsibilityRef)),assignment);
    for(const denied of [a,other])assert.equal(await db.transaction(denied,options(),tx=>currentResponsibility(tx,assignment.responsibilityRef)),undefined);
    assert.ok(await db.transaction(scoped,options(),tx=>currentResponsibility(tx,assignments[0]!.responsibilityRef)));
    // Route selection must use the same scope-aware qualification, even with permissive fixture policy.
    const original=assignments[0]!;assignments[0]=assignment;
    try{
      assert.equal((await open('ALL',eligible,other)).status,'Unresolved');
      assert.equal((await open('ALL',eligible,scoped)).status,'Open');
    }finally{assignments[0]=original;}
  });
  await t.test('a revoked earlier approver prevents ALL completion and rolls back the final response',async()=>{
    const request=await open(),first=await load(request.decisionRefs[0]!.id),second=await load(request.decisionRefs[1]!.id);
    await submit(a,first);
    await f.admin`UPDATE human.responsibilities SET status='Revoked' WHERE resource_organization_id=${org} AND id=${assignments[0]!.responsibilityRef.id}`;
    try{
      await assert.rejects(submit(b,second),{code:'DECIDER_NOT_ELIGIBLE'});
      assert.equal((await load(second.decisionRef.id)).status,'Pending');assert.equal(await evidenceCount(request.requestRef.id),'0');
      assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
    }finally{await f.admin`UPDATE human.responsibilities SET status='Active' WHERE resource_organization_id=${org} AND id=${assignments[0]!.responsibilityRef.id}`;}
  });
  await t.test('a candidate moved outside the frozen seat cannot respond even with permissive installed eligibility',async()=>{
    const request=await open('ANY'),decision=await load(request.decisionRefs[0]!.id);
    const changed={...request,requiredSlots:request.requiredSlots.map(slot=>({...slot,seats:slot.seats.map(seat=>({...seat,responsibilityRefs:[assignments[1]!.responsibilityRef]}))}))};
    await f.admin`UPDATE human.requests SET record=${JSON.stringify(changed)}::text::jsonb WHERE resource_organization_id=${org} AND id=${request.requestRef.id}`;
    await assert.rejects(submit(a,decision),{code:'DECIDER_NOT_ELIGIBLE'});
    assert.equal((await load(decision.decisionRef.id)).status,'Pending');assert.equal(await evidenceCount(request.requestRef.id),'0');
  });
  await t.test('required rejection closes the request without completion or Grant',async()=>{
    const request=await open(),d1=await load(request.decisionRefs[0]!.id),d2=await load(request.decisionRefs[1]!.id);
    await submit(a,d1,'Rejected');assert.equal(await evidenceCount(request.requestRef.id),'0');await assert.rejects(submit(b,d2),{code:'DECISION_STALE'});
  });
  await t.test('missing current candidate stays Unresolved and creates no decisions',async()=>{
    const request=await open('ALL',{...eligible,candidate:async()=>false});assert.equal(request.status,'Unresolved');assert.deepEqual(request.decisionRefs,[]);assert.equal(await evidenceCount(request.requestRef.id),'0');
  });
  await t.test('Unresolved routing recovers current candidates without changing frozen seats or creating a new request',async()=>{
    const denied={...eligible,candidate:async()=>false},request=await open('ALL',denied),input=proposals.get(request.requestRef.id)!;
    const retry=async(payload:OpenResponsibilityRequestPayload,policy=eligible)=>{
      const cmd=await command('abh.responsibility-requests.retry-route',payload);
      return db.transaction(a,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await owner.retryUnresolved(tx,cmd,payload,policy)).requestRef));
    };
    assert.deepEqual((await retry(input,denied)).receipt.resultRef,request.requestRef);
    await assert.rejects(retry({...input,request:{...input.request,expiresAt:new Date(Date.now()+120000).toISOString()}}),{code:'DECISION_PACKAGE_INCOMPLETE'});
    const wrongVersion={...input.packages[0]!,requestRef:{...request.requestRef,version:99}};
    const replaced={...wrongVersion,packageDigest:await digestContract('DecisionPackage',wrongVersion)};
    await assert.rejects(retry({...input,packages:[replaced,...input.packages.slice(1)]}),{code:'DECISION_PACKAGE_INCOMPLETE'});
    const rollback=await command('abh.responsibility-requests.retry-route',input);
    await assert.rejects(db.transaction(a,options(),tx=>executeCommand(tx,rollback,async()=>{},async()=>{
      await owner.retryUnresolved(tx,rollback,input,eligible);throw new Error('routing rollback');
    })),/routing rollback/);
    assert.deepEqual(await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id)),request);
    assert.equal((await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.decisions WHERE request_id=${request.requestRef.id}`))[0]!.count,'0');
    const results=await Promise.allSettled([retry(input),retry(input)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    const current=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    assert.equal(current.status,'Open');assert.equal(current.requestRef.version,2);assert.equal(current.decisionRefs.length,2);
    assert.deepEqual(current.requiredSlots,request.requiredSlots);assert.equal(current.proposalDigest,request.proposalDigest);
    assert.equal(await evidenceCount(request.requestRef.id),'0');
    await submit(a,await load(current.decisionRefs[0]!.id));
    const final=await submit(b,await load(current.decisionRefs[1]!.id));assert.ok(final.completion);
  });
  await t.test('route retry ingress requires current independent Grant, including after a committed replay',async()=>{
    const request=await open('ANY',{...eligible,candidate:async()=>false}),payload=proposals.get(request.requestRef.id)!;
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',a.tenant.actor.id),scopeRefs:[ref('abh.organization',org)],
      actionTypes:['abh.responsibility-requests.retry-route'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Fixture','local','Active')`;
      for(const target of [grant.grantRef,grant.principalRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
        VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const cmd=await command('abh.responsibility-requests.retry-route',payload),installation={eligibility:eligible,fenceRefs:async()=>[]};
    await assert.rejects(retryResponsibilityRoute(db,a,options(),cmd,payload,[],installation),{code:'AUTHORITY_REQUIRED'});
    const result=await retryResponsibilityRoute(db,a,options(),cmd,payload,[grant.grantRef],installation);assert.equal(result.replayed,false);
    assert.equal((await retryResponsibilityRoute(db,a,options(),cmd,payload,[grant.grantRef],installation)).replayed,true);
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(a,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[grant.issuanceEvidenceRef]));
    await assert.rejects(retryResponsibilityRoute(db,a,options(),cmd,payload,[grant.grantRef],installation),{code:'EPOCH_REVOKED'});
  });
  await t.test('deadline closure preserves approved history, expires only Pending decisions, and rolls back atomically',async()=>{
    const expiresAt=new Date(Date.now()+300).toISOString(),request=await open('ALL',eligible,a,expiresAt);
    const first=await load(request.decisionRefs[0]!.id),pending=await load(request.decisionRefs[1]!.id),approved=(await submit(a,first)).decision;
    const cmd=await command('abh.responsibility-requests.expire',request.requestRef);
    await assert.rejects(db.transaction(a,options(),tx=>owner.expire(tx,cmd,request.requestRef)),{code:'PRECONDITION_FAILED'});
    await delay(Math.max(0,Date.parse(expiresAt)-Date.now()+10));
    await assert.rejects(db.transaction(a,options(),async tx=>{await owner.expire(tx,cmd,request.requestRef);throw new Error('expiry rollback');}),/expiry rollback/);
    assert.equal((await load(pending.decisionRef.id)).status,'Pending');
    assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
    const results=await Promise.allSettled([db.transaction(a,options(),tx=>owner.expire(tx,cmd,request.requestRef)),db.transaction(a,options(),tx=>owner.expire(tx,cmd,request.requestRef))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.deepEqual(await load(first.decisionRef.id),approved);
    const expired=await load(pending.decisionRef.id);assert.equal(expired.status,'Expired');assert.equal(expired.respondedBy,undefined);assert.equal(expired.submission,undefined);
    assert.equal(await evidenceCount(request.requestRef.id),'0');await assert.rejects(submit(b,expired),{code:'DECISION_STALE'});
    const events=await db.transaction(a,options(),tx=>tx.owner('DurableExecution')`SELECT record->>'type' AS type FROM data.outbox WHERE resource_organization_id=${org} AND record->>'causationId'=${cmd.commandId}`);
    assert.deepEqual(events.map(row=>row.type).sort(),['abh.decision.expire','abh.responsibility-request.close']);
    const audits=await db.transaction(a,options(),tx=>tx.owner('ArtifactStore')`SELECT count(*) FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.responsibility-requests.expire' AND record->'targetRef'->>'id' IN (${request.requestRef.id},${pending.decisionRef.id})`);
    assert.equal(audits[0]!.count,'2');

  });
  await t.test('expiry worker discovers due scoped requests and rechecks independent Service admission even on replay',async()=>{
    const workspaceId=randomUUID(),opening=deriveVerifiedContext({...a.request,workspaceId}),service=ref('abh.principal');
    const worker=deriveVerifiedContext({...opening.request,actor:{type:'Service',id:service.id},purposeOfUse:'abh.runtime.deliver'});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.responsibility-requests.expire'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'expiry fixture','Service',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
      for(const target of [service,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,workspace_id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${workspaceId},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const expiry=new Date(Date.now()+300).toISOString(),request=await open('ANY',{...eligible,candidate:async()=>false},opening,expiry);
    const future=await open('ANY',eligible,opening),other=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    await delay(Math.max(0,Date.parse(expiry)-Date.now()+10));
    assert.equal((await db.transaction(other,options(),tx=>owner.pendingExpiry(tx))).some(r=>r.id===request.requestRef.id),false);
    const cmd=await command('abh.responsibility-requests.expire',request.requestRef);
    await assert.rejects(expireResponsibilityRequest(db,worker,options(),cmd,request.requestRef,[]),{code:'AUTHORITY_REQUIRED'});
    const controller=new AbortController();let scanned=0,expired=0;
    await runResponsibilityExpiryWorker(db,{context:async()=>worker,signal:controller.signal,grantRefs:[grant.grantRef],pageSize:100,onPage:async result=>{scanned=result.scanned;expired=result.expired;controller.abort();}});
    assert.equal(scanned,1);assert.equal(expired,1);
    assert.equal((await db.transaction(opening,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Closed');
    assert.equal((await db.transaction(opening,options(),tx=>owner.getRequest(tx,future.requestRef.id))).status,'Open');
    assert.equal(await evidenceCount(request.requestRef.id),'0');
    const replay={...cmd,idempotencyKey:`expire/${request.requestRef.id}/${request.requestRef.version}`};
    assert.equal((await expireResponsibilityRequest(db,worker,options(),replay,request.requestRef,[grant.grantRef])).replayed,true);
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(worker,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[grant.issuanceEvidenceRef]));
    await assert.rejects(expireResponsibilityRequest(db,worker,options(),replay,request.requestRef,[grant.grantRef]),{code:'EPOCH_REVOKED'});
  });
  await t.test('unassigned actor, mismatching package digest and current eligibility denial leave Pending untouched',async()=>{
    const request=await open(),decision=await load(request.decisionRefs[0]!.id);
    await assert.rejects(submit(context(org),decision),{code:'DECIDER_NOT_ELIGIBLE'});
    const stale={...decision,package:{...decision.package,packageDigest:'sha256:'+'b'.repeat(64)}};
    await assert.rejects(submit(a,stale),{code:'DECISION_STALE'});
    await assert.rejects(submit(a,decision,'Approved',{...eligible,submit:async()=>{throw new CoreError('EPOCH_REVOKED');}}),{code:'EPOCH_REVOKED'});
    assert.equal((await load(decision.decisionRef.id)).status,'Pending');
  });

  for(const scopedEffect of [false,true])await t.test(`complete approval issues a bounded Service Grant and Authority with source Workspace scope (${scopedEffect}); replay cannot revive revoked records`,async()=>{
    const workspaceId=randomUUID(),issuer=deriveVerifiedContext({...a.request,workspaceId});
    let proof=completed;
    if(scopedEffect){
      const request=await open('ANY',eligible,issuer),decision=await db.transaction(issuer,options(),tx=>owner.getDecision(tx,request.decisionRefs[0]!.id));
      proof=(await submit(issuer,decision)).completion!;
    }
    const service=ref('abh.principal'),control=new ExecutionAuthorityOwner();
    await db.transaction(issuer,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'fixture executor','Service',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
    });
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[ref('abh.organization',org)],actionTypes:['hello.publish'],purposeNames:['abh.action.execute'],
      validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+30_000).toISOString(),issuanceEvidenceRef:proof.completionEvidenceRef,status:'Active'};
    const unsigned:ExecutionAuthority={authorityRef:ref('abh.execution-authority'),resourceOrganizationId:org,executionPrincipalRef:service,allowedProposerRefs:[assignments[0]!.principalRef],binding:{kind:'Action',actionRef:{...proof.subjectRef,type:'abh.action'},payloadDigest:proof.proposalDigest},
      grantRefs:[grant.grantRef],scopeRefs:grant.scopeRefs,purposeRefs:[ref('abh.purpose')],actionTypes:grant.actionTypes,resourceEnvelopeRef:ref('abh.resource-envelope'),validFrom:grant.validFrom,validUntil:grant.validUntil,stopConditions:[],issuanceEvidenceRef:proof.completionEvidenceRef,
      effectKey:'publish',issuedBy:a.tenant.actor,sourceVersionRefs:[proof.requestRef,...proof.decisionRefs],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'};
    const authority={...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)},input={authority,serviceGrant:grant};
    const checks:AuthorityEffectChecks={lock:async()=>{},scope:async()=>{},decision:async()=>{}};
    const cmd=await command('abh.execution-authority.issue-effect',input);
    const missingUnsigned={...authority,authorityRef:ref('abh.execution-authority'),issuanceEvidenceRef:ref('abh.request-completion-evidence')};
    const missing={...missingUnsigned,issuanceDigest:await digestContract('ExecutionAuthority',missingUnsigned)};
    await assert.rejects(db.transaction(issuer,options(),tx=>control.issueEffect(tx,cmd,{authority:missing,serviceGrant:{...grant,issuanceEvidenceRef:missing.issuanceEvidenceRef}},checks)),{code:'AUTHORITY_REQUIRED'});
    const denied={...checks,scope:async()=>{throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');}};
    await assert.rejects(db.transaction(issuer,options(),tx=>control.issueEffect(tx,cmd,input,denied)),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
    const empty=await db.transaction(issuer,options(),tx=>tx.owner('Control')`SELECT count(*) FROM control.grants WHERE id=${grant.grantRef.id}`);assert.equal(empty[0]!.count,'0');
    const other=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    if(scopedEffect)for(const deniedContext of [a,other])await assert.rejects(db.transaction(deniedContext,options(),tx=>control.issueEffect(tx,cmd,input,checks)),{code:'AUTHORITY_REQUIRED'});
    // Fault injection: installed callbacks cannot waive source/seat/person binding checks.
    const [sourceRow]=await f.admin`SELECT record FROM human.decisions WHERE resource_organization_id=${org} AND id=${proof.decisionRefs[0]!.id}`;
    const source=sourceRow!.record as DecisionRecord;
    const wrongPackageUnsigned={...source.package,requestRef:ref('abh.responsibility-request')},wrongPackage={...wrongPackageUnsigned,packageDigest:await digestContract('DecisionPackage',wrongPackageUnsigned)};
    for(const changed of [
      {...source,respondedBy:{type:'Human' as const,id:randomUUID()}},
      {...source,candidateResponsibilityRefs:[ref('abh.responsibility-assignment')]},
      {...source,package:wrongPackage,submission:{...source.submission!,packageDigest:wrongPackage.packageDigest}},
      {...source,package:{...source.package,routeRevision:source.package.routeRevision+1}},
    ]){
      await f.admin`UPDATE human.decisions SET record=${JSON.stringify(changed)}::text::jsonb WHERE resource_organization_id=${org} AND id=${source.decisionRef.id}`;
      try{await assert.rejects(db.transaction(issuer,options(),tx=>control.issueEffect(tx,cmd,input,checks)),{code:'AUTHORITY_REQUIRED'});}
      finally{await f.admin`UPDATE human.decisions SET record=${JSON.stringify(source)}::text::jsonb WHERE resource_organization_id=${org} AND id=${source.decisionRef.id}`;}
    }
    const [requestRow]=await f.admin`SELECT record FROM human.requests WHERE resource_organization_id=${org} AND id=${proof.requestRef.id}`;
    const sourceRequest=requestRow!.record as ResponsibilityRequestRecord;
    for(const changed of [{...sourceRequest,kind:'Exception' as const},
      {...sourceRequest,requiredSlots:sourceRequest.requiredSlots.map(slot=>({...slot,seats:slot.seats.map(seat=>({...seat,responsibilityRefs:[ref('abh.responsibility-assignment')]}))}))}]){
      await f.admin`UPDATE human.requests SET record=${JSON.stringify(changed)}::text::jsonb WHERE resource_organization_id=${org} AND id=${proof.requestRef.id}`;
      try{await assert.rejects(db.transaction(issuer,options(),tx=>control.issueEffect(tx,cmd,input,checks)),{code:'AUTHORITY_REQUIRED'});}
      finally{await f.admin`UPDATE human.requests SET record=${JSON.stringify(sourceRequest)}::text::jsonb WHERE resource_organization_id=${org} AND id=${proof.requestRef.id}`;}
    }
    const absent=await db.transaction(issuer,options(),tx=>tx.owner('Control')`SELECT count(*) FROM control.execution_authorities WHERE id=${authority.authorityRef.id}`);assert.equal(absent[0]!.count,'0');
    const issue=()=>db.transaction(issuer,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=> (await control.issueEffect(tx,cmd,input,checks)).authorityRef));
    const issued=await Promise.all([issue(),issue()]);assert.deepEqual(issued[0]!.receipt,issued[1]!.receipt);
    const counts=await db.transaction(issuer,options(),tx=>tx.owner('Control')`SELECT (SELECT count(*) FROM control.grants WHERE id=${grant.grantRef.id}) AS grants,
      (SELECT count(*) FROM control.execution_authorities WHERE id=${authority.authorityRef.id}) AS authorities`);assert.deepEqual({...counts[0]},{grants:'1',authorities:'1'});
    const scopes=await f.admin`SELECT workspace_id FROM control.grants WHERE id=${grant.grantRef.id} UNION ALL SELECT workspace_id FROM control.execution_authorities WHERE id=${authority.authorityRef.id}`;
    assert.deepEqual(scopes.map(row=>row.workspace_id),[scopedEffect?workspaceId:null,scopedEffect?workspaceId:null]);
    if(scopedEffect)for(const deniedContext of [a,other]){
      await assert.rejects(db.transaction(deniedContext,options(),tx=>control.issueEffect(tx,cmd,input,checks)),{code:'AUTHORITY_REQUIRED'});
      await assert.rejects(db.transaction(deniedContext,options(),tx=>control.get(tx,authority.authorityRef.id)),{code:'RESOURCE_NOT_FOUND'});
    }
    await db.transaction(issuer,options(),tx=>tx.owner('Control')`UPDATE control.execution_authorities SET status='Revoked',version=2,
      record=jsonb_set(jsonb_set(record,'{status}','"Revoked"'::jsonb),'{authorityRef,version}','2'::jsonb) WHERE id=${authority.authorityRef.id}`);
    const replay=await db.transaction(issuer,options(),tx=>control.issueEffect(tx,cmd,input,checks));assert.equal(replay.status,'Revoked');assert.equal(replay.authorityRef.version,2);
  });

  await t.test('responsibility revocation protects frozen required seats, persists evidence and advances the fence atomically',async()=>{
    const target={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment')},survivor={...assignments[1]!,responsibilityRef:ref('abh.responsibility-assignment')};
    for(const assignment of [target,survivor]){
      const cmd=await command('abh.responsibilities.assign',assignment);await db.transaction(a,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>assignResponsibility(tx,cmd,assignment)));
    }
    const original=[...assignments];assignments.splice(0,assignments.length,target,survivor);
    let required!:ResponsibilityRequestRecord,any!:ResponsibilityRequestRecord;
    try{required=await open('ALL');any=await open('ANY');}finally{assignments.splice(0,assignments.length,...original);}
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:target.principalRef,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.responsibilities.revoke'],purposeNames:['abh.action.prepare'],validFrom:target.validFrom,validUntil:target.validUntil,issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const input={assignmentRef:target.responsibilityRef,reason:'Fixture governed replacement',evidenceRefs:[ref('abh.artifact')]},cmd=await command('abh.responsibilities.revoke',input);
    const checks:ResponsibilityRevocationChecks={fenceRefs:async()=>[target.responsibilityRef,survivor.responsibilityRef],continuity:async()=>{},candidate:async()=>true};
    const revoke=(policy=checks)=>revokeResponsibilityAssignment(db,a,options(),cmd,input,[grant.grantRef],policy);
    await assert.rejects(revokeResponsibilityAssignment(db,a,options(),cmd,input,[],checks),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(revoke(),{code:'LAST_REQUIRED_RESPONSIBILITY'});
    const replacement={...input,replacementRef:survivor.responsibilityRef},replacementCommand=await command('abh.responsibilities.revoke',replacement);
    await assert.rejects(revokeResponsibilityAssignment(db,a,options(),replacementCommand,replacement,[grant.grantRef],checks),{code:'LAST_REQUIRED_RESPONSIBILITY'});
    assert.ok(await db.transaction(a,options(),tx=>currentResponsibility(tx,target.responsibilityRef)));
    // Closing the ALL fixture does not rewrite its historical decision; the ANY seat still has a legal survivor.
    await submit(a,await load(required.decisionRefs[0]!.id),'Rejected');
    await assert.rejects(revoke({...checks,candidate:async()=>false}),{code:'LAST_REQUIRED_RESPONSIBILITY'});
    await assert.rejects(revoke({...checks,continuity:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
    await assert.rejects(db.transaction(a,options(),async tx=>{await revokeResponsibility(tx,cmd,input,checks);throw new Error('revocation rollback');}),/revocation rollback/);
    assert.ok(await db.transaction(a,options(),tx=>currentResponsibility(tx,target.responsibilityRef)));
    const absent=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.responsibility_revocations WHERE assignment_id=${target.responsibilityRef.id}`);assert.equal(absent[0]!.count,'0');
    const results=await Promise.all([revoke(),revoke()]);assert.deepEqual(results[0]!.assignmentRef,results[1]!.assignmentRef);assert.equal(results.filter(r=>r.replayed).length,1);
    assert.equal(await db.transaction(a,options(),tx=>currentResponsibility(tx,target.responsibilityRef)),undefined);
    const facts=await db.transaction(a,options(),async tx=>({evidence:await tx.owner('HumanGateway')`SELECT record FROM human.responsibility_revocations WHERE id=${cmd.commandId}`,
      fence:await tx.owner('Control')`SELECT epoch,stop_flag FROM control.fences WHERE scope_type='abh.responsibility-assignment' AND scope_id=${target.responsibilityRef.id}`,
      events:await tx.owner('DurableExecution')`SELECT record->>'type' AS type FROM data.outbox WHERE record->>'causationId'=${cmd.commandId}`}));
    assert.deepEqual(facts.evidence[0]!.record,input);assert.equal(facts.fence[0]!.epoch,'2');assert.equal(facts.fence[0]!.stop_flag,true);
    assert.deepEqual(facts.events.map(row=>row.type).sort(),['abh.fence.advanced','abh.responsibility-assignment.revoked']);
    await assert.rejects(db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.responsibility_revocations SET record=record`),{code:'42501'});
    const decision=await load(any.decisionRefs[0]!.id);await assert.rejects(submit(a,decision),{code:'DECIDER_NOT_ELIGIBLE'});
    assert.ok((await submit(b,decision)).completion);
    const revokeGrantCommand=await command('abh.grants.revoke',grant.grantRef);await db.transaction(a,options(),tx=>revokeGrant(tx,revokeGrantCommand,grant.grantRef,[grant.issuanceEvidenceRef]));
    await assert.rejects(revoke(),{code:'EPOCH_REVOKED'});
  });
  await t.test('concurrent revocations cannot remove both surviving frozen candidates; foreign Workspace cannot revoke',async()=>{
    const pair=assignments.map(assignment=>({...assignment,responsibilityRef:ref('abh.responsibility-assignment')}));
    for(const assignment of pair){const cmd=await command('abh.responsibilities.assign',assignment);await db.transaction(a,options(),tx=>assignResponsibility(tx,cmd,assignment));}
    const original=[...assignments];assignments.splice(0,assignments.length,...pair);let request!:ResponsibilityRequestRecord;
    try{request=await open('ANY');}finally{assignments.splice(0,assignments.length,...original);}
    const checks:ResponsibilityRevocationChecks={fenceRefs:async()=>pair.map(p=>p.responsibilityRef),continuity:async()=>{},candidate:async()=>true};
    const results=await Promise.allSettled(pair.map(async assignment=>{const input={assignmentRef:assignment.responsibilityRef,reason:'Concurrent fixture',evidenceRefs:[ref('abh.artifact')]},cmd=await command('abh.responsibilities.revoke',input);return db.transaction(a,options(),tx=>revokeResponsibility(tx,cmd,input,checks));}));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected&&rejected.status==='rejected');assert.equal(rejected.reason.code,'LAST_REQUIRED_RESPONSIBILITY');
    const active=await db.transaction(a,options(),async tx=>Promise.all(pair.map(p=>currentResponsibility(tx,p.responsibilityRef))));assert.equal(active.filter(Boolean).length,1);
    assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
    const scoped=deriveVerifiedContext({...a.request,workspaceId:randomUUID()}),foreign=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    const assignment={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment')},assign=await command('abh.responsibilities.assign',assignment);
    await db.transaction(scoped,options(),tx=>assignResponsibility(tx,assign,assignment));
    const input={assignmentRef:assignment.responsibilityRef,reason:'Scoped fixture',evidenceRefs:[ref('abh.artifact')]},cmd=await command('abh.responsibilities.revoke',input);
    for(const denied of [a,foreign])await assert.rejects(db.transaction(denied,options(),tx=>revokeResponsibility(tx,cmd,input,checks)),{code:'RESOURCE_NOT_FOUND'});
    await db.transaction(scoped,options(),tx=>revokeResponsibility(tx,cmd,input,checks));
    const [evidence]=await f.admin`SELECT workspace_id FROM human.responsibility_revocations WHERE resource_organization_id=${org} AND id=${cmd.commandId}`;assert.equal(evidence!.workspace_id,scoped.tenant.workspaceId);
  });
  await t.test('withdrawal requires current subject authority, preserves approved history and records source evidence atomically',async()=>{
    const review=deriveVerifiedContext({...a.request,purposeOfUse:'abh.decision.review'}),request=await open(),first=await load(request.decisionRefs[0]!.id),pending=await load(request.decisionRefs[1]!.id);
    const approved=(await submit(a,first)).decision,payload={reason:'Original matter withdrawn'},sourceRef=ref('abh.artifact');
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:assignments[0]!.principalRef,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.decisions.withdraw'],purposeNames:['abh.decision.review'],validFrom:assignments[0]!.validFrom,validUntil:assignments[0]!.validUntil,issuanceEvidenceRef:sourceRef,status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const checks:DecisionWithdrawalChecks={fenceRefs:async()=>[],admit:async()=>{},lockSubject:async()=>{},source:async()=>[sourceRef]};
    const cmd=await command('abh.decisions.withdraw',{decisionRef:pending.decisionRef,payload}),withdraw=(policy=checks)=>withdrawDecision(db,review,options(),cmd,pending.decisionRef,payload,[grant.grantRef],policy);
    await assert.rejects(withdrawDecision(db,review,options(),cmd,pending.decisionRef,payload,[],checks),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(withdraw({...checks,admit:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
    await assert.rejects(withdraw({...checks,source:async()=>{throw new CoreError('PRECONDITION_FAILED');}}),{code:'PRECONDITION_FAILED'});
    await assert.rejects(withdraw({...checks,source:async()=>[]}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(db.transaction(review,options(),async tx=>{await withdrawPendingDecision(tx,cmd,pending.decisionRef,payload,checks);throw new Error('withdraw rollback');}),/withdraw rollback/);
    assert.equal((await load(pending.decisionRef.id)).status,'Pending');assert.equal((await db.transaction(review,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
    await assert.rejects(db.transaction(review,options(),tx=>withdrawPendingDecision(tx,cmd,approved.decisionRef,payload,checks)),{code:'DECISION_STALE'});
    const results=await Promise.all([withdraw(),withdraw()]);assert.equal(results.filter(r=>r.replayed).length,1);assert.deepEqual(results[0]!.decisionRef,results[1]!.decisionRef);
    assert.deepEqual(await load(first.decisionRef.id),approved);assert.equal((await load(pending.decisionRef.id)).status,'Withdrawn');
    assert.equal((await db.transaction(review,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Withdrawn');assert.equal(await evidenceCount(request.requestRef.id),'0');
    await assert.rejects(submit(b,await load(pending.decisionRef.id)),{code:'DECISION_STALE'});
    const rows=await db.transaction(review,options(),tx=>tx.owner('HumanGateway')`SELECT record FROM human.decision_withdrawals WHERE id=${cmd.commandId}`);assert.equal(rows.length,1);assert.equal(rows[0]!.record.reason,payload.reason);assert.deepEqual(rows[0]!.record.evidenceRefs,[sourceRef]);
    await assert.rejects(db.transaction(review,options(),tx=>tx.owner('HumanGateway')`UPDATE human.decision_withdrawals SET record=record`),{code:'42501'});
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(review,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[sourceRef]));await assert.rejects(withdraw(),{code:'EPOCH_REVOKED'});
  });
  await t.test('HTTP withdrawal authenticates real identity mapping, commits Owner facts and replays the original receipt',async()=>{
    const request=await open('ANY'),decision=await load(request.decisionRefs[0]!.id),sourceRef=ref('abh.artifact');
    const review=deriveVerifiedContext({...a.request,purposeOfUse:'abh.decision.review'});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:assignments[0]!.principalRef,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.decisions.withdraw'],purposeNames:['abh.decision.review'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:sourceRef,status:'Active'};
    const issuer='http.fixture',audience='abh.test',subject=randomUUID(),credentialRef=ref('abh.credential'),identityDigest=await inputDigest([issuer,subject]);
    await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${a.tenant.actor.id},1)`;
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    // Explicit test IdP and source governance; neither is a production default.
    const provider:IdentityProviderPort={verify:async input=>{
      assert.deepEqual(input.credentialRef,credentialRef);assert.equal(input.issuer,issuer);assert.equal(input.audience,audience);
      return {status:'Completed',data:{issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),evidenceRef:ref('abh.identity-evidence')}};
    }};
    let grantsAvailable=false,allowed=true,sourceAvailable=true;
    const app=createCoreHttpApp({database:db,identity:new IdentityIngress(db,provider,{issuer,audience}),credentials:async req=>{
      if(req.headers.authorization!=='Bearer explicit-test-credential')throw new CoreError('UNAUTHENTICATED');
      return {credentialRef,organizationId:org,purpose:'abh.decision.review'};
    },withdrawal:{grants:async verified=>{assert.equal(verified.tenant.actor.id,a.tenant.actor.id);assert.equal(verified.tenant.purposeOfUse,'abh.decision.review');return grantsAvailable?[grant.grantRef]:[];},
      checks:{fenceRefs:async()=>[],admit:async()=>{if(!allowed)throw new CoreError('FORBIDDEN');},lockSubject:async()=>{},source:async()=>{if(!sourceAvailable)throw new CoreError('PRECONDITION_FAILED');return [sourceRef];}}}});
    try{
      const url='/v1/commands/abh.decisions.withdraw',key=randomUUID(),payload={target:{type:'abh.decision',id:decision.decisionRef.id},payload:{reason:'Matter withdrawn via HTTP'}};
      const headers={authorization:'Bearer explicit-test-credential','idempotency-key':key,'if-match':`"${decision.decisionRef.version}"`,'x-request-id':'forged-id','x-context':'{"actor":"admin"}'};
      const send=()=>app.inject({method:'POST',url,headers,payload});
      assert.equal((await app.inject({method:'POST',url,headers:{...headers,authorization:'invalid'},payload})).statusCode,401);
      assert.equal((await send()).statusCode,403);
      grantsAvailable=true;allowed=false;assert.equal((await send()).statusCode,403);allowed=true;
      sourceAvailable=false;assert.equal((await send()).statusCode,500);sourceAvailable=true;
      assert.equal((await load(decision.decisionRef.id)).status,'Pending');
      const results=await Promise.all([send(),send()]);
      for(const result of results)assert.equal(result.statusCode,200,result.body);
      assert.deepEqual(results[0]!.json(),results[1]!.json());
      const data=results[0]!.json().data;
      assert.equal(data.status,'Withdrawn');assert.equal(data.objectRef.id,decision.decisionRef.id);assert.equal(results[0]!.headers.etag,`"${decision.decisionRef.version+1}"`);
      assert.equal((await load(decision.decisionRef.id)).status,'Withdrawn');
      assert.equal((await db.transaction(review,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Withdrawn');
      assert.equal(await evidenceCount(request.requestRef.id),'0');
      const receipts=await f.admin`SELECT record FROM data.command_receipts WHERE resource_organization_id=${org} AND idempotency_key=${key}`;
      assert.equal(receipts.length,1);assert.equal(receipts[0]!.record.commandRef.id,data.commandId);
      const changes=await f.admin`SELECT record FROM data.outbox WHERE resource_organization_id=${org} AND record->>'causationId'=${data.commandId}`;
      assert.ok(changes.length>=2);assert.equal(new Set(changes.map(row=>row.record.correlationId)).size,1);assert.notEqual(changes[0]!.record.correlationId,'forged-id');
      const withdrawalRows=await f.admin`SELECT record FROM human.decision_withdrawals WHERE resource_organization_id=${org} AND id=${data.commandId}`;
      assert.equal(withdrawalRows.length,1);assert.deepEqual(withdrawalRows[0]!.record.evidenceRefs,[sourceRef]);
      const conflict=await app.inject({method:'POST',url,headers,payload:{...payload,payload:{reason:'Changed reason'}}});
      assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');
      const stale=await app.inject({method:'POST',url,headers:{...headers,'idempotency-key':randomUUID()},payload});
      assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'VERSION_CONFLICT');
      allowed=false;assert.equal((await send()).statusCode,403);allowed=true;
      await f.admin`UPDATE identity.principals SET credential_epoch=2 WHERE resource_organization_id=${org} AND id=${a.tenant.actor.id}`;
      try{assert.equal((await send()).statusCode,403);}finally{await f.admin`UPDATE identity.principals SET credential_epoch=1 WHERE resource_organization_id=${org} AND id=${a.tenant.actor.id}`;}
      const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(review,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[sourceRef]));
      const denied=await send();assert.equal(denied.statusCode,403);assert.equal(denied.json().error.code,'FORBIDDEN');assert.equal(denied.json().error.retryable,false);
      assert.equal((await app.inject({method:'POST',url:'/v1/commands/abh.decisions.submit',headers,payload})).statusCode,404);
    }finally{await app.close();}
  });
  await t.test('HTTP submission atomically tracks final ALL effects without applying them and keeps replay responses stable',async()=>{
    const request=await open(),decisions=await Promise.all(request.decisionRefs.map(d=>load(d.id))),source=ref('abh.artifact');
    const issuer='submit.fixture',audience='abh.test',subjects=[randomUUID(),randomUUID()],credentials=[ref('abh.credential'),ref('abh.credential')];
    const grants:GrantRecord[]=[a,b].map((c,i)=>({grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:assignments[i]!.principalRef,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.decisions.submit'],purposeNames:['abh.decision.review'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:source,status:'Active'}));
    for(const [i,c] of [a,b].entries()){
      const identityDigest=await inputDigest([issuer,subjects[i]]),grant=grants[i]!;
      await db.transaction(c,options(),tx=>tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.principal',${c.tenant.actor.id},1) ON CONFLICT(resource_organization_id,scope_type,scope_id) DO NOTHING`);
      await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${c.tenant.actor.id},1)`;
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
      });
    }
    const grantFor=(id:string)=>grants.find(grant=>grant.principalRef.id===id)!;
    const provider:IdentityProviderPort={verify:async input=>{
      const index=credentials.findIndex(ref=>ref.id===input.credentialRef.id);assert.ok(index>=0);
      return {status:'Completed',data:{issuer,audience,subject:subjects[index]!,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),evidenceRef:ref('abh.identity-evidence')}};
    }};
    let permitted=true,invented=false,planMode:'empty'|'wrong'|'duplicate'|'valid'='empty';
    const app=createCoreHttpApp({database:db,identity:new IdentityIngress(db,provider,{issuer,audience}),credentials:async req=>{
      const index=['Bearer test-a','Bearer test-b'].indexOf(String(req.headers.authorization));if(index<0)throw new CoreError('UNAUTHENTICATED');
      return {credentialRef:credentials[index]!,organizationId:org,purpose:'abh.decision.review'};
    },submission:{grants:async c=>[grantFor(c.tenant.actor.id).grantRef],checks:{fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},
      eligibility:{...eligible,submit:async tx=>[invented?ref('abh.grant'):grantFor(tx.context.tenant.actor.id).grantRef]},effects:async(_tx,completion)=>{
        if(planMode==='empty')return [];
        const plan={effectKey:'action-authority',targetOwner:'Control' as const,targetRef:planMode==='wrong'?ref('abh.action'):completion.subjectRef};
        return planMode==='duplicate'?[plan,plan]:[plan];
      }}}});
    try{
      const keys=[randomUUID(),randomUUID()],url='/v1/commands/abh.decisions.submit';
      const send=(i:number)=>app.inject({method:'POST',url,headers:{authorization:`Bearer test-${i===0?'a':'b'}`,'idempotency-key':keys[i]!,'if-match':`"${decisions[i]!.decisionRef.version}"`},payload:{target:{type:'abh.decision',id:decisions[i]!.decisionRef.id},payload:{response:'Approved',packageDigest:decisions[i]!.package.packageDigest,conditionRefs:[]}}});
      const first=await send(0);assert.equal(first.statusCode,200,first.body);assert.deepEqual(first.json().data.effectTrackingRefs,[]);assert.equal(await evidenceCount(request.requestRef.id),'0');
      invented=true;assert.equal((await send(1)).statusCode,403);invented=false;
      for(const mode of ['empty','wrong','duplicate'] as const){planMode=mode;const result=await send(1);assert.equal(result.statusCode,mode==='wrong'?403:400,result.body);assert.equal((await load(decisions[1]!.decisionRef.id)).status,'Pending');assert.equal(await evidenceCount(request.requestRef.id),'0');}
      const [noEffects]=await f.admin`SELECT count(*) FROM human.decision_effects WHERE resource_organization_id=${org} AND request_id=${request.requestRef.id}`;assert.equal(noEffects!.count,'0');
      planMode='valid';const results=await Promise.all([send(1),send(1)]);for(const result of results)assert.equal(result.statusCode,200,result.body);assert.deepEqual(results[0]!.json(),results[1]!.json());
      const data=results[0]!.json().data;assert.equal(data.effectTrackingRefs.length,1);assert.equal(await evidenceCount(request.requestRef.id),'1');
      assert.deepEqual((await send(0)).json(),first.json());
      const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer test-b'}),fetch:async(input,init)=>{
        const response=await app.inject({method:init?.method as 'GET'|'POST',url:new URL(String(input)).pathname,headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
        return new Response(response.body,{status:response.statusCode,headers:{'content-type':String(response.headers['content-type'])}});
      }});
      assert.deepEqual(await client.decisions.submit({id:decisions[1]!.decisionRef.id,expectedVersion:decisions[1]!.decisionRef.version,idempotencyKey:keys[1]!,payload:{response:'Approved',packageDigest:decisions[1]!.package.packageDigest,conditionRefs:[]}}),results[0]!.json());

      const rows=await f.admin`SELECT record,workspace_id FROM human.decision_effects WHERE resource_organization_id=${org} AND request_id=${request.requestRef.id}`;
      assert.equal(rows.length,1);assert.deepEqual(rows[0]!.record.effectRef,data.effectTrackingRefs[0]);assert.equal(rows[0]!.record.status,'Pending');assert.equal(rows[0]!.record.receiptRef,undefined);assert.equal(rows[0]!.record.originatingCommandRef.id,data.commandId);assert.equal(rows[0]!.record.decisionRefs.length,2);assert.deepEqual(rows[0]!.record.targetRef,request.subjectRef);assert.equal(rows[0]!.workspace_id,null);
      const events=await f.admin`SELECT record FROM data.outbox WHERE resource_organization_id=${org} AND aggregate_type='abh.decision-effect' AND aggregate_id=${data.effectTrackingRefs[0].id}`;assert.equal(events.length,1);assert.equal(events[0]!.record.causationId,data.commandId);
      const authorities=await f.admin`SELECT count(*) FROM control.execution_authorities WHERE resource_organization_id=${org} AND evidence_id=${rows[0]!.record.completionEvidenceRef.id}`;assert.equal(authorities[0]!.count,'0');
      const review=deriveVerifiedContext({...a.request,purposeOfUse:'abh.decision.review'});
      await assert.rejects(db.transaction(review,options(),tx=>tx.owner('HumanGateway')`UPDATE human.decision_effects SET record=record`),{code:'42501'});
      const effectReadGrant:GrantRecord={...grants[0]!,grantRef:ref('abh.grant'),actionTypes:['abh.decisions.read']};
      await db.transaction(a,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${effectReadGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${effectReadGrant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(effectReadGrant)}::text::jsonb,${effectReadGrant.validFrom},${effectReadGrant.validUntil},'Active')`;
      });
      let effectVisible=true,queryAllowed=true;
      const effectAdmission={admit:async()=>{if(!queryAllowed)throw new CoreError('FORBIDDEN');},canRead:async()=>true,canReadEffect:async()=>effectVisible};
      const readEffects=()=>db.transaction(review,options(),tx=>queryDecisionEffects(tx,decisions[0]!.decisionRef.id,[effectReadGrant.grantRef],effectAdmission));
      assert.deepEqual(await readEffects(),[{effectRef:data.effectTrackingRefs[0],status:'Pending'}]);
      effectVisible=false;assert.deepEqual(await readEffects(),[]);effectVisible=true;
      queryAllowed=false;await assert.rejects(readEffects(),{code:'FORBIDDEN'});queryAllowed=true;
      await assert.rejects(db.transaction(review,options(),tx=>queryDecisionEffects(tx,decisions[0]!.decisionRef.id,[],effectAdmission)),{code:'AUTHORITY_REQUIRED'});
      // Complete the actual Control effect after submission; current management is independent of approval.
      const intent=rows[0]!.record,service=ref('abh.principal');
      const effectContext=deriveVerifiedContext({...a.request,actor:{type:'Service',id:service.id}});
      const [proofRow]=await f.admin`SELECT record FROM human.completion_evidence WHERE resource_organization_id=${org} AND id=${intent.completionEvidenceRef.id}`;
      const proof=proofRow!.record as RequestCompletionEvidence;
      const progress=()=>db.transaction(a,options(),tx=>readRequestControlEffect(tx,intent.requestRef,intent.targetRef,intent.effectKey));
      assert.deepEqual(await progress(),{status:'AwaitingEffect',effectRef:intent.effectRef});
      await assert.rejects(db.transaction(a,options(),tx=>readRequestControlEffect(tx,intent.requestRef,ref('abh.action'),intent.effectKey)),{code:'FORBIDDEN'});
      const outputGrant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[ref('abh.organization',org)],actionTypes:['hello.publish'],purposeNames:['abh.action.execute'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+30_000).toISOString(),issuanceEvidenceRef:proof.completionEvidenceRef,status:'Active'};
      const management:GrantRecord={...outputGrant,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.execution-authority.create'],purposeNames:['abh.action.prepare'],issuanceEvidenceRef:source};
      await db.transaction(a,options(),async tx=>{
        await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'effect fixture executor','Service',1,'Active')`;
        await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${management.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.principal',${service.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${management.grantRef.id},${service.id},${JSON.stringify(management)}::text::jsonb,${management.validFrom},${management.validUntil},'Active')`;
      });
      const unsigned:ExecutionAuthority={authorityRef:ref('abh.execution-authority'),resourceOrganizationId:org,executionPrincipalRef:service,allowedProposerRefs:[assignments[0]!.principalRef],binding:{kind:'Action',actionRef:{...proof.subjectRef,type:'abh.action'},payloadDigest:proof.proposalDigest},grantRefs:[outputGrant.grantRef],scopeRefs:outputGrant.scopeRefs,purposeRefs:[ref('abh.purpose')],actionTypes:outputGrant.actionTypes,resourceEnvelopeRef:ref('abh.resource-envelope'),validFrom:outputGrant.validFrom,validUntil:outputGrant.validUntil,stopConditions:[],issuanceEvidenceRef:proof.completionEvidenceRef,effectKey:intent.effectKey,issuedBy:effectContext.tenant.actor,sourceVersionRefs:[proof.requestRef,...proof.decisionRefs],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'};
      const authority={...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)},effectInput={authority,serviceGrant:outputGrant};
      let manageAllowed=true,scopeAllowed=false;
      const effectChecks:ControlDecisionEffectChecks={fenceRefs:async()=>[],admit:async()=>{if(!manageAllowed)throw new CoreError('FORBIDDEN');},authority:{lock:async()=>{},scope:async()=>{if(!scopeAllowed)throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');},decision:async()=>{}}};
      const apply=()=>applyControlDecisionEffect(db,effectContext,options(),intent.effectRef,effectInput,[management.grantRef],effectChecks);
      await assert.rejects(applyControlDecisionEffect(db,effectContext,options(),intent.effectRef,effectInput,[],effectChecks),{code:'AUTHORITY_REQUIRED'});
      await assert.rejects(applyControlDecisionEffect(db,context(),options(),intent.effectRef,effectInput,[management.grantRef],effectChecks),{code:'RESOURCE_NOT_FOUND'});
      await assert.rejects(apply(),{code:'PRECONDITION_FAILED'});
      await assert.rejects(prepareControlDecisionEffect(db,effectContext,options(),intent.effectRef,effectInput,[],effectChecks),{code:'AUTHORITY_REQUIRED'});
      const prepared=await Promise.all([1,2].map(()=>prepareControlDecisionEffect(db,effectContext,options(),intent.effectRef,effectInput,[management.grantRef],effectChecks)));
      assert.deepEqual(prepared[0],effectInput);assert.deepEqual(prepared[0],prepared[1]);
      const reconnected=await Database.connect(f.runtimeUrl,{max:1});
      try{assert.deepEqual(await reconnected.transaction(a,options(),tx=>getControlDecisionEffectInput(tx,intent.effectRef)),effectInput);}finally{await reconnected.close();}
      await assert.rejects(db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.control_effect_inputs SET record=record`),{code:'42501'});
      const changedBeforeUnsigned={...authority,authorityRef:ref('abh.execution-authority')},changedBefore={...changedBeforeUnsigned,issuanceDigest:await digestContract('ExecutionAuthority',changedBeforeUnsigned)};
      await assert.rejects(prepareControlDecisionEffect(db,effectContext,options(),intent.effectRef,{authority:changedBefore,serviceGrant:outputGrant},[management.grantRef],effectChecks),{code:'IDEMPOTENCY_CONFLICT'});
      await assert.rejects(applyControlDecisionEffect(db,effectContext,options(),intent.effectRef,{authority:changedBefore,serviceGrant:outputGrant},[management.grantRef],effectChecks),{code:'IDEMPOTENCY_CONFLICT'});
      for(const patch of [{validUntil:new Date(Date.parse(authority.validUntil)+1000).toISOString()},{resourceEnvelopeRef:ref('abh.resource-envelope')},{scopeRefs:[ref('abh.organization')]}]){
        const unsignedChange={...authority,...patch},changedPayload={authority:{...unsignedChange,issuanceDigest:await digestContract('ExecutionAuthority',unsignedChange)},serviceGrant:outputGrant};
        await assert.rejects(prepareControlDecisionEffect(db,effectContext,options(),intent.effectRef,changedPayload,[management.grantRef],effectChecks),{code:'IDEMPOTENCY_CONFLICT'});
      }
      await assert.rejects(apply(),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
      assert.equal(await db.transaction(a,options(),tx=>getDecisionEffectReceipt(tx,intent.effectRef)),undefined);
      const [beforeEffect]=await f.admin`SELECT (SELECT count(*) FROM control.grants WHERE id=${outputGrant.grantRef.id}) AS grants,(SELECT count(*) FROM control.execution_authorities WHERE id=${authority.authorityRef.id}) AS authorities,(SELECT count(*) FROM data.command_receipts WHERE id=${intent.commandRef.id}) AS receipts`;
      assert.deepEqual({...beforeEffect},{grants:'0',authorities:'0',receipts:'0'});
      scopeAllowed=true;
      await f.admin`CREATE FUNCTION human.fixture_reject_effect_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt failure'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_effect_receipt BEFORE INSERT ON human.decision_effect_receipts FOR EACH ROW EXECUTE FUNCTION human.fixture_reject_effect_receipt()`;
      try{await assert.rejects(apply(),{code:'P0001'});}finally{await f.admin`DROP TRIGGER fixture_reject_effect_receipt ON human.decision_effect_receipts`;await f.admin`DROP FUNCTION human.fixture_reject_effect_receipt()`;}
      const [rolledBack]=await f.admin`SELECT (SELECT count(*) FROM control.grants WHERE id=${outputGrant.grantRef.id}) AS grants,(SELECT count(*) FROM control.execution_authorities WHERE id=${authority.authorityRef.id}) AS authorities,(SELECT count(*) FROM data.outbox WHERE record->>'causationId'=${intent.commandRef.id}) AS events`;
      assert.deepEqual({...rolledBack},{grants:'0',authorities:'0',events:'0'});
      assert.deepEqual(await db.transaction(a,options(),tx=>getControlDecisionEffectInput(tx,intent.effectRef)),effectInput);
      let refreshes=0;
      const drifting=deriveVerifiedContext({...effectContext.request,workspaceId:randomUUID()});
      await assert.rejects(runControlEffectWorker(db,{context:async()=>++refreshes===1?effectContext:drifting,signal:new AbortController().signal,grantRefs:[management.grantRef],checks:effectChecks}),{code:'FORBIDDEN'});
      const hangingStop=new AbortController();let entered!:()=>void;const enteredContext=new Promise<void>(resolve=>{entered=resolve;});
      const hanging=runControlEffectWorker(db,{context:async()=>{entered();return new Promise(()=>{});},signal:hangingStop.signal,grantRefs:[management.grantRef],checks:effectChecks});
      await enteredContext;hangingStop.abort();await hanging;
      const stats:{scanned:number;applied:number;replayed:number}[]=[];
      await assert.rejects(runControlEffectWorker(db,{context:async()=>a,signal:new AbortController().signal,grantRefs:[management.grantRef],checks:effectChecks}),{code:'FORBIDDEN'});
      await assert.rejects(runControlEffectWorker(db,{context:async()=>effectContext,signal:new AbortController().signal,grantRefs:[],checks:effectChecks}),{code:'AUTHORITY_REQUIRED'});
      await Promise.all([1,2].map(async()=>{const stop=new AbortController();await runControlEffectWorker(db,{context:async()=>effectContext,signal:stop.signal,grantRefs:[management.grantRef],checks:effectChecks,onPage:async result=>{stats.push(result);stop.abort();}});}));
      assert.equal(stats.reduce((sum,p)=>sum+p.applied,0),1);
      const applied=await Promise.all([apply(),apply()]);assert.ok(applied.every(r=>r.replayed));assert.deepEqual(applied[0]!.receipt,applied[1]!.receipt);
      const observerStop=new AbortController();let observing!:()=>void,observerSignal:AbortSignal|undefined;
      const observerEntered=new Promise<void>(resolve=>{observing=resolve;});
      const observedWorker=runControlEffectWorker(db,{context:async()=>effectContext,signal:observerStop.signal,grantRefs:[management.grantRef],checks:effectChecks,onPage:async(_result,options)=>{observerSignal=options.signal;observing();return new Promise(()=>{});}});
      await observerEntered;observerStop.abort();await observedWorker;assert.equal(observerSignal?.aborted,true);
      const drained=new AbortController();await runControlEffectWorker(db,{context:async()=>effectContext,signal:drained.signal,grantRefs:[management.grantRef],checks:effectChecks,onPage:async result=>{assert.deepEqual(result,{scanned:0,applied:0,replayed:0});drained.abort();}});
      assert.deepEqual(await progress(),{status:'EffectApplied',effectRef:intent.effectRef,receipt:applied[0]!.receipt});
      assert.equal(applied[0]!.receipt.status,'Applied');assert.deepEqual(applied[0]!.receipt.grantRefs,[outputGrant.grantRef]);assert.deepEqual(applied[0]!.receipt.authorityRef,authority.authorityRef);assert.deepEqual(applied[0]!.receipt.receiptRef,intent.commandRef);
      const [effectCounts]=await f.admin`SELECT (SELECT count(*) FROM human.decision_effect_receipts WHERE effect_id=${intent.effectRef.id}) AS receipts,(SELECT count(*) FROM data.outbox WHERE aggregate_type='abh.decision-effect' AND aggregate_id=${intent.effectRef.id} AND aggregate_version=2) AS events`;
      assert.deepEqual({...effectCounts},{receipts:'1',events:'1'});
      await assert.rejects(db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.decision_effect_receipts SET record=record`),{code:'42501'});
      const changedUnsigned={...authority,resourceEnvelopeRef:ref('abh.resource-envelope')},changed={...changedUnsigned,issuanceDigest:await digestContract('ExecutionAuthority',changedUnsigned)};
      await assert.rejects(applyControlDecisionEffect(db,effectContext,options(),intent.effectRef,{authority:changed,serviceGrant:outputGrant},[management.grantRef],effectChecks),{code:'IDEMPOTENCY_CONFLICT'});
      manageAllowed=false;await assert.rejects(apply(),{code:'FORBIDDEN'});await assert.rejects(prepareControlDecisionEffect(db,effectContext,options(),intent.effectRef,effectInput,[management.grantRef],effectChecks),{code:'FORBIDDEN'});manageAllowed=true;
      await f.admin`UPDATE control.execution_authorities SET status='Revoked',version=2,record=jsonb_set(jsonb_set(record,'{status}','"Revoked"'::jsonb),'{authorityRef,version}','2'::jsonb) WHERE resource_organization_id=${org} AND id=${authority.authorityRef.id}`;
      assert.deepEqual((await apply()).receipt,applied[0]!.receipt);
      assert.equal((await progress()).status,'EffectApplied','historical application does not imply the revoked authority is currently usable');
      assert.deepEqual(await readEffects(),[{effectRef:intent.effectRef,status:'Applied',receiptRef:intent.commandRef}]);
      effectVisible=false;assert.deepEqual(await readEffects(),[]);effectVisible=true;
      await f.admin`UPDATE human.decision_effect_receipts SET purpose_names=ARRAY['abh.action.prepare'] WHERE effect_id=${intent.effectRef.id}`;
      try{assert.deepEqual(await readEffects(),[]);}finally{await f.admin`UPDATE human.decision_effect_receipts SET purpose_names=ARRAY['abh.action.prepare','abh.runtime.deliver','abh.decision.review'] WHERE effect_id=${intent.effectRef.id}`;}
      const revokeRead=await command('abh.grants.revoke',effectReadGrant.grantRef);await db.transaction(review,options(),tx=>revokeGrant(tx,revokeRead,effectReadGrant.grantRef,[source]));await assert.rejects(readEffects(),{code:'EPOCH_REVOKED'});
      const [revokedAuthority]=await f.admin`SELECT status,version FROM control.execution_authorities WHERE id=${authority.authorityRef.id}`;assert.equal(revokedAuthority!.status,'Revoked');assert.equal(revokedAuthority!.version,'2');
      const revokeManagement=await command('abh.grants.revoke',management.grantRef);await db.transaction(a,options(),tx=>revokeGrant(tx,revokeManagement,management.grantRef,[source]));await assert.rejects(apply(),{code:'EPOCH_REVOKED'});
      await assert.rejects(runControlEffectWorker(db,{context:async()=>effectContext,signal:new AbortController().signal,grantRefs:[management.grantRef],checks:effectChecks}),{code:'EPOCH_REVOKED'});
      permitted=false;assert.equal((await send(1)).statusCode,403);permitted=true;
      await f.admin`UPDATE human.responsibilities SET status='Revoked' WHERE resource_organization_id=${org} AND id=${assignments[1]!.responsibilityRef.id}`;
      try{assert.equal((await send(1)).json().error.code,'DECIDER_NOT_ELIGIBLE');}finally{await f.admin`UPDATE human.responsibilities SET status='Active' WHERE resource_organization_id=${org} AND id=${assignments[1]!.responsibilityRef.id}`;}
      const rejectedRequest=await open('ANY'),rejectedDecision=await load(rejectedRequest.decisionRefs[0]!.id);
      const rejected=await app.inject({method:'POST',url,headers:{authorization:'Bearer test-a','idempotency-key':randomUUID(),'if-match':`"${rejectedDecision.decisionRef.version}"`},payload:{target:{type:'abh.decision',id:rejectedDecision.decisionRef.id},payload:{response:'Rejected',reason:'Fixture rejection',packageDigest:rejectedDecision.package.packageDigest,conditionRefs:[]}}});
      assert.equal(rejected.statusCode,200,rejected.body);assert.equal(rejected.json().data.status,'Rejected');assert.deepEqual(rejected.json().data.effectTrackingRefs,[]);assert.equal(await evidenceCount(rejectedRequest.requestRef.id),'0');

      const revoke=await command('abh.grants.revoke',grants[1]!.grantRef);await db.transaction(b,options(),tx=>revokeGrant(tx,revoke,grants[1]!.grantRef,[source]));assert.equal((await send(1)).statusCode,403);
    }finally{await app.close();}
  });
  await t.test('withdrawal competes with final approval and respects Workspace boundaries',async()=>{
    const scoped=deriveVerifiedContext({...a.request,workspaceId:randomUUID()}),foreign=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    const checks:DecisionWithdrawalChecks={fenceRefs:async()=>[],admit:async()=>{},lockSubject:async()=>{},source:async()=>[ref('abh.artifact')]};
    const request=await open('ANY',eligible,scoped),decision=await db.transaction(scoped,options(),tx=>owner.getDecision(tx,request.decisionRefs[0]!.id)),payload={reason:'Fixture source withdrawal'},cmd=await command('abh.decisions.withdraw',{decisionRef:decision.decisionRef,payload});
    for(const denied of [a,foreign])await assert.rejects(db.transaction(denied,options(),tx=>withdrawPendingDecision(tx,cmd,decision.decisionRef,payload,checks)),{code:'RESOURCE_NOT_FOUND'});
    const results=await Promise.allSettled([db.transaction(scoped,options(),tx=>withdrawPendingDecision(tx,cmd,decision.decisionRef,payload,checks)),submit(scoped,decision)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const actual=await db.transaction(scoped,options(),tx=>owner.getDecision(tx,decision.decisionRef.id)),current=await db.transaction(scoped,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    assert.ok(['Approved','Withdrawn'].includes(actual.status));assert.equal(current.status,actual.status==='Approved'?'Closed':'Withdrawn');
    assert.equal(await evidenceCount(request.requestRef.id),actual.status==='Approved'?'1':'0');
    if(actual.status==='Withdrawn'){
      const [row]=await f.admin`SELECT workspace_id FROM human.decision_withdrawals WHERE id=${cmd.commandId}`;assert.equal(row!.workspace_id,scoped.tenant.workspaceId);
    }
  });
  await t.test('Workspace-only candidate cannot preserve an organization-wide required seat during revocation',async()=>{
    const workspaceId=randomUUID(),scoped=deriveVerifiedContext({...a.request,workspaceId});
    const target={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment')},narrow={...assignments[1]!,responsibilityRef:ref('abh.responsibility-assignment')};
    for(const [assignment,c] of [[target,a],[narrow,scoped]] as const){const cmd=await command('abh.responsibilities.assign',assignment);await db.transaction(c,options(),tx=>assignResponsibility(tx,cmd,assignment));}
    const original=[...assignments];assignments.splice(0,assignments.length,target,narrow);let request!:ResponsibilityRequestRecord;
    try{request=await open('ANY');}finally{assignments.splice(0,assignments.length,...original);}
    const input={assignmentRef:target.responsibilityRef,reason:'Scope coverage fixture',evidenceRefs:[ref('abh.artifact')]},cmd=await command('abh.responsibilities.revoke',input);
    const checks:ResponsibilityRevocationChecks={fenceRefs:async()=>[],candidate:async()=>true,continuity:async()=>{}};
    await assert.rejects(db.transaction(scoped,options(),tx=>revokeResponsibility(tx,cmd,input,checks)),{code:'LAST_REQUIRED_RESPONSIBILITY'});
    assert.ok(await db.transaction(a,options(),tx=>currentResponsibility(tx,target.responsibilityRef)));
    const [evidence]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.responsibility_revocations WHERE assignment_id=${target.responsibilityRef.id}`);assert.equal(evidence!.count,'0');
    // An organization-wide survivor does cover the organization-wide request.
    await f.admin`UPDATE human.responsibilities SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${narrow.responsibilityRef.id}`;
    await db.transaction(scoped,options(),tx=>revokeResponsibility(tx,cmd,input,checks));
    assert.equal((await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id))).status,'Open');
  });
  await t.test('retry and final approval require candidates to cover original Request Workspace scope',async()=>{
    const scoped=deriveVerifiedContext({...a.request,workspaceId:randomUUID()}),narrow={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment')};
    const assign=await command('abh.responsibilities.assign',narrow);await db.transaction(scoped,options(),tx=>assignResponsibility(tx,assign,narrow));
    const original=[...assignments];assignments.splice(0,assignments.length,narrow);
    let request!:ResponsibilityRequestRecord;
    try{request=await open('ANY',{...eligible,candidate:async()=>false});}finally{assignments.splice(0,assignments.length,...original);}
    const proposal=proposals.get(request.requestRef.id)!,retry=await command('abh.responsibility-requests.retry-route',proposal);
    const unresolved=await db.transaction(scoped,options(),tx=>owner.retryUnresolved(tx,retry,proposal,eligible));assert.equal(unresolved.status,'Unresolved');assert.equal(unresolved.decisionRefs.length,0);
    // Fault injection models a previously widened routing record: final approval must also reject it.
    await f.admin`UPDATE human.responsibilities SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${narrow.responsibilityRef.id}`;
    const opened=await db.transaction(scoped,options(),tx=>owner.retryUnresolved(tx,retry,proposal,eligible)),decision=await load(opened.decisionRefs[0]!.id);
    await f.admin`UPDATE human.responsibilities SET workspace_id=${scoped.tenant.workspaceId!} WHERE resource_organization_id=${org} AND id=${narrow.responsibilityRef.id}`;
    await assert.rejects(submit(scoped,decision),{code:'DECIDER_NOT_ELIGIBLE'});assert.equal(await evidenceCount(request.requestRef.id),'0');
    assert.equal((await load(decision.decisionRef.id)).status,'Pending');
  });
  await t.test('governed route revision preserves approved history, supersedes pending seats and requires fresh completion',async()=>{
    const request=await open(),first=await load(request.decisionRefs[0]!.id),pending=await load(request.decisionRefs[1]!.id),approved=(await submit(a,first)).decision;
    const old=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    const next={...old,requestRef:{...old.requestRef,version:old.requestRef.version+1},routeRevision:old.routeRevision+1,decisionRefs:[],status:'Unresolved' as const,
      requiredSlots:old.requiredSlots.map(slot=>({...slot,seats:slot.seats.map((seat,i)=>({...seat,responsibilityRefs:[assignments[1-i]!.responsibilityRef]}))}))};
    const pkgUnsigned={...first.package,requestRef:next.requestRef,routeRevision:next.routeRevision},pkg={...pkgUnsigned,packageDigest:await digestContract('DecisionPackage',pkgUnsigned)};
    const input:ReviseResponsibilityRoutePayload={expectedRequestRef:old.requestRef,proposal:{request:next,packages:[pkg]},frozenPolicyRefs:[ref('abh.policy-version')],directoryRef:ref('abh.artifact'),evidenceRefs:[ref('abh.artifact')],reason:'Governed seat replacement fixture'};
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:assignments[0]!.principalRef,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.responsibility-requests.revise-route'],purposeNames:['abh.action.prepare'],validFrom:assignments[0]!.validFrom,validUntil:assignments[0]!.validUntil,issuanceEvidenceRef:input.evidenceRefs[0]!,status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const installation:RouteRevisionInstallation={eligibility:eligible,fenceRefs:async()=>[],admit:async()=>{},govern:async()=>{}};
    const cmd=await command('abh.responsibility-requests.revise-route',input),revise=(policy=installation)=>reviseResponsibilityRoute(db,a,options(),cmd,input,[grant.grantRef],policy);
    await assert.rejects(reviseResponsibilityRoute(db,a,options(),cmd,input,[],installation),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(revise({...installation,govern:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
    for(const changed of [{...next,expiresAt:new Date(Date.parse(next.expiresAt)+1000).toISOString()},{...next,proposalDigest:'sha256:'+'c'.repeat(64)},
      {...next,requiredSlots:next.requiredSlots.map(slot=>({...slot,selectionMode:'ANY' as const,seats:slot.seats.slice(0,1)}))},
      {...next,requiredSlots:next.requiredSlots.map(slot=>({...slot,seats:slot.seats.slice(0,1)}))}]){
      await assert.rejects(db.transaction(a,options(),tx=>owner.reviseRoute(tx,cmd,{...input,proposal:{...input.proposal,request:changed}},eligible,async()=>{})),{code:'DECISION_PACKAGE_INCOMPLETE'});
    }
    await assert.rejects(db.transaction(a,options(),async tx=>{await owner.reviseRoute(tx,cmd,input,eligible,async()=>{});throw new Error('route revision rollback');}),/route revision rollback/);
    assert.deepEqual(await load(first.decisionRef.id),approved);assert.equal((await load(pending.decisionRef.id)).status,'Pending');
    assert.deepEqual(await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id)),old);
    const [rolledBack]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.routing_proposals WHERE request_id=${request.requestRef.id} AND route_revision=2`);assert.equal(rolledBack!.count,'0');
    const result=await Promise.all([revise(),revise()]);assert.equal(result.filter(r=>r.replayed).length,1);
    await assert.rejects(revise({...installation,admit:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
    const routeEvents=await db.transaction(a,options(),tx=>tx.owner('DurableExecution')`SELECT record->>'type' AS type,event_ordinal FROM data.outbox WHERE resource_organization_id=${org} AND aggregate_id=${request.requestRef.id} AND aggregate_version=${next.requestRef.version} ORDER BY event_ordinal`);
    assert.deepEqual(routeEvents.map(row=>[row.type,row.event_ordinal]),[['abh.responsibility-request.unroute',0],['abh.responsibility-request.route-revised',1]]);
    const routed=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));assert.equal(routed.status,'Open');assert.equal(routed.routeRevision,2);assert.equal(routed.requestRef.version,old.requestRef.version+2);
    assert.deepEqual(await load(first.decisionRef.id),approved);assert.equal((await load(pending.decisionRef.id)).status,'Superseded');assert.equal(await evidenceCount(request.requestRef.id),'0');
    await assert.rejects(submit(b,pending),{code:'VERSION_CONFLICT'});
    const decisions=await Promise.all(routed.decisionRefs.map(ref=>load(ref.id)));assert.ok(decisions.every(d=>d.status==='Pending'&&d.package.routeRevision===2));
    await submit(b,decisions.find(d=>d.seatId==='seat-0')!);assert.equal(await evidenceCount(request.requestRef.id),'0');
    const final=await submit(a,decisions.find(d=>d.seatId==='seat-1')!);assert.equal(final.completion!.routeRevision,2);
    const [record]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT record FROM human.route_revisions WHERE request_id=${request.requestRef.id}`);assert.deepEqual(record!.record,{previousRequest:old,change:input});
    await assert.rejects(db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.route_revisions SET record=record`),{code:'42501'});
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(a,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[grant.issuanceEvidenceRef]));await assert.rejects(revise(),{code:'EPOCH_REVOKED'});
  });
  await t.test('unroutable new revision stays Unresolved and later retries only the new frozen seats within original Workspace',async()=>{
    const scoped=deriveVerifiedContext({...a.request,workspaceId:randomUUID()}),foreign=deriveVerifiedContext({...a.request,workspaceId:randomUUID()});
    const request=await open('ANY',eligible,scoped),decision=await db.transaction(scoped,options(),tx=>owner.getDecision(tx,request.decisionRefs[0]!.id));
    const next={...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},routeRevision:2,status:'Unresolved' as const,decisionRefs:[]};
    const unsigned={...decision.package,requestRef:next.requestRef,routeRevision:2},pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)};
    const input:ReviseResponsibilityRoutePayload={expectedRequestRef:request.requestRef,proposal:{request:next,packages:[pkg]},frozenPolicyRefs:[ref('abh.policy-version')],directoryRef:ref('abh.artifact'),evidenceRefs:[ref('abh.artifact')],reason:'Retry governed directory'};
    const cmd=await command('abh.responsibility-requests.revise-route',input);
    await assert.rejects(db.transaction(foreign,options(),tx=>owner.reviseRoute(tx,cmd,input,eligible,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
    const results=await Promise.allSettled([1,2].map(()=>db.transaction(scoped,options(),tx=>owner.reviseRoute(tx,cmd,input,{...eligible,candidate:async()=>false},async()=>{}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const unresolved=await db.transaction(scoped,options(),tx=>owner.getRequest(tx,request.requestRef.id));assert.deepEqual(unresolved,next);assert.deepEqual(await db.transaction(scoped,options(),tx=>owner.getRoutingProposal(tx,unresolved.requestRef)),input.proposal);assert.equal((await db.transaction(scoped,options(),tx=>owner.getDecision(tx,decision.decisionRef.id))).status,'Superseded');
    const retry=await command('abh.responsibility-requests.retry-route',input.proposal),opened=await db.transaction(scoped,options(),tx=>owner.retryUnresolved(tx,retry,input.proposal,eligible));assert.equal(opened.status,'Open');assert.equal(opened.routeRevision,2);
    const fresh=await db.transaction(scoped,options(),tx=>owner.getDecision(tx,opened.decisionRefs[0]!.id));assert.equal(fresh.package.routeRevision,2);assert.ok((await submit(scoped,fresh)).completion);
    const [row]=await f.admin`SELECT workspace_id FROM human.route_revisions WHERE request_id=${request.requestRef.id}`;assert.equal(row!.workspace_id,scoped.tenant.workspaceId);
  });
  await t.test('dedicated delegate slot replaces one seat through governed revision',async()=>{
    const c=context(org),request=await open(),first=await load(request.decisionRefs[0]!.id),pending=await load(request.decisionRefs[1]!.id);
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${c.tenant.actor.id},'delegated reviewer','Human',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${c.tenant.actor.id},1,'Active')`;
    });
    const delegateAssignment:ResponsibilityAssignmentRecord={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment'),
      principalRef:ref('abh.principal',c.tenant.actor.id),validFrom:new Date(Date.now()-1000).toISOString(),validUntil:request.expiresAt};
    const assign=await command('abh.responsibilities.assign',delegateAssignment);
    await db.transaction(c,options(),tx=>assignResponsibility(tx,assign,delegateAssignment));
    await submit(a,first);
    const old=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    const next={...old,requestRef:{...old.requestRef,version:old.requestRef.version+1},routeRevision:old.routeRevision+1,decisionRefs:[],status:'Unresolved' as const,
      requiredSlots:old.requiredSlots.map(slot=>({...slot,seats:slot.seats.map(seat=>seat.seatId==='seat-0'
        ?{...seat,responsibilityRefs:[delegateAssignment.responsibilityRef]}:seat)}))};
    const pkgUnsigned={...first.package,requestRef:next.requestRef,routeRevision:next.routeRevision};
    const pkg={...pkgUnsigned,packageDigest:await digestContract('DecisionPackage',pkgUnsigned)};
    const input:ReviseResponsibilityRoutePayload={expectedRequestRef:old.requestRef,proposal:{request:next,packages:[pkg]},
      frozenPolicyRefs:[ref('abh.policy-version')],directoryRef:ref('abh.artifact'),evidenceRefs:[delegateAssignment.responsibilityRef],
      reason:'Delegate approval seat',delegation:{slotId:'approve',seatId:'seat-0',responsibilityRef:delegateAssignment.responsibilityRef}};
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',a.tenant.actor.id),scopeRefs:[ref('abh.organization',org)],
      actionTypes:['abh.responsibility-requests.delegate-slot'],purposeNames:['abh.action.prepare'],validFrom:delegateAssignment.validFrom,
      validUntil:delegateAssignment.validUntil,issuanceEvidenceRef:input.evidenceRefs[0]!,status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const installation:RouteRevisionInstallation={eligibility:eligible,fenceRefs:async()=>[],admit:async()=>{},govern:async()=>{}};
    const cmd=await command('abh.responsibility-requests.delegate-slot',input);
    const delegate=()=>delegateResponsibilitySlot(db,a,options(),cmd,input,[grant.grantRef],installation);
    const {delegation:_omitted,...withoutDelegation}=input;
    await assert.rejects(delegateResponsibilitySlot(db,a,options(),cmd,withoutDelegation,[grant.grantRef],installation),{code:'DELEGATION_EXCEEDS_AUTHORITY'});
    const delegation=input.delegation;
    if(!delegation)throw new Error('fixture delegation missing');
    const {delegation:_,...tamperedBase}=input;
    const tampered:ReviseResponsibilityRoutePayload={...tamperedBase,
      proposal:{...input.proposal,request:{...next,requiredSlots:next.requiredSlots.map(slot=>slot.slotId==='approve'
        ?{...slot,seats:slot.seats.map(seat=>seat.seatId==='seat-0'
          ?{...seat,responsibilityRefs:[assignments[1]!.responsibilityRef]}:seat)}:{...slot})}},delegation};
    await assert.rejects(delegateResponsibilitySlot(db,a,options(),await command('abh.responsibility-requests.delegate-slot',tampered),tampered,[grant.grantRef],installation),{code:'DELEGATION_EXCEEDS_AUTHORITY'});
    const result=await delegate();assert.equal(result.replayed,false);
    const routed=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    assert.equal(routed.status,'Open');assert.equal(routed.routeRevision,2);assert.equal(routed.requestRef.version,old.requestRef.version+2);
    assert.equal((await load(first.decisionRef.id)).status,'Approved');assert.equal((await load(pending.decisionRef.id)).status,'Superseded');
    const fresh=await Promise.all(routed.decisionRefs.map(ref=>load(ref.id)));
    assert.deepEqual(fresh.map(d=>d.candidateResponsibilityRefs[0]!.id).sort(),[delegateAssignment.responsibilityRef.id,assignments[1]!.responsibilityRef.id].sort());
    const delegated=fresh.find(d=>d.candidateResponsibilityRefs[0]!.id===delegateAssignment.responsibilityRef.id)!;
    const original=fresh.find(d=>d.candidateResponsibilityRefs[0]!.id===assignments[1]!.responsibilityRef.id)!;
    const firstResponse=await submit(c,delegated),secondResponse=await submit(b,original);
    assert.equal(firstResponse.completion,undefined);assert.ok(secondResponse.completion);
    const [revision]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT record FROM human.route_revisions WHERE request_id=${request.requestRef.id} AND route_revision=2`);
    assert.equal((revision!.record as {change:ReviseResponsibilityRoutePayload}).change.delegation?.responsibilityRef.id,delegateAssignment.responsibilityRef.id);
  });
  await t.test('dedicated escalate slot replaces an unresolved seat and enforces route depth',async()=>{
    const c=context(org),request=await open('ALL',{...eligible,candidate:async()=>false});
    assert.equal(request.status,'Unresolved');assert.equal(request.decisionRefs.length,0);
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${c.tenant.actor.id},'escalation reviewer','Human',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${c.tenant.actor.id},1,'Active')`;
    });
    const escalationAssignment:ResponsibilityAssignmentRecord={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment'),
      principalRef:ref('abh.principal',c.tenant.actor.id),validFrom:new Date(Date.now()-1000).toISOString(),validUntil:request.expiresAt};
    const assign=await command('abh.responsibilities.assign',escalationAssignment);
    await db.transaction(c,options(),tx=>assignResponsibility(tx,assign,escalationAssignment));
    const frozen=proposals.get(request.requestRef.id)!,next={...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},
      routeRevision:request.routeRevision+1,escalationDepth:1,decisionRefs:[],status:'Unresolved' as const,
      requiredSlots:request.requiredSlots.map(slot=>({...slot,seats:slot.seats.map(seat=>seat.seatId==='seat-0'
        ?{...seat,responsibilityRefs:[escalationAssignment.responsibilityRef]}:seat)}))};
    const pkgUnsigned={...frozen.packages[0]!,requestRef:next.requestRef,routeRevision:next.routeRevision};
    const pkg={...pkgUnsigned,packageDigest:await digestContract('DecisionPackage',pkgUnsigned)};
    const input:ReviseResponsibilityRoutePayload={expectedRequestRef:request.requestRef,proposal:{request:next,packages:[pkg]},
      frozenPolicyRefs:[ref('abh.policy-version')],directoryRef:ref('abh.artifact'),evidenceRefs:[escalationAssignment.responsibilityRef],
      reason:'Escalate unresolved approval seat',escalation:{slotId:'approve',seatId:'seat-0',responsibilityRef:escalationAssignment.responsibilityRef}};
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',a.tenant.actor.id),scopeRefs:[ref('abh.organization',org)],
      actionTypes:['abh.responsibility-requests.escalate-slot'],purposeNames:['abh.action.prepare'],validFrom:escalationAssignment.validFrom,
      validUntil:escalationAssignment.validUntil,issuanceEvidenceRef:input.evidenceRefs[0]!,status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${a.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const installation:RouteRevisionInstallation={eligibility:eligible,fenceRefs:async()=>[],admit:async()=>{},govern:async()=>{}};
    const commandFor=(value:ReviseResponsibilityRoutePayload)=>command('abh.responsibility-requests.escalate-slot',value);
    const result=await escalateResponsibilitySlot(db,a,options(),await commandFor(input),input,[grant.grantRef],installation);
    assert.equal(result.replayed,false);
    const routed=await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id));
    assert.equal(routed.status,'Open');assert.equal(routed.routeRevision,2);assert.equal(routed.escalationDepth,1);
    const fresh=await Promise.all(routed.decisionRefs.map(ref=>load(ref.id)));
    assert.equal(fresh.find(d=>d.seatId==='seat-0')!.candidateResponsibilityRefs[0]!.id,escalationAssignment.responsibilityRef.id);
    const tooDeep={...input,expectedRequestRef:routed.requestRef,proposal:{...input.proposal,request:{...routed,
      requestRef:{...routed.requestRef,version:routed.requestRef.version+1},routeRevision:routed.routeRevision+1,escalationDepth:5}}};
    await assert.rejects(escalateResponsibilitySlot(db,a,options(),await commandFor(tooDeep),tooDeep,[grant.grantRef],installation),{code:'INVALID_ARGUMENT'});
    const saturated={...routed,status:'Unresolved' as const,decisionRefs:[],escalationDepth:4,
      requestRef:{...routed.requestRef,version:routed.requestRef.version+1},routeRevision:routed.routeRevision+1};
    await f.admin`UPDATE human.requests SET record=${JSON.stringify(saturated)}::text::jsonb,route_revision=${saturated.routeRevision},version=${saturated.requestRef.version},status='Unresolved' WHERE resource_organization_id=${org} AND id=${routed.requestRef.id}`;
    const saturatedInput={...input,expectedRequestRef:saturated.requestRef,proposal:{...input.proposal,request:{...saturated,
      requiredSlots:saturated.requiredSlots.map(slot=>slot.slotId==='approve'
        ?{...slot,seats:slot.seats.map(seat=>seat.seatId==='seat-1'
          ?{...seat,responsibilityRefs:[escalationAssignment.responsibilityRef]}:seat)}:{...slot})}},
      escalation:{slotId:'approve',seatId:'seat-1',responsibilityRef:escalationAssignment.responsibilityRef}};
    await assert.rejects(escalateResponsibilitySlot(db,a,options(),await commandFor(saturatedInput),saturatedInput,[grant.grantRef],installation),{code:'ROUTE_DEPTH_EXCEEDED'});
    const revision=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT record FROM human.route_revisions WHERE request_id=${request.requestRef.id} AND route_revision=2`);
    assert.equal((revision[0]!.record as {change:ReviseResponsibilityRoutePayload}).change.escalation?.responsibilityRef.id,escalationAssignment.responsibilityRef.id);
  });

  await t.test('routing worker retries an unchanged unresolved route after eligibility recovery and stops noncooperating proposal loading',async()=>{
    const workspaceId=randomUUID(),opening=deriveVerifiedContext({...a.request,workspaceId,purposeOfUse:'abh.operation.reconcile'}),service=ref('abh.principal'),worker=deriveVerifiedContext({...opening.request,actor:{type:'Service',id:service.id}});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.responsibility-requests.retry-route'],purposeNames:['abh.operation.reconcile'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'routing fixture','Service',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
      for(const target of [service,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,workspace_id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${workspaceId},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const request=await open('ANY',{...eligible,candidate:async()=>false},opening),input=proposals.get(request.requestRef.id)!;
    const foreign=deriveVerifiedContext({...opening.request,workspaceId:randomUUID()}),hidden=await open('ANY',{...eligible,candidate:async()=>false},foreign);
    assert.equal((await db.transaction(worker,options(),tx=>owner.pendingRouting(tx))).some(ref=>ref.id===hidden.requestRef.id),false);
    const reopened=await Database.connect(f.runtimeUrl,{max:1});
    try{assert.deepEqual(await reopened.transaction(worker,options(),tx=>new DecisionOwner().getRoutingProposal(tx,request.requestRef)),input);}finally{await reopened.close();}
    await assert.rejects(db.transaction(foreign,options(),tx=>owner.getRoutingProposal(tx,request.requestRef)),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(opening,options(),tx=>tx.owner('HumanGateway')`UPDATE human.routing_proposals SET record=record`),{code:'42501'});
    const controller=new AbortController();let available=false,pages=0;
    await runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:controller.signal,grantRefs:[grant.grantRef],intervalMs:1,installation:{eligibility:{...eligible,candidate:async()=>available},fenceRefs:async()=>[]},
      onPage:async result=>{
        pages++;assert.equal(result.scanned,1);if(pages===1){assert.equal(result.unresolved,1);assert.equal(result.routed,0);available=true;}else{assert.equal(result.routed,1);controller.abort();}
      }});
    assert.equal(pages,2);const routed=await db.transaction(opening,options(),tx=>owner.getRequest(tx,request.requestRef.id));assert.equal(routed.status,'Open');assert.equal(routed.routeRevision,1);assert.equal(routed.decisionRefs.length,1);assert.equal(await evidenceCount(request.requestRef.id),'0');
    const pending=await open('ANY',{...eligible,candidate:async()=>false},opening),proposal=proposals.get(pending.requestRef.id)!;
    const installation={eligibility:eligible,fenceRefs:async()=>[]};
    await assert.rejects(runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:new AbortController().signal,grantRefs:[],installation,proposal:async()=>proposal}),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:new AbortController().signal,grantRefs:[grant.grantRef],installation,proposal:async()=>input}),{code:'FORBIDDEN'});
    const stop=new AbortController();let loaded!:()=>void;const started=new Promise<void>(resolve=>{loaded=resolve;});let observed:AbortSignal|undefined;
    const running=runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:stop.signal,grantRefs:[grant.grantRef],installation,proposal:async(_ref,options)=>{observed=options.signal;loaded();return new Promise(()=>{});}});
    await started;stop.abort();await running;assert.equal(observed!.aborted,true);
    assert.equal((await db.transaction(opening,options(),tx=>owner.getRequest(tx,pending.requestRef.id))).status,'Unresolved');
    let arrived=0,release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});const totals:{routed:number;stale:number}[]=[];
    await Promise.all([1,2].map(async()=>{const stop=new AbortController();await runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:stop.signal,grantRefs:[grant.grantRef],installation,
      proposal:async()=>{if(++arrived===2)release();await barrier;return proposal;},onPage:async result=>{totals.push(result);stop.abort();}});}));
    assert.equal(totals.reduce((sum,page)=>sum+page.routed,0),1);assert.equal(totals.reduce((sum,page)=>sum+page.stale,0),1);
    assert.equal((await db.transaction(opening,options(),tx=>owner.getRequest(tx,pending.requestRef.id))).decisionRefs.length,1);
    const remaining=await open('ANY',{...eligible,candidate:async()=>false},opening),remainingProposal=proposals.get(remaining.requestRef.id)!;
    const revoke=await command('abh.grants.revoke',grant.grantRef);
    await assert.rejects(runResponsibilityRoutingWorker(db,{context:async()=>worker,signal:new AbortController().signal,grantRefs:[grant.grantRef],installation,proposal:async()=>{
      await db.transaction(worker,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[grant.issuanceEvidenceRef]));return remainingProposal;
    }}),{code:'EPOCH_REVOKED'});
    assert.equal((await db.transaction(opening,options(),tx=>owner.getRequest(tx,remaining.requestRef.id))).status,'Unresolved');
  });
  await t.test('saved frozen routing proposals reject corruption and initial transaction rollback leaves no orphan',async()=>{
    const request=await open('ANY',{...eligible,candidate:async()=>false}),input=proposals.get(request.requestRef.id)!;
    assert.deepEqual(await db.transaction(a,options(),tx=>owner.getRoutingProposal(tx,request.requestRef)),input);
    const corrupt={...input,request:{...input.request,proposalDigest:'sha256:'+'f'.repeat(64)}};
    await f.admin`UPDATE human.routing_proposals SET record=${JSON.stringify(corrupt)}::text::jsonb WHERE request_id=${request.requestRef.id}`;
    try{await assert.rejects(db.transaction(a,options(),tx=>owner.getRoutingProposal(tx,request.requestRef)),{code:'DECISION_PACKAGE_INCOMPLETE'});}
    finally{await f.admin`UPDATE human.routing_proposals SET record=${JSON.stringify(input)}::text::jsonb WHERE request_id=${request.requestRef.id}`;}
    const fresh={...input.request,requestRef:ref('abh.responsibility-request')},unsigned={...input.packages[0]!,requestRef:fresh.requestRef},pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)},proposal={request:fresh,packages:[pkg]},cmd=await command('abh.responsibility-requests.open',proposal);
    await assert.rejects(db.transaction(a,options(),async tx=>{await owner.open(tx,cmd,proposal,eligible);throw new Error('initial proposal rollback');}),/initial proposal rollback/);
    const [count]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.routing_proposals WHERE request_id=${fresh.requestRef.id}`);assert.equal(count!.count,'0');
    await assert.rejects(db.transaction(a,options(),tx=>owner.getRequest(tx,fresh.requestRef.id)),{code:'RESOURCE_NOT_FOUND'});
  });
  await t.test('retry cannot replace frozen questions, risks or impact bounds even with recomputed valid package digests',async()=>{
    const request=await open('ANY',{...eligible,candidate:async()=>false}),input=proposals.get(request.requestRef.id)!,original=input.packages[0]!;
    for(const change of [{question:'Different question'}, {risks:['Changed risk disclosure']},
      {impactUpperBound:{...original.impactUpperBound,description:'Changed impact'}},
      {validUntil:new Date(Date.parse(original.validUntil)-1000).toISOString()}]){
      const unsigned={...original,...change},pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)},payload={...input,packages:[pkg]},cmd=await command('abh.responsibility-requests.retry-route',payload);
      await assert.rejects(db.transaction(a,options(),tx=>owner.retryUnresolved(tx,cmd,payload,eligible)),{code:'DECISION_PACKAGE_INCOMPLETE'});
    }
    assert.deepEqual(await db.transaction(a,options(),tx=>owner.getRequest(tx,request.requestRef.id)),request);
    const [count]=await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`SELECT count(*) FROM human.decisions WHERE request_id=${request.requestRef.id}`);assert.equal(count!.count,'0');
    const [stored]=await f.admin`SELECT id FROM human.routing_proposals WHERE request_id=${request.requestRef.id}`;
    await f.admin`UPDATE human.routing_proposals SET deleted_at=clock_timestamp() WHERE id=${stored!.id}`;
    const cmd=await command('abh.responsibility-requests.retry-route',input);
    try{await assert.rejects(db.transaction(a,options(),tx=>owner.retryUnresolved(tx,cmd,input,eligible)),{code:'RESOURCE_NOT_FOUND'});}
    finally{await f.admin`UPDATE human.routing_proposals SET deleted_at=NULL WHERE id=${stored!.id}`;}
    const opened=await db.transaction(a,options(),tx=>owner.retryUnresolved(tx,cmd,input,eligible));assert.equal(opened.status,'Open');
    assert.deepEqual((await load(opened.decisionRefs[0]!.id)).package,original);
  });
  await t.test('Decision inbox reads current seats with per-object Grants and advances cursors through filtered rows',async()=>{
    const principal=ref('abh.principal'),review=deriveVerifiedContext({...a.request,actor:{type:'Human',id:principal.id},purposeOfUse:'abh.decision.review'});
    const assignment={...assignments[0]!,responsibilityRef:ref('abh.responsibility-assignment'),principalRef:principal};
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[ref('abh.organization',org)],actionTypes:['abh.decisions.read'],purposeNames:['abh.decision.review'],validFrom:assignment.validFrom,validUntil:assignment.validUntil,issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
    await db.transaction(a,options(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'inbox fixture','Human',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
      for(const target of [principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const assign=await command('abh.responsibilities.assign',assignment);await db.transaction(review,options(),tx=>assignResponsibility(tx,assign,assignment));
    const previous=[...assignments];assignments.splice(0,assignments.length,assignment);const requests:ResponsibilityRequestRecord[]=[];
    let scopedRequest!:ResponsibilityRequestRecord;
    try{for(let i=0;i<3;i++)requests.push(await open('ANY',eligible,review));scopedRequest=await open('ANY',eligible,deriveVerifiedContext({...review.request,workspaceId:randomUUID()}));}finally{assignments.splice(0,assignments.length,...previous);}
    const ids=requests.map(r=>r.decisionRefs[0]!.id).sort(),inbox=new DecisionInboxOwner();
    const admission:DecisionInboxAdmission={admit:async tx=>{await assertCurrentGrants(tx,{objectRef:{type:'abh.decision',id:ids[0]!,version:1},scopeRefs:grant.scopeRefs,action:'abh.decisions.read'},[grant.grantRef]);},canRead:async()=>true};
    const commandGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.decisions.submit','abh.decisions.withdraw']};
    await db.transaction(review,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${commandGrant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${commandGrant.grantRef.id},${principal.id},${JSON.stringify(commandGrant)}::text::jsonb,${commandGrant.validFrom},${commandGrant.validUntil},'Active')`;
    });
    let actionAllowed=true;
    const viewAdmission:DecisionViewAdmission={...admission,fenceRefs:async()=>[],canReadEffect:async()=>true,canAct:async(_tx,_decision,action)=>actionAllowed&&action==='abh.decisions.submit'};
    const view=()=>db.transaction(review,options(),tx=>readDecisionView(tx,ids[0]!,[grant.grantRef],{'abh.decisions.submit':[commandGrant.grantRef],'abh.decisions.withdraw':[commandGrant.grantRef]},viewAdmission));
    const queryIssuer='decision-query.fixture',queryAudience='abh.test',querySubject=randomUUID(),queryCredential=ref('abh.credential');
    const queryIdentityDigest=await inputDigest([queryIssuer,querySubject]);
    await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${queryIdentityDigest},${org},${principal.id},1)`;
    const queryProvider:IdentityProviderPort={verify:async()=>({status:'Completed',data:{issuer:queryIssuer,audience:queryAudience,subject:querySubject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})};
    let hideFirstInbox=false,inboxGrants=true;
    const queryApp=createCoreHttpApp({database:db,identity:new IdentityIngress(db,queryProvider,{issuer:queryIssuer,audience:queryAudience}),credentials:async request=>{
      if(request.headers.authorization!=='Bearer query-fixture')throw new CoreError('UNAUTHENTICATED');
      return {credentialRef:queryCredential,organizationId:org,purpose:'abh.decision.review'};
    },decisionQuery:{grants:async()=>({read:[grant.grantRef],actions:{'abh.decisions.submit':[commandGrant.grantRef],'abh.decisions.withdraw':[commandGrant.grantRef]}}),admission:viewAdmission},
      decisionInbox:{cursor:new InboxCursorCodec(new Uint8Array(32).fill(7)),types:{'fixture.authorization':'Authorization','fixture.exception':'Exception'},grants:async()=>({read:inboxGrants?[grant.grantRef]:[],actions:{'abh.decisions.submit':[commandGrant.grantRef]}}),admission:{...viewAdmission,canRead:async(_tx,decision)=>!hideFirstInbox||decision.decisionRef.id!==ids[0]}}});
    t.after(()=>queryApp.close());
    const getQuery=(id=ids[0]!,extra='')=>queryApp.inject({url:`/v1/queries/abh.decisions.get?id=${id}${extra}`,headers:{authorization:'Bearer query-fixture'}});
    const initialQuery=await getQuery();assert.equal(initialQuery.statusCode,200,initialQuery.body);assert.deepEqual(initialQuery.json().data,await view());
    assert.equal(initialQuery.json().meta.stale,false);assert.match(initialQuery.json().meta.watermark,/^decision-source\/sha256:[0-9a-f]{64}$/);
    assert.ok(Number.isFinite(Date.parse(initialQuery.json().meta.asOf)));assert.equal((await getQuery()).json().meta.watermark,initialQuery.json().meta.watermark);
    assert.equal((await queryApp.inject(`/v1/queries/abh.decisions.get?id=${ids[0]}`)).statusCode,401);
    assert.equal((await getQuery('bad-id')).statusCode,400);assert.equal((await getQuery(ids[0]!, '&consistency=Projection')).json().error.code,'SCHEMA_UNSUPPORTED');
    assert.equal((await getQuery(scopedRequest.decisionRefs[0]!.id)).statusCode,404);
    const getInbox=(query='')=>queryApp.inject({url:`/v1/queries/abh.decisions.list-inbox${query?'?'+query:''}`,headers:{authorization:'Bearer query-fixture'}});
    const inboxPage=await getInbox('status=Pending&limit=1&type=fixture.authorization');assert.equal(inboxPage.statusCode,200,inboxPage.body);assert.equal(inboxPage.json().data[0].decisionRef.id,ids[0]);assert.match(inboxPage.json().meta.nextCursor,/^ic1\./);assert.ok(!inboxPage.body.includes('\"nextCursor\":\"'+ids[0]));
    assert.match(inboxPage.json().meta.watermark,/^decision-page\/sha256:[0-9a-f]{64}$/);assert.equal(inboxPage.json().meta.stale,false);
    hideFirstInbox=true;const hiddenPage=await getInbox('status=Pending&limit=1');assert.deepEqual(hiddenPage.json().data,[]);assert.match(hiddenPage.json().meta.nextCursor,/^ic1\./);assert.ok(!hiddenPage.body.includes(ids[0]!));hideFirstInbox=false;
    const nextPage=await getInbox(`status=Pending&limit=1&cursor=${hiddenPage.json().meta.nextCursor}`);assert.equal(nextPage.json().data[0].decisionRef.id,ids[1]);
    const finalPage=await getInbox(`status=Pending&limit=2&cursor=${nextPage.json().meta.nextCursor}`);assert.deepEqual(finalPage.json().data.map((d:{decisionRef:{id:string}})=>d.decisionRef.id),[ids[2]]);assert.equal(finalPage.json().meta.nextCursor,undefined);
    assert.deepEqual((await getInbox('type=fixture.exception')).json().data,[]);
    inboxGrants=false;assert.equal((await getInbox('type=fixture.exception')).statusCode,403);inboxGrants=true;
    for(const query of ['cursor=bad','limit=101','type=unregistered.kind','status=Pending&status=Approved'])assert.equal((await getInbox(query)).statusCode,400);
    assert.equal((await getInbox('consistency=Projection')).json().error.code,'SCHEMA_UNSUPPORTED');
    assert.equal((await getInbox(`status=Approved&cursor=${hiddenPage.json().meta.nextCursor}`)).statusCode,400);
    assert.equal((await getInbox(`status=Pending&cursor=${ids[0]}`)).statusCode,400);
    const pendingView=await view();assert.deepEqual(pendingView.availableActions,['abh.decisions.submit']);assert.deepEqual(pendingView.effectSummaries,[]);
    assert.deepEqual(Object.keys(pendingView).sort(),['availableActions','decisionRef','effectSummaries','package','status']);
    assert.deepEqual(pendingView.package,(await db.transaction(review,options(),tx=>inbox.get(tx,ids[0]!,[grant.grantRef],admission))).package);
    actionAllowed=false;assert.deepEqual((await view()).availableActions,[]);actionAllowed=true;
    const currentRequest=requests.find(request=>request.decisionRefs[0]!.id===ids[0])!;
    const originalSlot=currentRequest.requiredSlots[0]!;
    const dependent={...currentRequest,requiredSlots:[{...originalSlot,dependsOnSlotIds:['prerequisite']},{...originalSlot,slotId:'prerequisite',dependsOnSlotIds:[]}]};
    await f.admin`UPDATE human.requests SET record=${JSON.stringify(dependent)}::text::jsonb WHERE resource_organization_id=${org} AND id=${currentRequest.requestRef.id}`;
    try{assert.deepEqual((await view()).availableActions,[]);}finally{await f.admin`UPDATE human.requests SET record=${JSON.stringify(currentRequest)}::text::jsonb WHERE resource_organization_id=${org} AND id=${currentRequest.requestRef.id}`;}

    assert.deepEqual((await db.transaction(review,options(),tx=>readDecisionView(tx,ids[0]!,[grant.grantRef],{'abh.decisions.submit':[grant.grantRef]},viewAdmission))).availableActions,[]);
    const revokeCommand=await command('abh.grants.revoke',commandGrant.grantRef);await db.transaction(review,options(),tx=>revokeGrant(tx,revokeCommand,commandGrant.grantRef,[grant.issuanceEvidenceRef]));
    assert.deepEqual((await view()).availableActions,[]);
    const list=(filter:Parameters<DecisionInboxOwner['list']>[1],policy=admission)=>db.transaction(review,options(),tx=>inbox.list(tx,filter,[grant.grantRef],policy));
    await assert.rejects(db.transaction(review,options(),tx=>inbox.get(tx,scopedRequest.decisionRefs[0]!.id,[grant.grantRef],admission)),{code:'RESOURCE_NOT_FOUND'});
    const first=await list({status:'Pending',limit:1},{...admission,canRead:async()=>false});assert.deepEqual(first.decisions,[]);assert.equal(first.nextCursor,ids[0]);
    const second=await list({status:'Pending',limit:1,after:first.nextCursor!});assert.equal(second.decisions[0]!.decisionRef.id,ids[1]);
    const last=await list({status:'Pending',limit:2,after:second.nextCursor!});assert.deepEqual(last.decisions.map(d=>d.decisionRef.id),[ids[2]]);assert.equal(last.nextCursor,undefined);
    assert.deepEqual((await list({kind:'Exception'})).decisions,[]);
    await assert.rejects(list({limit:101}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(list({after:'bad'}),{code:'INVALID_ARGUMENT'});
    await assert.rejects(list({kind:'Exception'},{...admission,admit:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
    await assert.rejects(db.transaction(review,options(),tx=>inbox.get(tx,ids[0]!,[],{...admission,admit:async()=>{}})),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(db.transaction(review,options(),tx=>inbox.get(tx,ids[0]!,[grant.grantRef],{...admission,canRead:async()=>false})),{code:'RESOURCE_NOT_FOUND'});
    const decision=await db.transaction(review,options(),tx=>inbox.get(tx,ids[0]!,[grant.grantRef],admission));const response=await submit(review,decision);assert.ok(response.completion);
    assert.equal((await list({status:'Approved'})).decisions[0]!.decisionRef.id,ids[0]);
    assert.equal((await view()).status,'Approved');assert.deepEqual((await view()).availableActions,[]);
    const approvedQuery=await getQuery();assert.equal(approvedQuery.statusCode,200,approvedQuery.body);assert.equal(approvedQuery.json().data.status,'Approved');assert.notEqual(approvedQuery.json().meta.watermark,initialQuery.json().meta.watermark);
    await f.admin`UPDATE human.responsibilities SET status='Revoked' WHERE resource_organization_id=${org} AND id=${assignment.responsibilityRef.id}`;
    assert.equal((await list({status:'Pending'})).decisions.length,0);assert.equal((await list({status:'Approved'})).decisions.length,1);
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(review,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[grant.issuanceEvidenceRef]));
    await assert.rejects(list({kind:'Exception'}),{code:'EPOCH_REVOKED'});
    assert.equal((await getQuery()).statusCode,403);
    assert.equal((await getInbox('type=fixture.exception')).statusCode,403);
  });
  await t.test('previous approval must remain qualified before the final completion proof',async()=>{
    const request=await open(),d1=await load(request.decisionRefs[0]!.id),d2=await load(request.decisionRefs[1]!.id);await submit(a,d1);
    const revalidate:DecisionEligibility['revalidate']=async (tx,decision)=>{
      const current=await currentResponsibility(tx,decision.responsibilityRef!);
      if(!current)throw new CoreError('DECIDER_NOT_ELIGIBLE');
    };
    await db.transaction(a,options(),tx=>tx.owner('HumanGateway')`UPDATE human.responsibilities SET status='Revoked',version=version+1 WHERE id=${assignments[0]!.responsibilityRef.id}`);
    await assert.rejects(submit(b,d2,'Approved',{...eligible,revalidate}),{code:'DECIDER_NOT_ELIGIBLE'});
    assert.equal(await evidenceCount(request.requestRef.id),'0');assert.equal((await load(d1.decisionRef.id)).status,'Approved');assert.equal((await load(d2.decisionRef.id)).status,'Pending');
  });
});
