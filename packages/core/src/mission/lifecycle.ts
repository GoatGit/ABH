import type {BlockMissionCommand,CancelMissionCommand,CloseMissionCommand,EntityRef,MissionRecord,PauseMissionCommand,ResolveBlockerCommand,ResumeMissionCommand,ReviseMissionGoalCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {MissionOwner} from './missions.ts';

type LifecycleCommand =
 |PauseMissionCommand|CancelMissionCommand|ResumeMissionCommand
 |ReviseMissionGoalCommand|CloseMissionCommand|BlockMissionCommand|ResolveBlockerCommand;

function assertMissionPurpose(context:VerifiedContext):void{
 if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
}

async function missionResult(mission:MissionRecord|undefined,receiptRef:EntityRef,
  tx:import('../data/uow.ts').TenantTransaction):Promise<MissionRecord>{
 return mission??new MissionOwner().get(tx,receiptRef.id);
}

async function admit(tx:import('../data/uow.ts').TenantTransaction,grants:readonly EntityRef[],action:string,scope:EntityRef){
 const locked=await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1},...grants]);
 if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
 await assertCurrentGrants(tx,{objectRef:scope,
   scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action},grants);
}

export async function pauseMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:PauseMissionCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertMissionPurpose(context);
 const input=contract('PauseMissionCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope=input.payload.missionRef;
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,refs,'abh.missions.pause',scope);},async()=>{
   await admit(tx,refs,'abh.missions.pause',scope);
   mission=await owner.pause(tx,input.payload.missionRef,input.payload.reasonCode,command);
   return mission.missionRef;
  });
  return missionResult(mission,result.receipt.resultRef,tx);
 });
}

export async function cancelMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CancelMissionCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertMissionPurpose(context);
 const input=contract('CancelMissionCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope=input.payload.missionRef;
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,refs,'abh.missions.cancel',scope);},async()=>{
   await admit(tx,refs,'abh.missions.cancel',scope);
   mission=await owner.cancel(tx,input.payload.missionRef,input.payload.reasonCode,input.payload.evidenceRefs??[],command);
   return mission.missionRef;
  });
  return missionResult(mission,result.receipt.resultRef,tx);
 });
}

export async function resumeMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:ResumeMissionCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertMissionPurpose(context);
 const input=contract('ResumeMissionCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope=input.payload.missionRef;
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,refs,'abh.missions.resume',scope);},async()=>{
   await admit(tx,refs,'abh.missions.resume',scope);
   mission=await owner.resume(tx,input.payload.missionRef,input.payload.resolvedBlockerRefs??[],command);
   return mission.missionRef;
  });
  return missionResult(mission,result.receipt.resultRef,tx);
 });
}

export async function blockMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:BlockMissionCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertMissionPurpose(context);
 const input=contract('BlockMissionCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope=input.payload.missionRef;
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,refs,'abh.missions.block',scope);},async()=>{
   await admit(tx,refs,'abh.missions.block',scope);
   mission=await owner.block(tx,input.payload.missionRef,input.payload,command);
   return mission.missionRef;
  });
  return missionResult(mission,result.receipt.resultRef,tx);
 });
}

export async function closeMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CloseMissionCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);assertMissionPurpose(context);
 const input=contract('CloseMissionCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope=input.payload.missionRef;
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,refs,'abh.missions.close',scope);},async()=>{
   await admit(tx,refs,'abh.missions.close',scope);
   mission=await owner.close(tx,input.payload.missionRef,input.payload.outcome,input.payload.resultRefs,input.payload.conditionEvaluationRef,command);
   return mission.missionRef;
  });
  return missionResult(mission,result.receipt.resultRef,tx);
 });
}
