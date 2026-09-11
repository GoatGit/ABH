import type {EntityRef,ResponsibilityRequestRecord,ReviseResponsibilityRoutePayload} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner,type DecisionEligibility} from './decisions.ts';

export interface RouteRevisionInstallation {
  eligibility:DecisionEligibility;
  /** All policy, directory, delegation and candidate qualification fences must be declared up front. */
  fenceRefs(tx:TenantTransaction,input:ReviseResponsibilityRoutePayload):Promise<EntityRef[]>;
  /** Current management/delegation permission and source evidence visibility; also runs on replay. */
  admit(tx:TenantTransaction,input:ReviseResponsibilityRoutePayload):Promise<void>;
  /** Verify frozen policy/directory versions, legal replacement seats and unchanged impact under declared fences. */
  govern(tx:TenantTransaction,current:ResponsibilityRequestRecord,input:ReviseResponsibilityRoutePayload):Promise<void>;
}

export async function reviseResponsibilityRoute(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  input:ReviseResponsibilityRoutePayload,grantRefs:readonly EntityRef[],installation:RouteRevisionInstallation){
  contract('ReviseResponsibilityRoutePayload',input);
  if(command.type!=='abh.responsibility-requests.revise-route'||command.digest!==await inputDigest(input))throw new CoreError('INVALID_ARGUMENT');
  const payload=structuredClone(input),grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await installation.fenceRefs(tx,payload)]);
      await assertCurrentGrants(tx,{objectRef:payload.expectedRequestRef,scopeRefs:[scope],action:command.type},grants);
      await installation.admit(tx,payload);await installation.eligibility.lock(tx,payload.proposal.request);
    },async()=>(await new DecisionOwner().reviseRoute(tx,command,payload,installation.eligibility,installation.govern)).requestRef);
    return {requestRef:result.receipt.resultRef,replayed:result.replayed};
  });
}
