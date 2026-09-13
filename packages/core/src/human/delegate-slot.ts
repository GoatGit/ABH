import type {EntityRef,ReviseResponsibilityRoutePayload} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner} from './decisions.ts';
import type {RouteRevisionInstallation} from './revise-route.ts';

export async function delegateResponsibilitySlot(database:Database,context:VerifiedContext,options:TransactionOptions,
  command:CommandIdentity,input:ReviseResponsibilityRoutePayload,grantRefs:readonly EntityRef[],
  installation:RouteRevisionInstallation){
  const normalized={...input};
  if(normalized.delegation===undefined)delete normalized.delegation;
  if(!normalized.delegation)throw new CoreError('DELEGATION_EXCEEDS_AUTHORITY');
  contract('ReviseResponsibilityRoutePayload',normalized);
  if(command.type!=='abh.responsibility-requests.delegate-slot'||command.digest!==await inputDigest(input))
    throw new CoreError('INVALID_ARGUMENT');
  const payload=structuredClone(normalized),grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,
        ...await installation.fenceRefs(tx,payload)]);
      await assertCurrentGrants(tx,{objectRef:payload.expectedRequestRef,scopeRefs:[scope],
        action:command.type},grants);
      await installation.admit(tx,payload);
      await installation.eligibility.lock(tx,payload.proposal.request);
    },async()=>(await new DecisionOwner().reviseRoute(tx,command,payload,
      installation.eligibility,installation.govern)).requestRef);
    return {requestRef:result.receipt.resultRef,replayed:result.replayed};
  });
}
