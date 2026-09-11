import type {CaptureSignalCommand,EntityRef} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function captureSignal(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:CaptureSignalCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);
 const input=contract('CaptureSignalCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new LearningOwner(),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const locked=await lockFences(tx,[scope,...refs]);
  if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.learning.capture-signal'},refs);
  const result=await executeCommand(tx,command,async()=>{},async()=>{
   const signal=await owner.captureSignal(tx,input.payload);
   return signal.signalRef;
  });
  return {signalRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
