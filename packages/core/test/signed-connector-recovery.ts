import {checkCompatibleEvidenceIssuance} from './compatible-evidence-issuance.ts';
import {finalizeSignedConnector} from './signed-connector-finalization.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import type {EntityRef,PackGovernanceSnapshot} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import {recoverLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {InstalledPolicyAssets} from '../src/control/policy-assets.ts';
import {assertScopeRuntimePolicy} from '../src/control/scope-runtime.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {StaticReleaseOwner} from '../src/release/static.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {queryPackOnce} from '../src/execution/query-pack-once.ts';
import {queryPackAndCapture,retryQueryCapture,type QueryCaptureDestination} from '../src/execution/query-and-capture.ts';
import {readQueryExit} from '../src/execution/query-exit.ts';
import {QueryCaptureOwner} from '../src/execution/query-capture.ts';
import type {QueryTransport} from '../src/execution/query-transport.ts';
import {installSignedConnectorFixture} from './install-signed-connector-fixture.ts';
import {signedConnectorFixture} from './signed-connector-fixture.ts';
import type {checkSignedConnectorAuthorization} from './signed-connector-authorization.ts';
import {createDatabaseFixture,options} from './database-fixture.ts';

/** Two real signed/Enabled Packs, with the original already Retired. Provider,
 * compatibility approval and normalization remain explicit trusted fixtures. */
