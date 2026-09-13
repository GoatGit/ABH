import type {CancelRunCommand,ClaimTaskCommand,CommitVerifiedTaskCommand,CompleteInvocationCommand,CompleteRunCommand,
  EntityRef,FinalizeInvocationCommand,ObserveLateInvocationCommand,PrepareInvocationCommand,ProposeGraphPatchCommand,
  StartRunCommand,StopStalledRunCommand,WakeRunCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {RunOwner} from './runs.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';

function assertRunPurpose(context:VerifiedContext):void{
 if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
}

async function admitRun(tx:TenantTransaction,grants:readonly EntityRef[],action:string,scope:EntityRef){
 const locked=await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1},...grants]);
 if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
 await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action},grants);
}

function assertTaskPurpose(context:VerifiedContext):void{
 if(context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');
 if(!['abh.mission.manage','abh.runtime.deliver'].includes(context.tenant.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
}

async function admitTask(tx:TenantTransaction,grants:readonly EntityRef[],action:string,scope:EntityRef){
 if(tx.context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');
 await admitRun(tx,grants,action,scope);
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

export async function cancelRun(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CancelRunCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertRunPurpose(context);
 const input=contract('CancelRunCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.runRef;
  let record:Awaited<ReturnType<RunOwner['cancel']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitRun(tx,refs,input.type,scope);},async()=>{
   await admitRun(tx,refs,input.type,scope);
   record=await owner.cancel(tx,command,input.payload);
   return record.runRef;
  });
 return record??await owner.get(tx,result.receipt.resultRef.id);
});
}

export async function proposeGraphPatch(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ProposeGraphPatchCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);
 if(!['abh.mission.manage','abh.runtime.deliver'].includes(context.tenant.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
 const input=contract('ProposeGraphPatchCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.type!=='abh.graph-patches.propose'||input.target.type!=='abh.run'
   ||input.target.id!==input.payload.runRef.id
   ||input.expectedVersion!==input.payload.runRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.runRef;
  let record:Awaited<ReturnType<RunOwner['proposeGraphPatch']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{
   await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1},...refs]);
   await assertCurrentGrants(tx,{objectRef:scope,
    scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
    action:'abh.graph-patches.propose'},refs);
  },async()=>{
   record=await owner.proposeGraphPatch(tx,command,scope,input.payload);
   return record.revisionRef;
  });
  return record??await owner.getGraphRevision(tx,result.receipt.resultRef.id);
 });
}

export async function wakeRun(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:WakeRunCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);
 if(!['abh.mission.manage','abh.runtime.deliver'].includes(context.tenant.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
 const input=contract('WakeRunCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.type!=='abh.runs.wake'||input.target.type!=='abh.run'
   ||input.target.id!==input.payload.runRef.id
   ||input.expectedVersion!==input.payload.runRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.runRef;
  let record:Awaited<ReturnType<RunOwner['wake']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{
   await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1},...refs]);
   await assertCurrentGrants(tx,{objectRef:scope,
    scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.runs.wake'},refs);
  },async()=>{record=await owner.wake(tx,command,input.payload);return record.runRef;});
return record??await owner.get(tx,result.receipt.resultRef.id);
});
}

export async function stopStalledRun(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:StopStalledRunCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('StopStalledRunCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.type!=='abh.runs.stop-stalled'||input.target.type!=='abh.run'
   ||input.target.id!==input.payload.runRef.id
   ||input.expectedVersion!==input.payload.runRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.runRef;
  let record:Awaited<ReturnType<RunOwner['stopStalled']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   await admitTask(tx,refs,input.type,scope);
   record=await owner.stopStalled(tx,command,input.payload);return record.runRef;
  });
 return record??await owner.get(tx,result.receipt.resultRef.id);
 });
}

export async function claimTask(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ClaimTaskCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('ClaimTaskCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.task'||input.target.id!==input.payload.taskRef.id
   ||input.expectedVersion!==input.payload.taskRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.taskRef;
  let lease:Awaited<ReturnType<RunOwner['claim']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   lease=await owner.claim(tx,command,input.payload);return lease.leaseRef;
  });
  return lease??await new WorkLeaseOwner().get(tx,result.receipt.resultRef);
 });
}

export async function prepareInvocation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:PrepareInvocationCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('PrepareInvocationCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.task'||input.target.id!==input.payload.taskRef.id
   ||input.expectedVersion!==input.payload.taskRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.taskRef;
  let record:Awaited<ReturnType<RunOwner['prepareInvocation']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   record=await owner.prepareInvocation(tx,command,input.payload);return record.invocationRef;
  });
  return record??await owner.getInvocation(tx,result.receipt.resultRef.id);
 });
}

export async function finalizeInvocation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:FinalizeInvocationCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('FinalizeInvocationCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.invocation'||input.target.id!==input.payload.invocationRef.id
   ||input.expectedVersion!==input.payload.invocationRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.invocationRef;
  let record:Awaited<ReturnType<RunOwner['finalizeInvocation']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   record=await owner.finalizeInvocation(tx,command,input.payload);return record.invocationRef;
  });
  return record??await owner.getInvocation(tx,result.receipt.resultRef.id);
 });
}

export async function completeInvocation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:CompleteInvocationCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('CompleteInvocationCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.invocation'||input.target.id!==input.payload.invocationRef.id
   ||input.expectedVersion!==input.payload.invocationRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.invocationRef;
  let record:Awaited<ReturnType<RunOwner['completeInvocation']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   record=await owner.completeInvocation(tx,command,input.payload);return record.invocationRef;
  });
  return record??await owner.getInvocation(tx,result.receipt.resultRef.id);
 });
}

export async function observeLateInvocation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ObserveLateInvocationCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('ObserveLateInvocationCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.invocation'||input.target.id!==input.payload.invocationRef.id
  )throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.invocationRef;
  let record:Awaited<ReturnType<RunOwner['observeLateInvocation']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   record=await owner.observeLateInvocation(tx,command,input.payload);return record.observationRef;
  });
  return record??await owner.observeLateInvocation(tx,command,input.payload);
 });
}

export async function commitVerifiedTask(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:CommitVerifiedTaskCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertTaskPurpose(context);
 const input=contract('CommitVerifiedTaskCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 if(input.target.type!=='abh.task'||input.target.id!==input.payload.taskRef.id
   ||input.expectedVersion!==input.payload.taskRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new RunOwner(),scope=input.payload.taskRef;
  let record:Awaited<ReturnType<RunOwner['commitVerifiedTask']>>|undefined;
  const result=await executeCommand(tx,command,async()=>{await admitTask(tx,refs,input.type,scope);},async()=>{
   record=await owner.commitVerifiedTask(tx,command,input.payload);return record.checkpointRef;
  });
  return record??await owner.getCheckpoint(tx,result.receipt.resultRef.id);
 });
}
