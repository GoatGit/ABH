import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,OperationRecord} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {readPermit} from './dispatch-facts.ts';
import {recoverOperation} from './recover-operation.ts';

/** Recovery claims grant no right to send/query. Observing operations await the separately authorized reconciliation pipeline. */
export async function recoverPendingOperation(database:Database,context:VerifiedContext,options:TransactionOptions,
  operationRef:EntityRef,workerId:string,grantRefs:readonly EntityRef[]):Promise<OperationRecord|undefined>{
  contract('OperationRef',operationRef);contract('UUID',workerId);
  if(context.tenant.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
  const claim={targetRef:operationRef,workerId,leaseSeconds:30};
  const command={type:'abh.work-leases.claim',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(claim)};
  try{
    const lease=await database.transaction(context,options,async tx=>{
      const operations=new OperationOwner(),leases=new WorkLeaseOwner();
      const result=await executeCommand(tx,command,async()=>{
        await assertCurrentGrants(tx,{objectRef:operationRef,scopeRefs:[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}],action:'abh.operations.recover'},grantRefs);
        const operation=await operations.get(tx,operationRef.id);
        if(operation.operationRef.version!==operationRef.version)throw new CoreError('VERSION_CONFLICT');
        if(operation.position.lifecycle!=='Dispatching')throw new CoreError('PRECONDITION_FAILED');
        const rows=await tx.owner('OperationController')`SELECT id,version FROM execution.dispatch_permits
          WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND operation_id=${operationRef.id} AND ordinal=${operation.attemptCount}`;
        if(rows.length!==1)throw new CoreError('OPERATION_FACT_CONFLICT');
        const permit=await readPermit(tx,{type:'abh.dispatch-permit',id:rows[0]!.id,version:Number(rows[0]!.version)});
        const [clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
        if(clock!.now.getTime()<Date.parse(permit.expiresAt))throw new CoreError('PRECONDITION_FAILED');
      },async()=>{
        const lease=await leases.claim(tx,command,claim,async(tx,target)=>{
          const operation=await operations.get(tx,target.id);
          return (await new ActionOwner().getIntent(tx,operation.actionRef.id)).purposeNames;
        });return lease.leaseRef;
      });return leases.get(tx,result.receipt.resultRef);
    });
    const payload={workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken};
    const recovery={type:'abh.operations.recover',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({operationRef,payload})};
    return await recoverOperation(database,context,options,recovery,operationRef,payload,grantRefs);
  }catch(error){
    // Races are retried from durable state on the next sweep; permission and integrity failures remain visible.
    if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return undefined;
    throw error;
  }
}

export interface RecoveryWorkerOptions {
  workerId:string;
  /** Must issue a fresh current Service context for the configured tenant on each call. */
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  signal:AbortSignal;
  pageSize?:number;
  intervalMs?:number;
  transactionTimeoutMs?:number;
  onPage?(result:{scanned:number;recovered:number},options:TransactionOptions):Promise<void>;
}

/** Tenant-local bounded sweeps. Hosting/discovery supplies admitted tenants; no global SQL, queue authority or Provider transport. */
export async function runRecoveryWorker(database:Database,input:RecoveryWorkerOptions):Promise<void>{
  const pageSize=input.pageSize??100,intervalMs=input.intervalMs??1000,timeout=input.transactionTimeoutMs??10000;
  contract('UUID',input.workerId);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(intervalMs)||intervalMs<1||intervalMs>60000
    ||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
  const grantRefs=input.grantRefs.map(ref=>({...ref}));
  let cursor:string|undefined,tenantKey:string|undefined;
  const context=async()=>{
    const value=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+timeout,signal:input.signal}),c=value.tenant;
    if(c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actor.id,c.actingOrganizationId]);
    if(tenantKey!==undefined&&tenantKey!==key)throw new CoreError('FORBIDDEN');tenantKey=key;return value;
  };
  const options=():TransactionOptions=>({deadline:Date.now()+timeout,signal:input.signal});
  while(!input.signal.aborted){
    try{
      const current=await context();
      const page=await database.transaction(current,options(),tx=>new OperationOwner().pendingReconciliation(tx,pageSize,cursor));
      let recovered=0;
      for(const ref of page){
        if(input.signal.aborted)break;
        if(await recoverPendingOperation(database,await context(),options(),ref,input.workerId,grantRefs))recovered++;
      }
      if(input.signal.aborted)return;
      cursor=page.length===pageSize?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,recovered},options),{deadline:Date.now()+10000,signal:input.signal});
      await delay(intervalMs,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
