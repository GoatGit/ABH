import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,GrantRecord} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {createContractCatalog} from '@abh/contracts/catalog';
import type {Database} from '../src/data/uow.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {contract,inputDigest} from '../src/data/journal.ts';
import {InstalledPolicyAssets} from '../src/control/policy-assets.ts';
import {PolicyOwner} from '../src/control/policy-owner.ts';
import {PurposeOwner} from '../src/control/purposes.ts';
import {resolveScopeAuthoritySource} from '../src/control/scope-source.ts';
import {createScopeAuthority} from '../src/control/scope-authority.ts';
import {assertScopeRuntimePolicy} from '../src/control/scope-runtime.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {revokeGrant} from '../src/control/revoke.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {ResourceEnvelopeOwner} from '../src/resources/envelopes.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {ActionOwner} from '../src/execution/actions.ts';
import type {InstalledPackDispatch} from '../src/execution/dispatch-pack-once.ts';
import {queryPackAndCapture,retryQueryCapture,type QueryCaptureDestination} from '../src/execution/query-and-capture.ts';
import {queryPackOnce} from '../src/execution/query-pack-once.ts';
import type {QueryTransport} from '../src/execution/query-transport.ts';
import type {InstalledQueryPolicy} from '../src/execution/query-exit.ts';
import {options,seedLedgerCatalog} from './database-fixture.ts';

