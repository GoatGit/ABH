import {lockFences} from '../control/fences.ts';
import {readAuthorizationSnapshot} from '../control/snapshots.ts';
import {ActionCleanupOwner} from './action-cleanup.ts';
import type {ActionRecord,CancelActionPayload,EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {ActionOwner} from './actions.ts';

/** Authenticated internal post-dispatch cancellation ingress. Current cancellation Grants are independent of execution Grants. */
export async function cancelDispatchedAction(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  actionRef:EntityRef,input:CancelActionPayload,grantRefs:readonly EntityRef[]):Promise<ActionRecord>{
  contract('ActionRef',actionRef);contract('CancelActionPayload',input);
  if(command.type!=='abh.actions.cancel'||command.digest!==await inputDigest({actionRef,payload:input}))throw new CoreError('INVALID_ARGUMENT');
  return database.transaction(context,options,async tx=>{
    const actions=new ActionOwner(),admit=async()=>{
      await assertCurrentGrants(tx,{objectRef:actionRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.actions.cancel'},grantRefs);
      await actions.get(tx,actionRef.id);
    };
    const result=await executeCommand(tx,command,admit,async()=>(await actions.requestCancellation(tx,command,actionRef,input.reason,admit)).actionRef);
    if(result.receipt.resultRef.type!=='abh.action'||result.receipt.resultRef.id!==actionRef.id)throw new CoreError('INTERNAL_ERROR');
    return actions.get(tx,actionRef.id);
  });
}

export interface ActionCancellationChecks {
  fenceRefs(tx: import('../data/uow.ts').TenantTransaction, action: ActionRecord): Promise<EntityRef[]>;
  /** Current source visibility, cancellation policy, MFA and duties, including historical replay. */
  admit(tx: import('../data/uow.ts').TenantTransaction, action: ActionRecord, input: CancelActionPayload): Promise<void>;
}

/** Unified cancellation: preparation, zero-dispatch authorized cleanup, or stop-and-reconcile after dispatch. */
export async function cancelAction(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  actionRef:EntityRef,input:CancelActionPayload,grantRefs:readonly EntityRef[],checks:ActionCancellationChecks){
  contract('ActionRef',actionRef);contract('CancelActionPayload',input);
  const reference={...actionRef},payload=structuredClone(input),identity={...command},grants=structuredClone([...grantRefs]);
  if(identity.type!=='abh.actions.cancel'||identity.digest!==await inputDigest({actionRef:reference,payload}))throw new CoreError('INVALID_ARGUMENT');
  return database.transaction(context,options,async tx=>{
    const actions=new ActionOwner(),scope={type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,identity,async()=>{
      const action=await actions.get(tx,reference.id);
      const sourceFences=structuredClone(await checks.fenceRefs(tx,structuredClone(action)));
      // Cleanup acquires epoch/resource/ledger locks before the parent; declare its complete Control set first.
      const snapshot=action.position.lifecycle==='Authorized'&&action.authorizationSnapshotRef?await readAuthorizationSnapshot(tx,action.authorizationSnapshotRef):undefined;
      await lockFences(tx,[scope,{type:'abh.principal',id:context.tenant.actor.id,version:1},...grants,...sourceFences,...(snapshot?.epochVector.map(fence=>fence.scopeRef)??[])]);
      await assertCurrentGrants(tx,{objectRef:reference,scopeRefs:[scope],action:identity.type},grants);
      await checks.admit(tx,structuredClone(action),structuredClone(payload));
    },async()=>{
      const action=await actions.get(tx,reference.id);
      if(action.position.lifecycle==='Proposed'||action.position.lifecycle==='Validated')return (await actions.cancelPreparation(tx,identity,reference,payload.reason)).actionRef;
      if(action.position.lifecycle==='Authorized')return (await actions.cleanupAuthorized(tx,identity,reference,tx=>new ActionCleanupOwner().cleanup(tx,identity,reference,{mode:'Cancel',reason:payload.reason},{
        fenceRefs:async()=>[],admit:async(tx,current)=>checks.admit(tx,structuredClone(current),structuredClone(payload)),
      }))).actionRef;
      return (await actions.requestCancellation(tx,identity,reference,payload.reason,async(tx,current)=>checks.admit(tx,structuredClone(current),structuredClone(payload)))).actionRef;
    });
    if(result.receipt.resultRef.type!=='abh.action'||result.receipt.resultRef.id!==reference.id)throw new CoreError('INTERNAL_ERROR');
    await actions.get(tx,reference.id);
    return {actionRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
  });
}
