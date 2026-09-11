import type {CreateMissionCommand,EntityRef,MissionRecord} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {MissionOwner,type MissionDefinitionChecks} from './missions.ts';

export interface CreateMissionAdmission extends MissionDefinitionChecks {
 fenceRefs(tx:TenantTransaction,input:CreateMissionCommand['payload'],options:TransactionOptions):Promise<readonly EntityRef[]>;
}
/** Internal governed Draft creation. Public HTTP and activation are separate steps. */
export async function createMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CreateMissionCommand,
 grantRefs:readonly EntityRef[],admission:CreateMissionAdmission){
 requireVerifiedContext(context);
 const input=contract('CreateMissionCommand',structuredClone(supplied)),grants=structuredClone(grantRefs),limits={...options},c=context.tenant;
 if(input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(c.actor.type!=='Human'||c.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const fences=admission.fenceRefs.bind(admission),definition=admission.definition.bind(admission);
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work={...limits,signal:AbortSignal.any([limits.signal,tx.signal])},owner=new MissionOwner(),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const extra=structuredClone(await boundedCallback(opts=>fences(tx,structuredClone(input.payload),opts),work));
  const admit=async()=>{
   const locked=await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...extra]);
   if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
   const goal=await owner.validate(tx,work,input.payload,{definition});
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);return goal;
  };
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit();},async()=>{
   const goal=await admit(),created=await owner.create(tx,command,input.payload,goal);
    await admit();mission=created;return mission.missionRef;
  });
  return mission??await owner.get(tx,result.receipt.resultRef.id);
});
}