export async function checkSignedConnectorQuery(database:Database,receiver:VerifiedContext,assets:InstalledPolicyAssets,input:{operationRef:EntityRef;dispatchGrant:GrantRecord;claim:{workerId:string;leaseRef:EntityRef;leaseFencingToken:number};installation:InstalledPackDispatch}){
 const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1}),identity=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)}),org=receiver.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1},purposeNames=['abh.operation.reconcile'];
 const operation=await database.transaction(receiver,options(),tx=>new OperationOwner().get(tx,input.operationRef.id)),action=await database.transaction(receiver,options(),tx=>new ActionOwner().get(tx,operation.actionRef.id));
 const purpose=contract('PurposeRecord',{purposeRef:ref('abh.purpose'),resourceOrganizationId:org,name:purposeNames[0],evidenceRefs:[scope],status:'Active'}),catalog=createContractCatalog();assert.ok(catalog.success);
 const pc=await identity('abh.purposes.configure',purpose);await database.transaction(receiver,options(),tx=>new PurposeOwner().configure(tx,pc,purpose,catalog.data,async()=>{}));
 const resource=ref('abh.resource'),ledgers=new LedgerOwner(),ledgerCatalog=await seedLedgerCatalog(database,receiver,'org.example.signed.query'),ledgerInput={id:randomUUID(),scopeRef:scope,resourceType:'org.example.signed.query',meteringMode:'cumulative' as const,unit:'org.example.signed.query',periodRef:ledgerCatalog.periodRef,limit:'2',purposeNames},lc=await identity('abh.ledgers.configure',ledgerInput);
 const ledger=await database.transaction(receiver,options(),tx=>ledgers.configure(tx,lc,ledgerInput));
 const ue=contract('ResourceEnvelopeRecord',{envelopeRef:ref('abh.resource-envelope'),resourceOrganizationId:org,scopeRefs:[scope],bindings:[{resourceRef:resource,ledgerRef:ledger.ledgerRef,unit:ledger.unit,maxQuantity:'2'}],evidenceRefs:[scope],purposeNames,digest:'sha256:'+'0'.repeat(64)}),envelope={...ue,digest:await digestContract('ResourceEnvelopeRecord',ue)},ec=await identity('abh.resource-envelopes.configure',envelope);
 await database.transaction(receiver,options(),tx=>new ResourceEnvelopeOwner().configure(tx,ec,envelope,async()=>{}));
 const grant=(actionTypes:string[]):GrantRecord=>({...input.dispatchGrant,grantRef:ref('abh.grant'),actionTypes,purposeNames});
 const queryGrant=grant(['abh.operations.claim-query-exit']),management=grant(['abh.execution-authority.create']),read=grant(['abh.capabilities.read']),capture=grant(['abh.operations.capture-query']);
 // Administrative first-party Grant fixtures. Query Authority itself is evaluated
 // and created by the formal Scope policy/Owner path, never inserted directly.
 await database.transaction(receiver,options(),async tx=>{for(const g of [queryGrant,management,read,capture]){
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${g.grantRef.id},${g.principalRef.id},${JSON.stringify(g)}::text::jsonb,${g.validFrom},${g.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${g.grantRef.id},1)`;
 }});
 const policies=new PolicyOwner(),base=await database.transaction(receiver,options(),tx=>policies.selectMandatory(tx,'ActionPolicyInput'));
 const up={...base.policy,policyVersionRef:ref('abh.policy-version'),inputSchemaName:'ScopeAuthorityPolicyInput' as const,entrypoint:'abh_fixture/scope_decision'},policy={...up,digest:await digestContract('PolicyVersionRecord',up)},checks={lock:async()=>{},publish:async()=>{},activate:async()=>{}};
 const config=await identity('abh.policies.configure',policy);await database.transaction(receiver,options(),tx=>policies.configure(tx,config,{policy,purposeNames},assets,checks));
 const activate={policyVersionRef:policy.policyVersionRef,evidenceRefs:[scope],purposeNames},ac=await identity('abh.policies.activate-mandatory',activate);await database.transaction(receiver,options(),tx=>policies.activateMandatory(tx,ac,activate,checks));
 const draft=contract('ScopeAuthorityDraft',{executionPrincipalRef:queryGrant.principalRef,allowedProposerRefs:[{type:'abh.principal',id:action.proposedBy.id,version:1}],grantRefs:[queryGrant.grantRef],scopeRefs:[scope],purposeRefs:[purpose.purposeRef],actionTypes:queryGrant.actionTypes,resourceEnvelopeRef:envelope.envelopeRef,validFrom:queryGrant.validFrom,validUntil:queryGrant.validUntil,stopConditions:[],effectKey:'signed-query'});
 const evalCommand=await identity('abh.execution-authority.evaluate-scope',draft),evaluation=await database.transaction(receiver,options(),async tx=>policies.evaluateScope(tx,evalCommand,await resolveScopeAuthoritySource(tx,draft),assets,async()=>{}));
 const creation={draft,evaluationRef:evaluation.evaluationRef,managementGrantRefs:[management.grantRef]},cc=await identity('abh.execution-authority.create',creation);
 const created=await createScopeAuthority(database,receiver,options(),cc,creation);
 const authorityRef=created.authorityRef;
 const revoke=await identity('abh.grants.revoke',input.dispatchGrant.grantRef);await database.transaction(receiver,options(),tx=>revokeGrant(tx,revoke,input.dispatchGrant.grantRef,[scope]));
 const queryInput=contract('ClaimQueryExitPayload',{operationRef:operation.operationRef,queryAuthorityRef:authorityRef,...input.claim});
 const queryPolicy:InstalledQueryPolicy={policyRef:policy.policyVersionRef,connectorRef:input.installation.binding.exactRef,cost:{resourceRef:resource,quantity:'1',unit:ledger.unit},timeoutMs:5000,minIntervalMs:1,authorize:async(tx,authority)=>assertScopeRuntimePolicy(tx,authority,assets)};
 let calls=0;const transport:QueryTransport={capabilityRef:queryPolicy.connectorRef,query:async({exit})=>{
  calls++;const rows=await database.transaction(receiver,options(),tx=>tx.owner('OperationController')`SELECT id FROM execution.query_exits WHERE id=${exit.exitRef.id}`);assert.equal(rows.length,1);
  return new TextEncoder().encode('[]');
 }};
 const installation={...input.installation,readGrants:[read.grantRef],binding:{...input.installation.binding,implementation:transport}};
 await assert.rejects(queryPackOnce(database,receiver,options(),queryInput,queryPolicy,{...installation,readGrants:[]}),{code:'AUTHORITY_REQUIRED'});
 assert.equal(calls,0);assert.equal(Number((await database.transaction(receiver,options(),tx=>ledgers.get(tx,ledger.ledgerRef.id))).confirmedUsage),0);
 let failed=true;const destination:QueryCaptureDestination={context:async()=>receiver,options,checks:{
  admit:async(tx,op)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.capture-query'},[capture.grantRef]);},artifact:async()=>{if(failed)throw new Error('query capture fault');},storage:async()=>({dataClass:'abh.data.internal',purposeNames,region:'local',retentionPolicyRef:scope}),
  normalize:async(node,exit,raw,observedAt)=>{assert.deepEqual(JSON.parse(new TextDecoder().decode(raw)),[]);return {resourceOrganizationId:org,operationId:exit.operationRef.id,connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:node.connectorRef,providerIdempotencyKey:exit.providerIdempotencyKey,sourceKey:exit.exitRef.id,sourceVersion:'1',source:{kind:'Query',queryAuthorityRef:exit.queryAuthorityRef,coverage:'Partial',visibleThrough:observedAt},observedAt,matches:[]};},
 }};
 const pending=await queryPackAndCapture([database,receiver,options(),queryInput,queryPolicy,installation],destination);assert.equal(pending.status,'CapturePending');if(pending.status!=='CapturePending')throw new Error('expected pending query capture');
 failed=false;const saved=await retryQueryCapture(pending.pending,destination);assert.equal(saved.status,'Captured');if(saved.status!=='Captured')throw new Error('query capture recovery failed');assert.equal(saved.capture.normalization,'Normalized');assert.ok(saved.capture.receiptRef);
 await assert.rejects(retryQueryCapture(pending.pending,destination),{code:'PRECONDITION_FAILED'});
 assert.equal(calls,1);assert.equal(Number((await database.transaction(receiver,options(),tx=>ledgers.get(tx,ledger.ledgerRef.id))).confirmedUsage),1);
 await assert.rejects(queryPackOnce(database,receiver,options(),queryInput,{...queryPolicy,cost:{...queryPolicy.cost,quantity:'2'}},installation),{code:'RESOURCE_EXHAUSTED'});assert.equal(calls,1);
 const current=await database.transaction(receiver,options(),tx=>new OperationOwner().get(tx,operation.operationRef.id));assert.notEqual(current.position.lifecycle,'Closed');assert.equal(current.attemptCount,1);
 return {receiver,queryInput,queryPolicy,installation,ledgerRef:ledger.ledgerRef,readGrant:read,captureGrant:capture};
}
