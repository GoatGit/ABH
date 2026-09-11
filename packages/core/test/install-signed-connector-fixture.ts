import {PackDeploymentRevisionOwner} from '../src/extensions/deployment-revisions.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {assignResponsibility} from '../src/human/responsibilities.ts';
import {DecisionOwner,type DecisionEligibility} from '../src/human/decisions.ts';
import {lockFences} from '../src/control/fences.ts';
import {approvalFenceRefs,verifyPackEnableApproval} from '../src/human/approval-proof.ts';
import {requestPackEnable} from '../src/extensions/request-pack-enable.ts';
import {enablePack} from '../src/extensions/enable-pack.ts';
import {recordPackConformanceArtifact,readPackConformanceArtifact} from '../src/extensions/pack-conformance-artifact.ts';
import {preparePackEnableProposal} from '../src/extensions/prepare-pack-enable-proposal.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand} from '../src/data/journal.ts';
import {assessPackDataImpact} from '../src/extensions/pack-data-impact.ts';
import {verifyImpactSignature,impactSignaturePayload} from '../src/extensions/verify-impact-signature.ts';
import {recordPackDataImpact,type PackDataImpactAdmission} from '../src/extensions/data-impact-reports.ts';
import {recordMigrationNonApplicability} from '../src/extensions/record-migration-non-applicability.ts';
import {readMigrationNonApplicability} from '../src/extensions/read-migration-non-applicability.ts';
import {Database} from '../src/data/uow.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {GrantRecord,PackGovernanceSnapshot} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import {createDatabaseFixture,options} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {verifyTrustPolicy,trustPolicySignaturePayload} from '../src/extensions/verify-trust-policy.ts';
import {publishPackTrustPolicy} from '../src/extensions/publish-pack-trust-policy.ts';
import {PackTrustPolicyOwner,databasePackGovernanceSource} from '../src/extensions/trust-policies.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {validateCurrentPack} from '../src/extensions/validate-current-pack.ts';
import {recordPackValidation} from '../src/extensions/record-pack-validation.ts';
import {stageLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import {stagePack} from '../src/extensions/stage-pack.ts';
import {registerPackCapabilities} from '../src/extensions/register-pack-capabilities.ts';
import {PackCapabilityRegistryOwner} from '../src/extensions/capability-registry.ts';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import type {signedConnectorFixture} from './signed-connector-fixture.ts';

/** Reusable real signed Stage/register/impact/CTK/Human approval/Enable fixture.
 * Only identity and management Grants are administrative fixtures. */
export async function installSignedConnectorFixture(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,
 fixture:Awaited<ReturnType<typeof signedConnectorFixture>>,root:string,input:string,durable:string,governance:PackGovernanceSnapshot){
  const org=c.tenant.resourceOrganizationId;
  const revision=await f.database.transaction(c,options(),tx=>new PackDeploymentRevisionOwner().current(tx));
  const [beforeCounts]=await f.admin`SELECT (SELECT count(*) FROM extension.installed_packs) AS installs,(SELECT count(*) FROM extension.capabilities) AS capabilities,(SELECT count(*) FROM data.command_receipts) AS receipts`;
  const ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1}),scope=ref('abh.organization',org),principal=ref('abh.principal',c.tenant.actor.id);
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.packs.publish-trust-policy','abh.packs.record-validation','abh.packs.stage','abh.packs.register-capabilities','abh.packs.record-data-impact','abh.packs.record-conformance'],purposeNames:['abh.pack.manage'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+120000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Signed Connector','local','Active') ON CONFLICT DO NOTHING`;
   await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Administrator','Human',1,'Active') ON CONFLICT DO NOTHING`;
   await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) SELECT ${org},${randomUUID()},${principal.id},1,'Active' WHERE NOT EXISTS(SELECT 1 FROM identity.memberships WHERE resource_organization_id=${org} AND principal_id=${principal.id})`;
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
   for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1) ON CONFLICT DO NOTHING`;
  });
  const executable=fixture.trust.signer.executable,run=(args:string[])=>promisify(execFile)(executable,args,{cwd:root,env:{...process.env,COSIGN_PASSWORD:''},timeout:10000,maxBuffer:1048576});
  await run(['generate-key-pair','--output-key-prefix',join(root,'administrator')]);
  const key=await readFile(join(root,'administrator.pub'),'utf8');
  const document={organizationId:org,issuedAt:grant.validFrom,expiresAt:grant.validUntil,snapshot:governance};
  await writeFile(join(root,'governance.payload'),trustPolicySignaturePayload(document));
  await run(['sign-blob','--key',join(root,'administrator.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'governance.bundle'),join(root,'governance.payload')]);
  const verified=await verifyTrustPolicy(document,await readFile(join(root,'governance.bundle')),{executable,mode:'OfflinePublicKey',publicKeyPem:key,organizationId:org,packId:fixture.manifest.metadata.id,policyId:governance.policyRef.id,maxLifetimeMs:180000},options());
  await rm(join(root,'administrator.key'));
  const base={commandId:randomUUID(),schemaVersion:'0.1.0',idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org}};
  const publication=contract('PublishPackTrustPolicyCommand',{...base,type:'abh.packs.publish-trust-policy',payload:{expectedVersion:0,documentDigest:await digestBytes(new TextEncoder().encode(canonicalJson(document))),signerKeyDigest:await digestBytes(new TextEncoder().encode(key))}});
  await publishPackTrustPolicy(f.database,c,options(),publication,verified,[grant.grantRef],{fenceRefs:async()=>[],current:async(_tx,evidence)=>{assert.equal(evidence.keyDigest,publication.payload.signerKeyDigest);}});
  const source=databasePackGovernanceSource(f.database,c,async tx=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-validation'},[grant.grantRef]);});
  const candidate=await validateCurrentPack({root:input,manifest:fixture.manifest,limits:{maxFileBytes:32768,maxTotalBytes:131072,maxEntries:20}},source,options());
  const owner=new PackTrustPolicyOwner(),checks={fenceRefs:async()=>[],current:async(...args:Parameters<PackTrustPolicyOwner['match']>)=>{await owner.match(...args);}};
  const command=contract('RecordPackValidationCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.record-validation',payload:{reportDigest:candidate.validation().reportDigest,governanceRef:candidate.governanceRef(),governanceDigest:candidate.governanceDigest()}});
  const validationRef=await recordPackValidation(f.database,c,options(),command,candidate,[grant.grantRef],checks),snapshot=await stageLocalPackSnapshot(durable,candidate,options());
  const staging=contract('StagePackCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.stage',payload:{validationRef,snapshot,expectedDeploymentVersion:revision}});
  const packRef=await stagePack(f.database,c,options(),staging,durable,[grant.grantRef],checks);
  assert.deepEqual(await stagePack(f.database,c,options(),staging,durable,[grant.grantRef],checks),packRef);
  const bindings=[fixture.binding],register=contract('RegisterPackCapabilitiesCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.register-capabilities',payload:{packRef,bindingsDigest:await inputDigest(bindings)}});
  const admission={pack:checks,capabilities:{schema:async(_binding:unknown,bytes:Uint8Array)=>assert.deepEqual(bytes,fixture.bytes),implementation:async()=>{}}};
  const invoke=()=>registerPackCapabilities(f.database,c,options(),register,durable,bindings,{stage:[grant.grantRef],register:[grant.grantRef]},admission);
  const saved=await invoke();assert.equal(saved.replayed,false);assert.deepEqual(await invoke(),{...saved,replayed:true});
  const set=await f.database.transaction(c,options(),tx=>new PackCapabilityRegistryOwner().readSet(tx,saved.setRef,async()=>{}));
  assert.equal(set.registrations.length,1);assert.deepEqual(set.registrations[0]!.capability,fixture.binding.capability);assert.equal(set.registrations[0]!.subjectDigest,fixture.manifest.integrity.packageDigest);
  const installed=await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,packRef,async()=>{}));assert.equal(installed.status,'Staged');assert.equal(installed.enablement,undefined);
  const reopened=await Database.connect(f.runtimeUrl,{max:1});
  try{assert.deepEqual(await reopened.transaction(c,options(),tx=>new PackCapabilityRegistryOwner().readSet(tx,saved.setRef,async()=>{})),set);}
  finally{await reopened.close();}
  const [counts]=await f.admin`SELECT (SELECT count(*) FROM extension.installed_packs) AS installs,(SELECT count(*) FROM extension.capabilities) AS capabilities,(SELECT count(*) FROM data.command_receipts) AS receipts`;
  assert.deepEqual(counts,{installs:String(Number(beforeCounts!.installs)+1),capabilities:String(Number(beforeCounts!.capabilities)+1),receipts:String(Number(beforeCounts!.receipts)+4)});
  const inventory={complete:true,entries:[]};
  const storeInventory=async()=>{
   const payload={ownerRef:packRef,mediaType:'application/json',content:canonicalJson(inventory),dataClass:'abh.data.internal',purposeNames:['abh.pack.manage'],sourceRefs:[validationRef],region:'local',retentionPolicyRef:scope};
   const identity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
   const result=await f.database.transaction(c,options(),tx=>executeCommand(tx,identity,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,identity,payload,async()=>{})).artifactRef));return result.receipt.resultRef;
  };
  const impact=contract('PackDataImpactRecord',{issuedAt:grant.validFrom,expiresAt:grant.validUntil,packRef,deploymentVersion:revision+1,compilerRef:{kind:'Compiler',id:'org.example.signed.compiler',version:'1.0.0',digest:fixture.manifest.integrity.packageDigest},environmentDigest:fixture.report.environment.environmentDigest,
   baselineSourceRef:await storeInventory(),targetSourceRef:await storeInventory(),baseline:inventory,target:inventory,impact:await assessPackDataImpact(fixture.manifest,inventory,inventory)});
  await run(['generate-key-pair','--output-key-prefix',join(root,'compiler')]);
  const compiler={executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'compiler.pub'),'utf8'),organizationId:org,compilerRef:impact.compilerRef,maxLifetimeMs:180000};
  await writeFile(join(root,'impact.payload'),impactSignaturePayload(org,impact));
  await run(['sign-blob','--key',join(root,'compiler.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'impact.bundle'),join(root,'impact.payload')]);
  const proof=await verifyImpactSignature(org,impact,await readFile(join(root,'impact.bundle')),compiler,options());await rm(join(root,'compiler.key'));
  const impactChecks:PackDataImpactAdmission={signer:async()=>compiler,fenceRefs:async()=>[],source:async(_tx,artifact)=>{assert.deepEqual(artifact.ownerRef,packRef);assert.deepEqual(artifact.sourceRefs,[validationRef]);},current:async(tx,report,evidence)=>{
   assert.deepEqual(report,impact);await owner.match(tx,evidence);
  }};
  const impactCommand=contract('RecordPackDataImpactCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.record-data-impact',payload:{report:impact}});
  const impactRef=await recordPackDataImpact(f.database,c,options(),impactCommand,durable,[grant.grantRef],impactChecks,proof);
  const noChange={commandId:randomUUID(),idempotencyKey:randomUUID(),impactRef,retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:scope}},noChangeChecks={impact:impactChecks,references:async()=>{},read:async()=>{}};
  const nonApplicable=await recordMigrationNonApplicability(f.database,c,options(),noChange,durable,[grant.grantRef],noChangeChecks);
  assert.deepEqual(await recordMigrationNonApplicability(f.database,c,options(),noChange,durable,[grant.grantRef],noChangeChecks),nonApplicable);
  await f.database.transaction(c,options(),tx=>readMigrationNonApplicability(tx,options(),nonApplicable,impactRef,durable,[grant.grantRef],noChangeChecks));
  await assert.rejects(f.database.transaction(c,options(),tx=>readMigrationNonApplicability(tx,options(),nonApplicable,ref('abh.pack-data-impact'),durable,[grant.grantRef],noChangeChecks)),{code:'RESOURCE_NOT_FOUND'});
  const ctkCommand=contract('RecordPackConformanceCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.record-conformance',payload:{packRef,retention:noChange.retention}});
  const ctkChecks={pack:checks,references:async()=>{},read:async()=>{}};
  const ctkRef=await recordPackConformanceArtifact(f.database,c,options(),ctkCommand,durable,{stage:[grant.grantRef],record:[grant.grantRef]},ctkChecks);
  assert.deepEqual(await recordPackConformanceArtifact(f.database,c,options(),ctkCommand,durable,{stage:[grant.grantRef],record:[grant.grantRef]},ctkChecks),ctkRef);
  const ctk=await f.database.transaction(c,options(),tx=>readPackConformanceArtifact(tx,options(),ctkRef,packRef,durable,[grant.grantRef],ctkChecks));
  assert.deepEqual(ctk.report,fixture.report);assert.equal(ctk.report.claimedCapabilities.length,1);
  const enableInput={packRef,impactRef,migrationVerificationRef:nonApplicable,ctkRef,capabilitySetRef:saved.setRef,impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'Enable signed Connector fixture'},expiresAt:new Date(Math.min(Date.parse(impact.expiresAt),Date.parse(ctk.validation.validUntil))-1000).toISOString()};
  let capabilityAllowed=true;
  const enableChecks={migration:noChangeChecks,conformance:ctkChecks,capabilityFenceRefs:async()=>[],capabilities:async(_tx:unknown,current:typeof set)=>{
   assert.deepEqual(current,set);if(!capabilityAllowed)throw new Error('current implementation denied');
  },impact:async()=>{}};
  const prepareEnable=(input=enableInput)=>f.database.transaction(c,options(),tx=>preparePackEnableProposal(tx,options(),input,durable,{impact:[grant.grantRef],stage:[grant.grantRef]},enableChecks));
  const proposal=await prepareEnable();assert.equal(proposal.proposalDigest,await digestContract('PackEnableProposal',proposal));
  assert.equal(proposal.subjectDigest,fixture.manifest.integrity.packageDigest);assert.deepEqual(proposal.capabilitySetRef,saved.setRef);assert.equal(proposal.capabilitySetDigest,set.setDigest);
  assert.equal(proposal.expectedDeploymentVersion,revision+1);assert.deepEqual(await prepareEnable(),proposal);
  await assert.rejects(prepareEnable({...enableInput,ctkRef:nonApplicable}),{code:'PRECONDITION_FAILED'});
  await assert.rejects(prepareEnable({...enableInput,capabilitySetRef:ref('abh.pack-capability-set')}),{code:'RESOURCE_NOT_FOUND'});
  capabilityAllowed=false;await assert.rejects(prepareEnable(),/current implementation denied/);capabilityAllowed=true;
  const afterProposal=await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,packRef,async()=>{}));assert.equal(afterProposal.status,'Staged');
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
  try{
   await assert.rejects(invoke(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(prepareEnable(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(recordMigrationNonApplicability(f.database,c,options(),noChange,durable,[grant.grantRef],noChangeChecks),{code:'AUTHORITY_REQUIRED'});
  }finally{await f.admin`UPDATE control.grants SET status='Active' WHERE id=${grant.grantRef.id}`;}
  const requestGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.request-enable']},reviewGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.decisions.submit'],purposeNames:['abh.decision.review']},enableGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.enable']};
  const responsibility=contract('ResponsibilityAssignmentRecord',{responsibilityRef:ref('abh.responsibility-assignment'),resourceOrganizationId:org,principalRef:principal,responsibilityType:'Authorization',scopeRefs:[scope],validFrom:grant.validFrom,validUntil:grant.validUntil,templateRef:ctkRef,status:'Active'});
  await f.database.transaction(c,options(),async tx=>{
   for(const g of [requestGrant,reviewGrant,enableGrant]){
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${g.grantRef.id},${principal.id},${JSON.stringify(g)}::text::jsonb,${g.validFrom},${g.validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${g.grantRef.id},1)`;
   }
   await assignResponsibility(tx,{commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.responsibilities.assign',digest:await inputDigest(responsibility)},responsibility);
  });
  const requestRef=ref('abh.responsibility-request'),evidenceRefs=[proposal.validationRef,proposal.governanceRef,proposal.ctkRef,proposal.impactRef,proposal.migrationVerificationRef,proposal.capabilitySetRef];
  const decisionPackage=contract('DecisionPackage',{requestRef,routeRevision:1,slotId:'enable',subjectRef:packRef,proposalDigest:proposal.proposalDigest,question:'Enable signed Connector?',recommendation:'Review deployment evidence',alternatives:['Reject'],impactUpperBound:proposal.impactUpperBound,risks:['Capability becomes available'],evidenceRefs,validUntil:proposal.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)});
  decisionPackage.packageDigest=await digestContract('DecisionPackage',decisionPackage);
  const requestCommand=contract('RequestPackEnableCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.request-enable',payload:{proposal,responsibility:{request:{requestRef,resourceOrganizationId:org,kind:'Authorization',subjectRef:packRef,proposalDigest:proposal.proposalDigest,evidenceRefs,requiredSlots:[{slotId:'enable',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ALL',required:true,dependsOnSlotIds:[],seats:[{seatId:'reviewer',responsibilityRefs:[responsibility.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt:proposal.expiresAt,status:'Unresolved'},packages:[decisionPackage]}}});
  const routingFences=[scope,principal,responsibility.responsibilityRef,reviewGrant.grantRef];
  const eligibility:DecisionEligibility={lock:async tx=>{await lockFences(tx,routingFences);},candidate:async()=>true,submit:async(tx,d)=>{await assertCurrentGrants(tx,{objectRef:d.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[reviewGrant.grantRef]);return [reviewGrant.grantRef];},revalidate:async(tx,d)=>{await assertCurrentGrants(tx,{objectRef:d.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[reviewGrant.grantRef]);},conditions:async()=>[]};
  const requestChecks={proposal:enableChecks,eligibility,fenceRefs:async()=>routingFences,routing:async()=>{}},requestGrants={request:[requestGrant.grantRef],stage:[grant.grantRef],impact:[grant.grantRef]};
  const opened=await requestPackEnable(f.database,c,options(),requestCommand,durable,requestGrants,requestChecks);
  assert.equal(opened.replayed,false);assert.equal((await requestPackEnable(f.database,c,options(),requestCommand,durable,requestGrants,requestChecks)).replayed,true);
  const decisions=new DecisionOwner(),reviewContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.decision.review'});
  const request=await f.database.transaction(c,options(),tx=>decisions.getRequest(tx,requestRef.id));assert.equal(request.status,'Open');
  const decision=await f.database.transaction(reviewContext,options(),tx=>decisions.getDecision(tx,request.decisionRefs[0]!.id));
  const approved=await f.database.transaction(reviewContext,options(),tx=>decisions.submit(tx,{commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.decisions.submit',digest:'sha256:'+'a'.repeat(64)},decision.decisionRef,{response:'Approved',packageDigest:decisionPackage.packageDigest,conditionRefs:[]},eligibility));
  const approvalRef=approved.completion!.completionEvidenceRef;
  await f.database.transaction(c,options(),async tx=>{await lockFences(tx,[scope,...await approvalFenceRefs(tx,approvalRef)]);await verifyPackEnableApproval(tx,approvalRef,proposal);});
  const enableCommand=contract('EnablePackCommand',{...base,commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.enable',payload:{proposal,approvalRef}});
  const commitGrants={enable:[enableGrant.grantRef],stage:[grant.grantRef],impact:[grant.grantRef]},commitChecks={commit:{proposal:enableChecks,fenceRefs:async()=>[],installation:async()=>{}},replay:{fenceRefs:async()=>[],current:async()=>{}}};
  await assert.rejects(enablePack(f.database,c,options(),{...enableCommand,payload:{proposal,approvalRef:ref('abh.request-completion-evidence')}},durable,commitGrants,commitChecks));
  assert.equal((await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,packRef,async()=>{}))).status,'Staged');
  const accepted=await enablePack(f.database,c,options(),enableCommand,durable,commitGrants,commitChecks);
  assert.equal(accepted.replayed,false);assert.deepEqual(accepted.packRef,{...packRef,version:2});
  assert.deepEqual(await enablePack(f.database,c,options(),enableCommand,durable,commitGrants,commitChecks),{...accepted,replayed:true});
  const enabled=await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,accepted.packRef,async()=>{}));
  assert.equal(enabled.status,'Enabled');assert.equal(enabled.enablement!.proposal.capabilitySetDigest,set.setDigest);
  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().readHistorical(tx,packRef,async()=>{})),installed);
  return {org,ref,scope,principal,grant,base,checks,packRef,validationRef,snapshot,set,saved,installed,ctkRef,impactRef,impact,approvalRef,responsibility,reviewGrant,enableGrant,accepted,enabled,enableCommand,commitGrants,commitChecks,owner,enableInput};
}
