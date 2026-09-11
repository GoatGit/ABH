import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,OpenTerminalExceptionPayload} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {sameRef} from '../execution/shared.ts';
import {ExceptionOwner,openTerminalException,type ExceptionInstallation} from './exceptions.ts';

export interface ExceptionWorkerOptions {
  context:ContextSource;signal:AbortSignal;grantRefs:readonly EntityRef[];installation:ExceptionInstallation;
  /** Installed governance builds the current responsibility proposal; no caller-selected tenant. */
  route(reportRef:EntityRef,options:TransactionOptions):Promise<OpenTerminalExceptionPayload>;
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;opened:number},options:TransactionOptions):Promise<void>;
}

async function routing(input:ExceptionWorkerOptions,report:EntityRef):Promise<OpenTerminalExceptionPayload>{
  const controller=new AbortController(),cancel=()=>controller.abort(input.signal.reason),deadline=Date.now()+10000;
  input.signal.addEventListener('abort',cancel,{once:true});if(input.signal.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(),10000);let onAbort=()=>{};
  const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort();});
  try{
    const payload=await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');return input.route({...report},{deadline,signal:controller.signal});}),aborted]);
    if(controller.signal.aborted||Date.now()>=deadline)throw new CoreError('DEPENDENCY_TIMEOUT');
    contract('OpenTerminalExceptionPayload',payload);if(!sameRef(payload.reportRef,report))throw new CoreError('FORBIDDEN');return structuredClone(payload);
  }finally{clearTimeout(timer);input.signal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onAbort);}
}

/** Discover frozen reports without cases. Case creation is separate from freezing, so routing failure cannot unfreeze a resource. */
export async function runExceptionWorker(database:Database,input:ExceptionWorkerOptions):Promise<void>{
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
      const page=await database.transaction(await current(),options(),tx=>new ExceptionOwner().pending(tx,size,cursor));let opened=0;
      for(const report of page){
        if(input.signal.aborted)return;
        const payload=await routing(input,report),context=await current();
        const command={type:'abh.exceptions.open-terminal',commandId:randomUUID(),idempotencyKey:`exception/${report.id}`,digest:await inputDigest(payload)};
        try{await openTerminalException(database,context,options(),command,payload,grants,input.installation);opened++;}
        catch(error){
          if(!(error instanceof CoreError)||!['IDEMPOTENCY_CONFLICT','PRECONDITION_FAILED','DECISION_PACKAGE_INCOMPLETE'].includes(error.code))throw error;
          // Only a durable case from a competing admitted worker, or a replaced freeze, permits deferral.
          const deferred=await database.transaction(await current(),options(),async tx=>{
            const owner=new ExceptionOwner();await owner.admit(tx,payload,grants,input.installation);
            const c=tx.context.tenant;
            const existing=await tx.owner('HumanGateway')`SELECT id,version FROM human.exceptions WHERE resource_organization_id=${c.resourceOrganizationId} AND report_id=${report.id}`;
            if(existing[0]){await owner.get(tx,{type:'abh.exception',id:existing[0].id,version:Number(existing[0].version)});return true;}
            const frozen=await tx.owner('OperationController')`SELECT id FROM execution.resource_fences WHERE resource_organization_id=${c.resourceOrganizationId}
              AND record->'blockedByReportRef'->>'id'=${report.id} AND deleted_at IS NULL`;
            return !frozen.length;
          });
          if(!deferred)throw error;
        }
      }
      if(input.signal.aborted)return;cursor=page.length===size?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,opened},options),{deadline:Date.now()+10000,signal:input.signal});await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
