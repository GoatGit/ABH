import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,GrantRecord,OperationPlanNode,OperationRecord} from '@abh/contracts';
import type {Database,TenantTransaction} from '../src/data/uow.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {lockFences} from '../src/control/fences.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {compareOneShotObservations} from '../src/execution/reconciliation-comparison.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {OperationReceiptOwner} from '../src/execution/receipts.ts';
import {ReconciliationOwner} from '../src/execution/reconciliations.ts';
import {OperationController} from '../src/execution/operation-controller.ts';
import {ResourceFenceOwner} from '../src/execution/resource-fences.ts';
import {ActionOwner} from '../src/execution/actions.ts';
import {ActionResultOwner} from '../src/execution/action-results.ts';
import {options} from './database-fixture.ts';

/** Actual reconciliation and aggregation Owners with a separately installed
 * current Grant. Comparison/settlement semantics are explicit fixture rules. */
export async function finalizeSignedConnector(database:Database,context:VerifiedContext,operation:OperationRecord,node:OperationPlanNode,
 sourceGrant:GrantRecord,claim:{workerId:string;leaseRef:EntityRef;leaseFencingToken:number},replacementReceipt:EntityRef){
 const identity=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
 const org=context.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const grant:GrantRecord={...sourceGrant,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:['abh.operations.reconcile','abh.operations.apply-reconciliation','abh.actions.aggregate']};
 await database.transaction(context,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
 });
 const admit=async(tx:TenantTransaction,objectRef:EntityRef,action:string,grants:readonly EntityRef[]=[grant.grantRef])=>{
  await lockFences(tx,[scope,{type:'abh.principal',id:context.tenant.actor.id,version:1},...grants]);
  await assertCurrentGrants(tx,{objectRef,scopeRefs:[scope],action},grants);
 };
 const receipts=await database.transaction(context,options(),tx=>new OperationReceiptOwner().list(tx,operation.operationRef.id));
 assert.equal(receipts.length,3);assert.ok(receipts.some(receipt=>receipt.receiptRef.id===replacementReceipt.id));
 const observations=await database.transaction(context,options(),async tx=>{
  const owner=new OperationReceiptOwner();return Promise.all(receipts.filter(receipt=>receipt.receiptRef.id!==replacementReceipt.id).map(receipt=>owner.observation(tx,receipt,async()=>{})));
 });
 const rule={ruleRef:node.completionPolicyRef,connectorRef:node.connectorRef,compareSourceVersions:(a:string,b:string)=>Number(a)-Number(b),verifyNoEffect:async()=>false};
 assert.equal((await compareOneShotObservations(observations,node.payloadDigest,rule)).verdict,'Pending');
 const compareInput={receiptRefs:receipts.map(receipt=>receipt.receiptRef)},compareCommand=await identity('abh.operations.reconcile',compareInput),reports=new ReconciliationOwner();
 const comparison=await database.transaction(context,options(),tx=>executeCommand(tx,compareCommand,async()=>admit(tx,operation.operationRef,compareCommand.type),async()=>{
  const report=await reports.compare(tx,compareCommand,operation.operationRef,compareInput,{ruleRef:node.completionPolicyRef,connectorRef:node.connectorRef,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async()=>false},{admit:async(tx,op)=>admit(tx,op.operationRef,compareCommand.type),artifact:async()=>{}});
  assert.equal(report.verdict,'ConfirmedSuccess');assert.equal(report.receiptRefs.length,3);return report.reconciliationRef;
 }));
 const input={reportRef:comparison.receipt.resultRef,...claim},command=await identity('abh.operations.apply-reconciliation',input),controller=new OperationController(),operations=new OperationOwner();
 const apply=(denied=false,rollback=false)=>database.transaction(context,options(),tx=>executeCommand(tx,command,async()=>admit(tx,operation.operationRef,command.type,denied?[]:[grant.grantRef]),async()=>{
  const closed=await controller.apply(tx,command,operation.operationRef,input,{admit:async(tx,op)=>admit(tx,op.operationRef,command.type)});
  if(rollback)throw new Error('rollback signed finality');return closed.operationRef;
 }));
 await assert.rejects(apply(true),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(apply(false,true),/rollback signed finality/);
 assert.deepEqual(await database.transaction(context,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
 assert.ok((await database.transaction(context,options(),tx=>new ResourceFenceOwner().lock(tx,node)))!.unresolvedOperationRef);
 const applied=await apply();assert.equal((await apply()).replayed,true);
 const closed=await database.transaction(context,options(),tx=>operations.get(tx,applied.receipt.resultRef.id));
 assert.deepEqual(closed.position,{lifecycle:'Closed',outcome:'Succeeded'});assert.equal(closed.attemptCount,1);
 assert.equal((await database.transaction(context,options(),tx=>new ResourceFenceOwner().lock(tx,node)))!.unresolvedOperationRef,undefined);
 const actions=new ActionOwner(),results=new ActionResultOwner(),parent=await database.transaction(context,options(),tx=>actions.get(tx,operation.actionRef.id));
 const aggregateInput={operationVersionRefs:[closed.operationRef]},aggregateCommand=await identity('abh.actions.aggregate',aggregateInput);
 const aggregate=()=>database.transaction(context,options(),tx=>executeCommand(tx,aggregateCommand,async()=>admit(tx,parent.actionRef,aggregateCommand.type),async()=>{
  const final=await actions.aggregate(tx,aggregateCommand,parent.actionRef,tx=>results.finalizeOneShot(tx,aggregateCommand,parent.actionRef,aggregateInput,{
   aggregationRuleRef:parent.completionPolicyRef,admit:async(tx,action)=>admit(tx,action.actionRef,aggregateCommand.type),settlement:async(_tx,value)=>{assert.equal(value.reservations.length,0);assert.equal(value.reports.length,1);assert.equal(value.reports[0]!.receiptRefs.length,3);return [];},
  }));return final.actionRef;
 }));
 const final=await aggregate();assert.equal((await aggregate()).replayed,true);
 const action=await database.transaction(context,options(),tx=>actions.get(tx,final.receipt.resultRef.id));assert.deepEqual(action.position,{lifecycle:'Closed',outcome:'Succeeded'});assert.ok(action.resultRef);
 const result=await database.transaction(context,options(),tx=>results.get(tx,action.resultRef!));assert.deepEqual(result.operationVersionRefs,[closed.operationRef]);assert.deepEqual(result.resourceSettlements,[]);
}
