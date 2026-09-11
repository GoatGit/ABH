import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import type {ScopeAuthorityPolicyInput,ActionPolicyInput,ArtifactRecord,CompiledPolicyManifest,EntityRef,GrantRecord,PinSet,PolicyVersionRecord} from '@abh/contracts';
import {digestBytes,digestContract,digestRequiredSlots} from '@abh/contracts/digest';
import {PolicyOwner,type PolicyGovernanceChecks} from '../src/control/policy-owner.ts';
import {InstalledPolicyAssets} from '../src/control/policy-assets.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {Database,type TenantTransaction} from '../src/data/uow.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('persisted Policy versions select current Mandatory and exact pinned Behavior',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const initial=context(),c=deriveVerifiedContext({...initial.request,purposeOfUse:'abh.action.execute'}),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org);
  const owner=new PolicyOwner(),artifacts=new InlineArtifactOwner(),assets=new InstalledPolicyAssets();t.after(()=>assets.close());
  const run=async(cmd:CommandIdentity,work:(tx:TenantTransaction)=>Promise<EntityRef>)=>db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>work(tx)));
  await db.transaction(c,options(),tx=>tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`);
  const wasm=new Uint8Array(await readFile(new URL('./fixtures/policy.wasm',import.meta.url))),provenance=JSON.parse(await readFile(new URL('./fixtures/policy-provenance.json',import.meta.url),'utf8'));
  const manifest:CompiledPolicyManifest={formatVersion:'0.1.0',wasmDigest:await digestBytes(wasm),sourceDigest:provenance.sourceDigest,compilerName:'OPA',compilerVersion:'1.20.2',compilerDigest:'sha256:54e7008e696d39e8e4f96594e2b71bcbe45fd9a4f838102bcf1240638bf3fbe1',entrypoints:['abh_fixture/action_decision','abh_fixture/empty_behavior','abh_fixture/decision','abh_fixture/scope_decision']};
  const content=JSON.stringify(manifest),manifestDigest=await assets.install(new TextEncoder().encode(content),wasm,new AbortController().signal);
  const storeInput={ownerRef:scope,mediaType:'application/json',content,purposeNames:['abh.action.execute'],dataClass:'hello.internal',sourceRefs:[scope],region:'local',retentionPolicyRef:ref('abh.artifact')},storeCommand=await command('abh.artifacts.store-inline',storeInput);let artifact:ArtifactRecord;
  await run(storeCommand,async tx=>{artifact=await artifacts.store(tx,storeCommand,storeInput,async()=>{});return artifact.artifactRef;});
  // Fixture review callbacks isolate Policy persistence; actual publishing requires current independent governance evidence.
  const checks:PolicyGovernanceChecks={lock:async()=>{},publish:async()=>{},activate:async()=>{}};
  const build=async(kind:'Mandatory'|'Behavior',entrypoint:string):Promise<PolicyVersionRecord>=>{
    const value:PolicyVersionRecord={policyVersionRef:ref('abh.policy-version'),resourceOrganizationId:org,kind,artifactRef:artifact!.artifactRef,manifestDigest,wasmDigest:manifest.wasmDigest,
      entrypoint,inputSchemaName:'ActionPolicyInput',ownerRef:scope,releaseEvidenceRefs:[ref('abh.decision')],...(kind==='Behavior'?{behaviorCapabilityRef:{kind:'BehaviorPolicy' as const,id:'hello.empty-policy',version:'0.1.0',digest:manifest.wasmDigest}}:{}),digest:'sha256:'+'0'.repeat(64)};
    return {...value,digest:await digestContract('PolicyVersionRecord',value)};
  };
  const configure=async(policy:PolicyVersionRecord,governance=checks)=>{const input={policy,purposeNames:['abh.action.execute']},cmd=await command('abh.policies.configure',input);await run(cmd,async tx=>(await owner.configure(tx,cmd,input,assets,governance)).policyVersionRef);return policy;};
  const activate=async(policy:PolicyVersionRecord,expectedBindingVersion?:number)=>{
    const input={policyVersionRef:policy.policyVersionRef,evidenceRefs:[scope],purposeNames:['abh.action.execute'],...(expectedBindingVersion?{expectedBindingVersion}:{})},cmd=await command('abh.policies.activate-mandatory',input);let binding;
    await run(cmd,async tx=>{binding=await owner.activateMandatory(tx,cmd,input,checks);return binding.bindingRef;});return binding!;
  };
  const mandatory=await configure(await build('Mandatory','abh_fixture/action_decision')),behavior=await configure(await build('Behavior','abh_fixture/empty_behavior'));
  const fixture=async(name:string)=>JSON.parse(await readFile(new URL(`../../contracts/fixtures/valid/${name}.json`,import.meta.url),'utf8')).value;
  const action={...await fixture('proposed-action'),resourceOrganizationId:org,position:{lifecycle:'Validated',outcome:'NotStarted'}};
  const unsigned:PinSet={pinSetRef:ref('abh.pin-set'),resourceOrganizationId:org,subjectRef:action.actionRef,subjectInputDigest:'sha256:'+'c'.repeat(64),requiredSlotsDigest:await digestRequiredSlots(['hello.policy']),digest:'sha256:'+'0'.repeat(64),
    pins:[{behaviorSlot:'hello.policy',assignmentRef:ref('abh.assignment'),releaseRef:ref('abh.release'),capabilityExactRefs:[behavior.behaviorCapabilityRef!],versionVector:[behavior.policyVersionRef]}]};
  const pins={...unsigned,digest:await digestContract('PinSet',unsigned)};
  const authority={...await fixture('execution-authority'),resourceOrganizationId:org};
  const grant:GrantRecord={grantRef:authority.grantRefs[0],resourceOrganizationId:org,principalRef:authority.executionPrincipalRef,scopeRefs:[scope],actionTypes:[action.actionType],purposeNames:['abh.action.execute'],
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+30_000).toISOString(),issuanceEvidenceRef:ref('abh.request-completion-evidence'),status:'Active'};
  const input:ActionPolicyInput={schemaVersion:'0.1.0',resourceOrganizationId:org,checkedAt:new Date().toISOString(),action,intentDigest:pins.subjectInputDigest,planDigest:'sha256:'+'d'.repeat(64),executionAuthority:authority,grants:[grant],purposeOfUse:'abh.action.execute',
    fences:[{fenceRef:ref('abh.fence'),resourceOrganizationId:org,scopeRef:scope,epoch:1,stopFlag:false}],impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'policy fixture'},inputVersionRefs:[scope],ledgers:[]};
  const evaluate=async(value=input,verifyInput:Parameters<PolicyOwner['evaluate']>[5]=async()=>{})=>{
    const cmd=await command('abh.actions.request-authorization',{action:action.actionRef});let result:Awaited<ReturnType<PolicyOwner['evaluate']>>;
    await run(cmd,async tx=>{result=await owner.evaluate(tx,cmd,value,pins,assets,verifyInput);return result.records[0]!.evaluationRef;});return result!;
  };
  await t.test('missing active Mandatory policy and invalid governance never create an active default',async()=>{
    await assert.rejects(evaluate(),{code:'POLICY_DENIED'});
    await assert.rejects(configure(await build('Mandatory','abh_fixture/decision'),{...checks,publish:async()=>{throw new CoreError('AUTHORITY_REQUIRED');}}),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(activate(behavior),{code:'POLICY_DENIED'});
  });
  const firstBinding=await activate(mandatory);
  await t.test('actual policy results record the exact version set and canonical input digest',async()=>{
    const result=await evaluate();assert.equal(result.decision.allow,true);assert.equal(result.records.length,2);
    assert.deepEqual(result.records.map(record=>record.policyVersionRefs[0]),[mandatory.policyVersionRef,behavior.policyVersionRef]);
    assert.ok(result.records.every(record=>record.inputDigest===result.records[0]!.inputDigest));assert.deepEqual(result.bindingRef,firstBinding.bindingRef);
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('Control')`UPDATE control.policy_evaluations SET record=record`),{code:'42501'});
  });
  await t.test('current Mandatory tightening applies immediately while the Behavior pin remains fixed',async()=>{
    const tightened=await configure(await build('Mandatory','abh_fixture/decision')),next=await activate(tightened,firstBinding.bindingRef.version);
    const result=await evaluate();assert.equal(result.decision.allow,false);assert.deepEqual(result.records[1]!.policyVersionRefs,[behavior.policyVersionRef]);assert.deepEqual(result.bindingRef,next.bindingRef);
    await assert.rejects(activate(mandatory,firstBinding.bindingRef.version),{code:'VERSION_CONFLICT'});
    await activate(mandatory,next.bindingRef.version);assert.equal((await evaluate()).decision.allow,true);
  });
  await t.test('unverified inputs roll back all evaluations and no empty Behavior can be inferred',async()=>{
    const count=async()=>db.transaction(c,options(),async tx=>(await tx.owner('Control')`SELECT count(*) FROM control.policy_evaluations`)[0]!.count);
    const before=await count();await assert.rejects(evaluate(input,async()=>{throw new CoreError('VERSION_CONFLICT');}),{code:'VERSION_CONFLICT'});assert.equal(await count(),before);
    const changed=structuredClone(pins);changed.pins[0]!.capabilityExactRefs[0]!.version='0.2.0';changed.digest=await digestContract('PinSet',changed);
    await assert.rejects(db.transaction(c,options(),tx=>owner.select(tx,changed)),{code:'POLICY_DENIED'});
    await assert.rejects(db.transaction(context(),options(),tx=>owner.get(tx,mandatory.policyVersionRef)),{code:'POLICY_DENIED'});
  });
  await t.test('Scope and Action Mandatory bindings are independent; delegation evidence binds source facts and activation version',async()=>{
    const unsignedPolicy={...await build('Mandatory','abh_fixture/scope_decision'),inputSchemaName:'ScopeAuthorityPolicyInput' as const};
    const scopePolicy=await configure({...unsignedPolicy,digest:await digestContract('PolicyVersionRecord',unsignedPolicy)});
    const before=await db.transaction(c,options(),tx=>owner.selectMandatory(tx,'ActionPolicyInput'));
    const binding=await activate(scopePolicy);
    assert.equal(binding.inputSchemaName,'ScopeAuthorityPolicyInput');assert.equal(binding.bindingRef.version,1);
    assert.deepEqual(await db.transaction(c,options(),tx=>owner.selectMandatory(tx,'ActionPolicyInput')),before);
    assert.equal((await evaluate()).decision.allow,true);
    const draft={executionPrincipalRef:grant.principalRef,allowedProposerRefs:[ref('abh.principal',c.tenant.actor.id)],grantRefs:[grant.grantRef],scopeRefs:[scope],purposeRefs:authority.purposeRefs,
      actionTypes:grant.actionTypes,resourceEnvelopeRef:authority.resourceEnvelopeRef,validFrom:grant.validFrom,validUntil:grant.validUntil,stopConditions:[],effectKey:'fixture-delegation'};
    const source:ScopeAuthorityPolicyInput={schemaVersion:'0.1.0',resourceOrganizationId:org,purposeOfUse:c.tenant.purposeOfUse,actor:c.tenant.actor,draft,grants:[grant],sourceVersionRefs:[scope,grant.grantRef],
      resourceEnvelope:{envelopeRef:authority.resourceEnvelopeRef,resourceOrganizationId:org,scopeRefs:[scope],bindings:[{resourceRef:ref('abh.resource'),ledgerRef:ref('abh.ledger'),unit:'hello.credit',maxQuantity:'1'}],evidenceRefs:[scope],purposeNames:[c.tenant.purposeOfUse],digest:'sha256:'+'0'.repeat(64)}};
    source.resourceEnvelope.digest=await digestContract('ResourceEnvelopeRecord',source.resourceEnvelope);
    // Facts are explicit fixtures here; the production Scope resolver must assemble and verify them in the UoW.
    const evaluateScope=async(value=source,verify:Parameters<PolicyOwner['evaluateScope']>[4]=async()=>{})=>{
      const cmd=await command('abh.execution-authority.evaluate-scope',value);let record;
      await run(cmd,async tx=>{record=await owner.evaluateScope(tx,cmd,value,assets,verify);return record.evaluationRef;});return record!;
    };
    const record=await evaluateScope();assert.equal(record.decision.allow,true);assert.deepEqual(record.targetRef,grant.principalRef);
    assert.deepEqual(record.policyVersionRefs,[scopePolicy.policyVersionRef]);assert.equal(record.inputDigest,await inputDigest({input:source,bindingRef:binding.bindingRef}));
    const rejected=await evaluateScope({...source,draft:{...draft,actionTypes:['hello.ungranted']}});assert.equal(rejected.decision.allow,false);assert.notEqual(rejected.inputDigest,record.inputDigest);
    await assert.rejects(evaluateScope(source,async()=>{throw new CoreError('AUTHORITY_REQUIRED');}),{code:'AUTHORITY_REQUIRED'});
    const next=await activate(scopePolicy,binding.bindingRef.version);assert.equal(next.bindingRef.version,2);
    assert.notEqual((await evaluateScope()).inputDigest,record.inputDigest,'reactivation invalidates old delegation evidence');
    assert.deepEqual(await db.transaction(c,options(),tx=>owner.selectMandatory(tx,'ActionPolicyInput')),before);
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('Control')`UPDATE control.policy_bindings SET input_schema_name='ActionPolicyInput' WHERE id=${binding.bindingRef.id}`));
    const [counts]=await db.transaction(c,options(),tx=>tx.owner('Control')`SELECT count(*) FROM control.execution_authorities`);assert.equal(counts!.count,'0','policy allow does not mint an Authority');
  });
  await t.test('artifact tombstone and missing installed code both fail closed with historical policy records intact',async()=>{
    await assets.close();await assert.rejects(evaluate(),{code:'POLICY_DENIED'});
    await assets.install(new TextEncoder().encode(content),wasm,new AbortController().signal);
    const cmd=await command('abh.artifacts.tombstone',artifact!.artifactRef);await run(cmd,async tx=>(await artifacts.tombstone(tx,cmd,artifact!.artifactRef,scope,async()=>{})).artifactRef);
    await assert.rejects(evaluate(),{code:'VERSION_CONFLICT'});
    assert.deepEqual(await db.transaction(c,options(),tx=>owner.get(tx,mandatory.policyVersionRef)),mandatory);
  });
});
