import type {EntityRef,SubmitVerificationCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {VerificationOwner} from './verification.ts';

export async function submitVerification(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:SubmitVerificationCommand,grants:readonly EntityRef[]){
 requireVerifiedContext(context);
 const input=contract('SubmitVerificationCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.verification.submit'&&c.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const owner=new VerificationOwner(),scope=input.payload.taskRef;
  const locked=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},...refs]);
  if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.verification.submit'},refs);
  const result=await executeCommand(tx,command,async()=>{},async()=>{
   const report=await owner.submit(tx,command,input.payload);
   return report.reportRef;
  });
  return {reportRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
