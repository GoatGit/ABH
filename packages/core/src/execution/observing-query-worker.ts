import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,OperationPlanNode,OperationRecord} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {contract,inputDigest,executeCommand,type CommandIdentity} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from './actions.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {OperationController,type OperationControlChecks} from './operation-controller.ts';
import {OperationOwner} from './operations.ts';
import {ReconciliationOwner,type InstalledComparisonRule,type ReconciliationChecks} from './reconciliations.ts';
import {captureQuery} from './query-capture.ts';
import type {QueryCaptureChecks} from './query-capture.ts';
import {queryOnce} from './query-transport.ts';
import type {WorkLeaseRecord} from '@abh/contracts';
import type {InstalledQueryPolicy} from './query-exit.ts';
import type {QueryTransport} from './query-transport.ts';

async function command(type:string,value:unknown):Promise<CommandIdentity>{
  return {type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)};
}

export interface ObservingQueryInstallation {
  resolve(operation:OperationRecord,node:OperationPlanNode):Promise<{
    authorityRef:EntityRef&{type:'abh.execution-authority'};policy:InstalledQueryPolicy;transport:QueryTransport;
  }>;
  capture:QueryCaptureChecks;
  reconcile:{rule(node:OperationPlanNode):InstalledComparisonRule;checks:ReconciliationChecks};
  controller(operation:OperationRecord,node:OperationPlanNode):Promise<OperationControlChecks>;
}

export interface ObservingQueryWorkerOptions {
  workerId:string;context:ContextSource;signal:AbortSignal;
  installation:ObservingQueryInstallation;pageSize?:number;intervalMs?:number;leaseSeconds?:number;
  onPage?(result:{scanned:number;queried:number;reconciled:number;closed:number},options:TransactionOptions):Promise<void>|void;
}

/** Production-style tenant-local scheduler for already-dispatched Observing
 * Operations. Every external read gets a fresh authority check, durable query
 * exit and independent capture admission; no result is invented on transport
 * ambiguity. Ambiguous reconciliations remain Observing and release the lease. */
export async function runObservingQueryWorker(database:Database,input:ObservingQueryWorkerOptions):Promise<void>{
  const pageSize=input.pageSize??100,interval=input.intervalMs??1000,leaseSeconds=input.leaseSeconds??30;
  contract('UUID',input.workerId);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(interval)||interval<1||interval>60000
    ||!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>300)throw new CoreError('INVALID_ARGUMENT');
  let binding:string|undefined,cursor:string|undefined;
  const options=():TransactionOptions=>({deadline:Date.now()+10000,signal:input.signal});
  const current=async()=>{
    const context=await requestVerifiedContext(request=>input.context(request),options()),c=context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return context;
  };
  const operationOwner=new OperationOwner(),leases=new WorkLeaseOwner(),controller=new OperationController();
  while(!input.signal.aborted){
    try{
      const context=await current(),page=await database.transaction(context,options(),tx=>operationOwner.pendingObservingQuery(tx,pageSize,cursor));
      let queried=0,reconciled=0,closed=0;
      for(const operationRef of page){
        if(input.signal.aborted)return;
        const operation=await database.transaction(await current(),options(),tx=>operationOwner.get(tx,operationRef.id));
        const plan=await database.transaction(await current(),options(),tx=>operationOwner.getPlan(tx,operation.actionRef.id));
        const node=plan?.nodes.find(entry=>entry.nodeKey===operation.nodeKey);
        if(!plan||!node)throw new CoreError('OPERATION_FACT_CONFLICT');
        const resolved=await input.installation.resolve(structuredClone(operation),structuredClone(node));
        const claimInput={targetRef:operationRef,workerId:input.workerId,leaseSeconds},claimCommand=await command('abh.work-leases.claim',claimInput);
        let lease:WorkLeaseRecord|undefined;
        await database.transaction(await current(),options(),tx=>executeCommand(tx,claimCommand,async()=>{},async()=>{
          lease=await leases.claim(tx,claimCommand,claimInput,async(tx,target)=>{
            const owned=await operationOwner.get(tx,target.id);
            if(owned.position.lifecycle!=='Observing')throw new CoreError('PRECONDITION_FAILED');
            return (await new ActionOwner().getIntent(tx,owned.actionRef.id)).purposeNames;
          });return lease.leaseRef;
        }));
        if(!lease)throw new CoreError('INTERNAL_ERROR');
        const activeLease=lease;
        try{
          const currentRef=operation.operationRef;
          const queryInput={operationRef:currentRef,queryAuthorityRef:resolved.authorityRef,leaseRef:activeLease.leaseRef,
            workerId:activeLease.workerId,leaseFencingToken:activeLease.fencingToken};
          const observation=await queryOnce(database,await current(),options(),queryInput,resolved.policy,resolved.transport);
          const result={status:'Captured' as const,capture:await captureQuery(database,await current(),options(),observation,input.installation.capture)};
          queried++;
          if(result.status==='Captured'&&result.capture.receiptRef){
            const receipts=[result.capture.receiptRef],payload={receiptRefs:receipts};
            const compareCommand=await command('abh.operations.reconcile',{operationRef,...payload});
            let reportRef;
            await database.transaction(await current(),options(),async tx=>{
              await executeCommand(tx,compareCommand,async()=>{},async()=>{
                reportRef=(await new ReconciliationOwner().compare(tx,compareCommand,currentRef,payload,
                  input.installation.reconcile.rule(node),input.installation.reconcile.checks)).reconciliationRef;return reportRef!;
              });
            });
            reconciled++;
            const applyInput={reportRef:reportRef!,workerId:activeLease.workerId,leaseRef:activeLease.leaseRef,leaseFencingToken:activeLease.fencingToken};
            const applyCommand=await command('abh.operations.apply-reconciliation',applyInput);
            const controllerChecks=await input.installation.controller(structuredClone(operation),structuredClone(node));
            let applied!:Awaited<ReturnType<OperationController['apply']>>;
            await database.transaction(await current(),options(),tx=>executeCommand(tx,applyCommand,async()=>{},async()=>{
              applied=await controller.apply(tx,applyCommand,currentRef,applyInput,controllerChecks);return applied.operationRef;
            }));
            if(applied.position.lifecycle==='Closed')closed++;
          }
        }catch(error){
          if(error instanceof CoreError&&['RESOURCE_EXHAUSTED','PRECONDITION_FAILED','VERSION_CONFLICT'].includes(error.code))
            continue;
          throw error;
        }finally{
          if(!input.signal.aborted){
            const releaseInput={workerId:lease.workerId,fencingToken:lease.fencingToken};
            const releaseCommand=await command('abh.work-leases.release',releaseInput);
            await database.transaction(await current(),options(),tx=>leases.release(tx,releaseCommand,activeLease.leaseRef,activeLease.workerId,activeLease.fencingToken));
          }
        }
      }
      if(input.signal.aborted)return;
      cursor=page.length===pageSize?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(async opts=>{await input.onPage!({scanned:page.length,queried,reconciled,closed},opts);},options());
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
}
}
