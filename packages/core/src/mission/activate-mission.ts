import type {ActivateMissionCommand,EntityRef,MissionRecord} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {MissionOwner} from './missions.ts';

export interface ActivateMissionAdmission {
 /** Resolve current MissionAuthority and verify its scope covers this mission's conditions. */
 authority(tx:import('../data/uow.ts').TenantTransaction,authorityRef:EntityRef,options:TransactionOptions):Promise<void>;
}

export async function activateMission(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:ActivateMissionCommand,
 grantRefs:readonly EntityRef[],admission:ActivateMissionAdmission){
 requireVerifiedContext(context);
 const input=contract('ActivateMissionCommand',structuredClone(supplied)),grants=structuredClone(grantRefs),limits={...options},c=context.tenant;
 // Registry/CLI contract: the command target is the mission being activated (like the
 // other lifecycle commands), not the organization scope.
 if(input.target.type!=='abh.mission'||input.target.id!==input.payload.missionRef.id)throw new CoreError('FORBIDDEN');
 if(c.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const authority=admission.authority.bind(admission);
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work={...limits,signal:AbortSignal.any([limits.signal,tx.signal])},owner=new MissionOwner();
  const scope={type:'abh.mission',id:input.payload.missionRef.id,version:input.payload.missionRef.version};
  const admit=async()=>{
   const locked=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},...grants]);
   if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.missions.activate'},grants);
   await boundedCallback(opts=>authority(tx,input.payload.authorityRef,opts),work);
  };
  let mission:MissionRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit();},async()=>{
   await admit();
   mission=await owner.activate(tx,input.payload.missionRef,input.payload.authorityRef,command);
   return mission.missionRef;
  });
  return mission??await owner.get(tx,result.receipt.resultRef.id);
});
}
