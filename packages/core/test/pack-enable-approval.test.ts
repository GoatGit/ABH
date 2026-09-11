import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {DecisionPackage,GrantRecord,PackEnableProposal,ResponsibilityAssignmentRecord,ResponsibilityRequestRecord} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {approvalFenceRefs,verifyPackEnableApproval} from '../src/human/approval-proof.ts';
import {DecisionOwner,type DecisionEligibility} from '../src/human/decisions.ts';
import {assignResponsibility} from '../src/human/responsibilities.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {lockFences} from '../src/control/fences.ts';
import {inputDigest} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const digest='sha256:'+'a'.repeat(64);
const command=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});

test('Pack approval consumes actual Human Gateway decisions bound to an exact deployment proposal',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());const db=f.database,base=context();
 const manage=deriveVerifiedContext({...base.request,purposeOfUse:'abh.pack.manage'}),review=deriveVerifiedContext({...base.request,purposeOfUse:'abh.decision.review'});
 const org=base.tenant.resourceOrganizationId,principal=ref('abh.principal',base.tenant.actor.id),scope=ref('abh.organization',org),owner=new DecisionOwner();
 const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+60_000).toISOString();
 const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment'),resourceOrganizationId:org,principalRef:principal,responsibilityType:'Authorization',scopeRefs:[scope],validFrom,validUntil,templateRef:ref('abh.artifact'),status:'Active'};
 const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.decisions.submit'],purposeNames:['abh.decision.review'],validFrom,validUntil,issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
 await db.transaction(manage,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Pack organization','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Pack reviewer','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  for(const target of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${validFrom},${validUntil},'Active')`;
 });
 await db.transaction(manage,options(),async tx=>assignResponsibility(tx,await command('abh.responsibilities.assign',assignment),assignment));
 // These are fixture evidence identities; approval consumption is not Pack evidence validation or Enable authority.
 const unsigned:PackEnableProposal={action:'EnablePack',resourceOrganizationId:org,packRef:ref('abh.installed-pack'),subjectDigest:digest,expectedDeploymentVersion:1,environmentDigest:digest,validationRef:ref('abh.pack-validation'),governanceRef:ref('abh.pack-trust-policy'),governanceDigest:digest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:ref('abh.pack-capability-set'),capabilitySetDigest:digest,impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'Enable reviewed Pack'},expiresAt:validUntil,proposalDigest:digest};
 const proposal={...unsigned,proposalDigest:await digestContract('PackEnableProposal',unsigned)};
 const evidence=[proposal.validationRef,proposal.governanceRef,proposal.ctkRef,proposal.impactRef,proposal.migrationVerificationRef,proposal.capabilitySetRef];
 const eligible:DecisionEligibility={
  lock:async tx=>{await lockFences(tx,[scope,principal,grant.grantRef,assignment.responsibilityRef]);},candidate:async()=>true,
  submit:async(tx,decision)=>{await assertCurrentGrants(tx,{objectRef:decision.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[grant.grantRef]);return [grant.grantRef];},
  revalidate:async(tx,decision)=>{await assertCurrentGrants(tx,{objectRef:decision.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[grant.grantRef]);},conditions:async()=>[],
 };
 const approve=async(p=proposal,refs=evidence,conditions:{type:'abh.condition';id:string;version:number}[]=[])=>{
  const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Authorization',subjectRef:p.packRef,proposalDigest:p.proposalDigest,evidenceRefs:refs,requiredSlots:[{slotId:'enable',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ALL',required:true,dependsOnSlotIds:[],seats:[{seatId:'reviewer',responsibilityRefs:[assignment.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt:validUntil,status:'Unresolved'};
  const pkg:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'enable',subjectRef:p.packRef,proposalDigest:p.proposalDigest,question:'Enable this exact Pack?',recommendation:'Review deployment evidence',alternatives:['Reject'],impactUpperBound:p.impactUpperBound,risks:['Pack capabilities become available'],evidenceRefs:refs,validUntil,allowedResponses:['Approved','Rejected'],packageDigest:digest};
  pkg.packageDigest=await digestContract('DecisionPackage',pkg);
  const input={request,packages:[pkg]};
  const opened=await db.transaction(manage,options(),async tx=>owner.open(tx,await command('abh.responsibility-requests.open',input),input,eligible));
  const decision=await db.transaction(review,options(),tx=>owner.getDecision(tx,opened.decisionRefs[0]!.id));
  return db.transaction(review,options(),async tx=>owner.submit(tx,await command('abh.decisions.submit',decision.decisionRef),decision.decisionRef,{response:'Approved',packageDigest:pkg.packageDigest,conditionRefs:conditions},{...eligible,conditions:async()=>conditions}));
 };
 const result=await approve(),proof=result.completion!;
 const verify=(p=proposal,proofRef=proof.completionEvidenceRef,c=manage)=>db.transaction(c,options(),async tx=>{
  await lockFences(tx,[scope,...await approvalFenceRefs(tx,proofRef)]);
  return verifyPackEnableApproval(tx,proofRef,p);
 });
 await t.test('consumes persisted approval with current responsibility and submit Grant',async()=>{
  const supporting=await verify();assert.ok(supporting.some(r=>r.id===proof.completionEvidenceRef.id));assert.ok(supporting.some(r=>r.id===grant.grantRef.id));
 });
 await t.test('rejects mutations even if proposal self digest is recomputed',async()=>{
  for(const patch of [{packRef:ref('abh.installed-pack')},{packRef:{...proposal.packRef,version:2}},{subjectDigest:'sha256:'+'b'.repeat(64)},{expectedDeploymentVersion:2},{environmentDigest:'sha256:'+'c'.repeat(64)},{migrationVerificationRef:ref('abh.artifact')},{capabilitySetRef:ref('abh.pack-capability-set')},{capabilitySetDigest:'sha256:'+'d'.repeat(64)},{impactUpperBound:{...proposal.impactUpperBound,description:'Changed impact'}}]){
   const changed={...proposal,...patch};await assert.rejects(verify(changed),{code:'AUTHORITY_REQUIRED'});
   changed.proposalDigest=await digestContract('PackEnableProposal',changed);await assert.rejects(verify(changed),{code:'AUTHORITY_REQUIRED'});
  }
 });
 await t.test('rejects actual approved requests missing each required evidence Ref',async()=>{
  for(const missing of evidence){const incomplete=await approve(proposal,evidence.filter(r=>r!==missing));await assert.rejects(verify(proposal,incomplete.completion!.completionEvidenceRef),{code:'AUTHORITY_REQUIRED'});}
 });
 await t.test('conditional approvals and another completion version do not authorize Enable',async()=>{
  const conditional=await approve(proposal,evidence,[ref('abh.condition')]);
  await assert.rejects(verify(proposal,conditional.completion!.completionEvidenceRef),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(verify(proposal,{...proof.completionEvidenceRef,version:2}),{code:'AUTHORITY_REQUIRED'});
 });
 await t.test('proposal expiry is independent of request and package expiry',async()=>{
  const expired={...proposal,expiresAt:new Date(Date.now()-1000).toISOString()};expired.proposalDigest=await digestContract('PackEnableProposal',expired);
  const approval=await approve(expired);await assert.rejects(verify(expired,approval.completion!.completionEvidenceRef),{code:'AUTHORITY_REQUIRED'});
 });
 await t.test('rejects changed Decision evidence, impact, expired package and withdrawn approval',async()=>{
  const original=result.decision;
  await f.admin`UPDATE human.decisions SET status='Withdrawn' WHERE id=${original.decisionRef.id}`;
  try{await assert.rejects(verify(),{code:'AUTHORITY_REQUIRED'});}
  finally{await f.admin`UPDATE human.decisions SET status=${original.status} WHERE id=${original.decisionRef.id}`;}
  for(const patch of [
   {package:{...original.package,evidenceRefs:evidence.slice(0,-1)}},
   {package:{...original.package,impactUpperBound:{...original.package.impactUpperBound,description:'Different reviewed impact'}}},
   {package:{...original.package,validUntil:new Date(Date.now()-1000).toISOString()}},
  ]){
   const changed={...original,...patch};
   changed.package={...changed.package,packageDigest:await digestContract('DecisionPackage',changed.package)};
   changed.submission={...original.submission!,packageDigest:changed.package.packageDigest};
   await f.admin`UPDATE human.decisions SET record=${JSON.stringify(changed)}::text::jsonb,status=${changed.status} WHERE id=${original.decisionRef.id}`;
   try{await assert.rejects(verify(),{code:'AUTHORITY_REQUIRED'});}
   finally{await f.admin`UPDATE human.decisions SET record=${JSON.stringify(original)}::text::jsonb,status=${original.status} WHERE id=${original.decisionRef.id}`;}
  }
 });
 await t.test('requires organization management context',async()=>{
  await assert.rejects(verify(proposal,proof.completionEvidenceRef,review),{code:'PURPOSE_DENIED'});
  await assert.rejects(verify(proposal,proof.completionEvidenceRef,deriveVerifiedContext({...manage.request,workspaceId:randomUUID()})),{code:'FORBIDDEN'});
 });
 await t.test('withdrawn source visibility, responsibility and Grant invalidate historical approval',async()=>{
  await f.admin`UPDATE human.requests SET purpose_names=ARRAY['abh.decision.review'] WHERE id=${proof.requestRef.id}`;
  await assert.rejects(verify(),{code:'AUTHORITY_REQUIRED'});
  await f.admin`UPDATE human.requests SET purpose_names=ARRAY['abh.pack.manage','abh.decision.review'] WHERE id=${proof.requestRef.id}`;
  await f.admin`UPDATE human.responsibilities SET status='Revoked' WHERE id=${assignment.responsibilityRef.id}`;
  await assert.rejects(verify(),{code:'AUTHORITY_REQUIRED'});
  await f.admin`UPDATE human.responsibilities SET status='Active' WHERE id=${assignment.responsibilityRef.id}`;
  await verify();
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
  await assert.rejects(verify(),{code:'AUTHORITY_REQUIRED'});
 });
});
