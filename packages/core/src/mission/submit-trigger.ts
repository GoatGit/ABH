import type {EntityRef,SubmitTriggerCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {MissionOwner} from './missions.ts';

export async function submitTrigger(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:SubmitTriggerCommand,
 grantRefs:readonly EntityRef[]){
 requireVerifiedContext(context);
 const input=contract('SubmitTriggerCommand',structuredClone(supplied)),grants=structuredClone(grantRefs),limits={...options},c=context.tenant;
 if(input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(c.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new MissionOwner(),scope={type:'abh.mission',id:input.payload.missionRef.id,version:input.payload.missionRef.version};
  const locked=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},...grants]);
  if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.missions.submit-trigger'},grants);
  const result=await executeCommand(tx,command,async()=>{},async()=>{
   const {disposition}=await owner.submitTrigger(tx,input.payload);
   return {type:'abh.mission-trigger',id:input.payload.triggerKey,version:1} as const satisfies EntityRef;
  });
  return {commandId:result.receipt.commandRef.id,replayed:result.replayed,disposition:result.replayed?'Duplicate':undefined};
 });
}
