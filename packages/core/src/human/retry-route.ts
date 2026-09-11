import type {EntityRef,OpenResponsibilityRequestPayload} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner,type DecisionEligibility} from './decisions.ts';

/** Current routing authority is independent of the eventual approver and is required on Command replay too. */
export async function retryResponsibilityRoute(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  input:OpenResponsibilityRequestPayload,grantRefs:readonly EntityRef[],installation:{eligibility:DecisionEligibility;fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>}){
  contract('OpenResponsibilityRequestPayload',input);
  if(command.type!=='abh.responsibility-requests.retry-route'||command.digest!==await inputDigest(input))throw new CoreError('INVALID_ARGUMENT');
  const payload=structuredClone(input),grants=structuredClone([...grantRefs]),owner=new DecisionOwner();
  return database.transaction(context,options,async tx=>{
    const c=context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await installation.fenceRefs(tx)]);
      await assertCurrentGrants(tx,{objectRef:payload.request.requestRef,scopeRefs:[scope],action:command.type},grants);
      await installation.eligibility.lock(tx,payload.request);
    },async()=>(await owner.retryUnresolved(tx,command,payload,installation.eligibility)).requestRef);
    // Receipt identifies the committed revision; read separately for current Request status.
    return {requestRef:result.receipt.resultRef,replayed:result.replayed};
  });
}
