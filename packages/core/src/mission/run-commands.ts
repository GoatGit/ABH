import type {CompleteRunCommand,EntityRef,StartRunCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {RunOwner} from './runs.ts';

function assertRunPurpose(context:VerifiedContext):void{
 if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
}

async function admitRun(tx:TenantTransaction,grants:readonly EntityRef[],action:string,scope:EntityRef){
 const locked=await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1},...grants]);
 if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
 await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action},grants);
}

export async function startRun(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:StartRunCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertRunPurpose(context);
 const input=contract('StartRunCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.missionRef;
  let record:Awaited<ReturnType<RunOwner['start']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitRun(tx,refs,input.type,scope);},async()=>{
   await admitRun(tx,refs,input.type,scope);
   record=await owner.start(tx,command,input.payload);
   return record.runRef;
  });
  return record??await owner.get(tx,result.receipt.resultRef.id);
 });
}

export async function completeRun(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CompleteRunCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertRunPurpose(context);
 const input=contract('CompleteRunCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.runRef;
  let record:Awaited<ReturnType<RunOwner['complete']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitRun(tx,refs,input.type,scope);},async()=>{
   await admitRun(tx,refs,input.type,scope);
   record=await owner.complete(tx,command,input.payload);
   return record.runRef;
  });
  return record??await owner.get(tx,result.receipt.resultRef.id);
 });
}
