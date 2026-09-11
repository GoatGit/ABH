import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,OperationPlanNode,OperationRecord} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {executeCommand,inputDigest} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {ReconciliationOwner,type InstalledComparisonRule,type ReconciliationChecks} from './reconciliations.ts';
import {sameRef,refKey,lockAction} from './shared.ts';
import {ResourceFenceOwner} from './resource-fences.ts';

export interface TerminalComparisonInstallation {
  rule(node:OperationPlanNode):InstalledComparisonRule;
  /** Include every installation-specific fence before standard Grant admission acquires stage 1 locks. */
  fenceRefs(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<EntityRef[]>;
  checks:ReconciliationChecks;
}

export async function compareClosedOperation(database:Database,context:VerifiedContext,options:TransactionOptions,operationRef:EntityRef,
  grantRefs:readonly EntityRef[],installation:TerminalComparisonInstallation):Promise<EntityRef>{
  if(context.tenant.actor.type!=='Service'||context.tenant.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
  const grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const operations=new OperationOwner(),owner=new ReconciliationOwner(),operation=await operations.get(tx,operationRef.id);
    if(!sameRef(operation.operationRef,operationRef))throw new CoreError('VERSION_CONFLICT');
    if(operation.position.lifecycle!=='Closed')throw new CoreError('PRECONDITION_FAILED');
    const plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!node)throw new CoreError('OPERATION_FACT_CONFLICT');
    const receipts=await new OperationReceiptOwner().list(tx,operationRef.id),payload={receiptRefs:receipts.map(receipt=>receipt.receiptRef).sort((a,b)=>refKey(a).localeCompare(refKey(b)))};
    const digest=await inputDigest({operationRef,payload}),command={type:'abh.operations.reconcile',commandId:randomUUID(),idempotencyKey:`closed/${digest}`,digest};
    const c=context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const checks:ReconciliationChecks={artifact:(tx,record)=>installation.checks.artifact(tx,record),admit:async(tx,operation,node)=>{
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await installation.fenceRefs(tx,operation,node)]);
      await assertCurrentGrants(tx,{objectRef:operation.operationRef,scopeRefs:[scope],action:'abh.operations.reconcile'},grants);
      await installation.checks.admit(tx,operation,node);
    }};
    const result=await executeCommand(tx,command,async()=>{
      await checks.admit(tx,operation,node);
      await new ResourceFenceOwner().lock(tx,node);await lockAction(tx,operation.actionRef.id);
      const latest=await new OperationReceiptOwner().list(tx,operationRef.id);
      const currentPayload={receiptRefs:latest.map(receipt=>receipt.receiptRef).sort((a,b)=>refKey(a).localeCompare(refKey(b)))};
      if(await inputDigest({operationRef,payload:currentPayload})!==digest)throw new CoreError('VERSION_CONFLICT');
    },async()=>(await owner.compare(tx,command,operationRef,payload,installation.rule(node),checks)).reconciliationRef);
    return (await owner.get(tx,result.receipt.resultRef)).reconciliationRef;
  });
}

export interface TerminalReconciliationWorkerOptions {
  context:ContextSource;signal:AbortSignal;grantRefs:readonly EntityRef[];installation:TerminalComparisonInstallation;
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;compared:number},options:TransactionOptions):Promise<void>;
}

/** Rechecks newly persisted terminal evidence only; no query, outcome rewrite, compensation or release. */
export async function runTerminalReconciliationWorker(database:Database,input:TerminalReconciliationWorkerOptions):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??500;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  const grants=structuredClone([...input.grantRefs]);let binding:string|undefined,cursor:string|undefined;
  const options=()=>({deadline:Date.now()+10000,signal:input.signal});
  const current=async()=>{
    const context=await requestVerifiedContext(request=>input.context(request),options()),c=context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return context;
  };
  while(!input.signal.aborted){
    try{
      const page=await database.transaction(await current(),options(),tx=>new ReconciliationOwner().pendingClosed(tx,size,cursor));
      let compared=0;
      for(const ref of page){
        if(input.signal.aborted)return;
        try{await compareClosedOperation(database,await current(),options(),ref,grants,input.installation);compared++;}
        catch(error){if(error instanceof CoreError&&error.code==='VERSION_CONFLICT')continue;throw error;}
      }
      if(input.signal.aborted)return;
      cursor=page.length===size?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,compared},options),{deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