export async function checkSignedConnectorRecovery(f:Awaited<ReturnType<typeof createDatabaseFixture>>,management:VerifiedContext,
 root:string,executable:string,retiredRef:EntityRef,state:Awaited<ReturnType<typeof checkSignedConnectorAuthorization>>){
 const original=await f.database.transaction(management,options(),tx=>new InstalledPackOwner().read(tx,retiredRef,async()=>{}));
 assert.equal(original.status,'Retired');
 const replacement=await signedConnectorFixture(executable,'org.example.signed-recovery','2.0.0');
 assert.notEqual(replacement.manifest.integrity.packageDigest,original.manifest.integrity.packageDigest);
 const directory=join(await realpath(root),'replacement'),input=join(directory,'input'),durable=join(directory,'durable');
 await mkdir(join(input,'proof'),{recursive:true});await mkdir(durable,{mode:0o700});
 await writeFile(join(input,'input.json'),replacement.bytes);
 for(const [name,bytes] of [['signature',replacement.releaseBundle],['source',replacement.provenanceBundle],['ctk',replacement.conformanceBundle]] as const)await writeFile(join(input,'proof',name+'.json'),bytes);
 const governance:PackGovernanceSnapshot={policyRef:{type:'abh.pack-trust-policy',id:randomUUID(),version:1},policy:{abhVersion:'0.1.0',packId:replacement.manifest.metadata.id,allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],permissions:replacement.manifest.permissions,hostProfileRefs:[],sharedNamespaces:[]},trust:replacement.trust,revokedPackIds:[],revokedDigests:[],reservedVersions:[]};
 const installed=await installSignedConnectorFixture(f,management,replacement,directory,input,durable,governance);
 assert.equal(installed.enabled.status,'Enabled');assert.ok(installed.enabled.deploymentVersion>original.deploymentVersion);
 const entry=installed.set.registrations[0]!,exact={kind:'Connector' as const,id:entry.capability.id,version:entry.capability.version,digest:entry.registrationDigest};
 const assets=new InstalledPolicyAssets(),receiver=state.receiver,database=f.database;
 try{
  await assets.install(state.manifestBytes,await readFile(new URL('./fixtures/policy.wasm',import.meta.url)),new AbortController().signal);
  const identity=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
  const operations=new OperationOwner(),operation=await database.transaction(receiver,options(),tx=>operations.get(tx,state.queryInput.operationRef.id));
  const plan=await database.transaction(receiver,options(),tx=>operations.getPlan(tx,operation.actionRef.id)),node=plan!.nodes.find(value=>value.nodeKey===operation.nodeKey)!;
  const pins=await database.transaction(receiver,options(),tx=>new StaticReleaseOwner().getPinSet(tx,operation.actionRef));assert.ok(pins);
  const scope={type:'abh.organization',id:receiver.tenant.resourceOrganizationId,version:1},purposeNames=['abh.operation.reconcile'];
  const leaseInput={targetRef:operation.operationRef,workerId:state.queryInput.workerId,leaseSeconds:30},leaseCommand=await identity('abh.work-leases.claim',leaseInput);
  const lease=await database.transaction(receiver,options(),tx=>new WorkLeaseOwner().claim(tx,leaseCommand,leaseInput,async()=>purposeNames));
  const queryInput={...state.queryInput,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken};
  const proof=contract('CompatibleQueryEvidence',{kind:'CompatibleQueryEvidence',operationRef:operation.operationRef,originalConnectorRef:node.connectorRef,queryConnectorRef:exact,connectionRef:node.connectionRef,accountRef:node.accountRef,expiresAt:new Date(Date.now()+15000).toISOString()});
  const artifact=await checkCompatibleEvidenceIssuance(f,receiver,proof,[installed.ctkRef,installed.approvalRef],state.captureGrant);
  const authorize:typeof state.queryPolicy.authorize=async(tx,authority)=>assertScopeRuntimePolicy(tx,authority,assets);
  let originalReads=0;
  await assert.rejects(queryPackOnce(database,receiver,options(),queryInput,{...state.queryPolicy,authorize},{...state.installation,admission:{...state.installation.admission,source:async()=>{originalReads++;throw new Error('retired source must not load');}}}),{code:'RELEASE_SCOPE_MISMATCH'});
  assert.equal(originalReads,0);
  const policy={...state.queryPolicy,authorize,connectorRef:exact,compatibility:{evidenceRef:artifact.artifactRef,authorize:async(_tx:unknown,record:typeof artifact,bytes:Uint8Array)=>{assert.deepEqual(record.artifactRef,artifact.artifactRef);assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),proof);}}};
  let calls=0,reads=0;
  const transport:QueryTransport={capabilityRef:exact,query:async({exit})=>{
   calls++;assert.deepEqual(exit.connectorRef,node.connectorRef);assert.deepEqual(exit.queryConnectorRef,exact);
   assert.deepEqual(await database.transaction(receiver,options(),tx=>readQueryExit(tx,exit.exitRef)),exit);
   return new TextEncoder().encode('{"id":"signed-provider-response","applied":true}');
  }};
  const installation={behaviorSlot:state.installation.behaviorSlot,readGrants:[state.readGrant.grantRef],binding:{exactRef:exact,registeredKind:'abh.connector',implementationRef:entry.implementationRef,implementation:transport},admission:{fenceRefs:async()=>[],query:{fenceRefs:async()=>[],inspect:async()=>({visible:true,compatible:true,healthy:true})},current:async()=>{},source:async()=>{reads++;return (await recoverLocalPackSnapshot(durable,installed.snapshot,options())).files.payload;}}};
  let captureFails=true;
  const destination:QueryCaptureDestination={context:async()=>receiver,options,checks:{admit:async(tx,op)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.capture-query'},[state.captureGrant.grantRef]);},artifact:async()=>{if(captureFails)throw new Error('replacement Capture fault');},storage:async()=>({dataClass:'abh.data.internal',purposeNames,region:'local',retentionPolicyRef:scope}),normalize:async(current,exit,raw,observedAt)=>{
   const response=JSON.parse(new TextDecoder().decode(raw));assert.deepEqual(response,{id:'signed-provider-response',applied:true});assert.deepEqual(exit.queryConnectorRef,exact);
   return {resourceOrganizationId:receiver.tenant.resourceOrganizationId,operationId:operation.operationRef.id,connectionRef:current.connectionRef,accountRef:current.accountRef,connectorRef:current.connectorRef,providerIdempotencyKey:exit.providerIdempotencyKey,sourceKey:exit.exitRef.id,sourceVersion:'1',source:{kind:'Query',queryAuthorityRef:exit.queryAuthorityRef,coverage:'Partial',visibleThrough:observedAt},observedAt,matches:[{externalId:response.id,sourceVersion:'2',payloadDigest:exit.payloadDigest,effect:'Applied'}]};
  }}};
  const pending=await queryPackAndCapture([database,receiver,options(),queryInput,policy,installation],destination);assert.equal(pending.status,'CapturePending');if(pending.status!=='CapturePending')throw new Error('expected replacement Capture retry');
  captureFails=false;const saved=await retryQueryCapture(pending.pending,destination);assert.equal(saved.status,'Captured');if(saved.status!=='Captured')throw new Error('replacement Capture failed');
  assert.equal(saved.capture.normalization,'Normalized');assert.ok(saved.capture.receiptRef);assert.ok(saved.capture.rawArtifactRef);
  assert.deepEqual(await database.transaction(receiver,options(),tx=>new QueryCaptureOwner().get(tx,saved.capture.captureRef)),saved.capture);
  assert.equal(calls,1);assert.equal(reads,2);assert.equal(originalReads,0);
  assert.equal(Number((await database.transaction(receiver,options(),tx=>new LedgerOwner().get(tx,state.ledgerRef.id))).confirmedUsage),2);
  assert.deepEqual(await database.transaction(receiver,options(),tx=>new StaticReleaseOwner().getPinSet(tx,operation.actionRef)),pins);
  assert.deepEqual(await database.transaction(receiver,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
  await assert.rejects(queryPackOnce(database,receiver,options(),queryInput,policy,installation),{code:'RESOURCE_EXHAUSTED'});assert.equal(calls,1);
  await finalizeSignedConnector(database,receiver,operation,node,state.captureGrant,{workerId:queryInput.workerId,leaseRef:queryInput.leaseRef,leaseFencingToken:queryInput.leaseFencingToken},saved.capture.receiptRef!);
  assert.equal(calls,1);assert.equal(originalReads,0);
 }finally{await assets.close();}
}
