import {randomUUID} from 'node:crypto';
import type {ActionCleanupRecord,ActionRecord,CleanupActionPayload,EntityRef,ReservationRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from '../control/fences.ts';
import {readAuthorizationSnapshot} from '../control/snapshots.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {currentIdentity} from '../identity/owner.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {ResourceFenceOwner} from './resource-fences.ts';
import {lockAction,sameRef} from './shared.ts';

export interface ActionCleanupChecks {
  fenceRefs(tx:TenantTransaction,action:ActionRecord):Promise<EntityRef[]>;
  /** Current cleanup/cancellation authority, independent of the revoked execution Grant. All requested fences are locked first. */
  admit(tx:TenantTransaction,action:ActionRecord,mode:CleanupActionPayload['mode']):Promise<void>;
}
export interface IssuedActionCleanup {readonly kind:'IssuedActionCleanup'}
const issued=new WeakMap<IssuedActionCleanup,{tx:TenantTransaction;actionRef:EntityRef;cleanup:ActionCleanupRecord;complete:()=>void}>();
export function consumeActionCleanup(tx:TenantTransaction,ref:EntityRef,token:IssuedActionCleanup){
  const value=issued.get(token);if(!value||value.tx!==tx||!sameRef(value.actionRef,ref))throw new CoreError('AUTHORITY_REQUIRED');tx.assertActive();issued.delete(token);return value;
}

/** Cleans only a finite one-shot authorization with proven zero Permits. Original plans/pins/snapshots remain immutable. */
export class ActionCleanupOwner {
  async cleanup(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,input:CleanupActionPayload,checks:ActionCleanupChecks):Promise<IssuedActionCleanup>{
    contract('ActionRef',actionRef);contract('CleanupActionPayload',input);const complete=tx.requireCompletion(),c=tx.context.tenant,actions=new ActionOwner(),operations=new OperationOwner(),ledger=new LedgerOwner();
    const action=await actions.get(tx,actionRef.id),plan=await operations.getPlan(tx,actionRef.id),intent=await actions.getIntent(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle!=='Authorized'||!action.authorizationSnapshotRef||!plan||!action.planRef||!sameRef(action.planRef,plan.planRef))throw new CoreError('PRECONDITION_FAILED');
    const snapshot=await readAuthorizationSnapshot(tx,action.authorizationSnapshotRef);
    if(snapshot.actionRef.id!==actionRef.id||snapshot.planDigest!==plan.digest||!sameRef(snapshot.planRef,plan.planRef)||snapshot.commitmentRefs.length)throw new CoreError('AUTHORITY_REQUIRED');
    await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...snapshot.epochVector.map(fence=>fence.scopeRef),...await checks.fenceRefs(tx,action)]);
    const identity=await currentIdentity(tx);if(identity.scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');await checks.admit(tx,action,input.mode);
    const key=(node:typeof plan.nodes[number])=>`${node.connectionRef.type}/${node.connectionRef.id}/${node.accountRef.type}/${node.accountRef.id}/${node.resourceKey}`;
    const slots=[];for(const node of [...new Map(plan.nodes.map(node=>[key(node),node])).values()].sort((a,b)=>key(a)<key(b)?-1:1))slots.push(await new ResourceFenceOwner().lock(tx,node));
    const reservations:ReservationRecord[]=[];
    for(const ref of snapshot.reservationRefs){const held=await ledger.getReservation(tx,ref.id);if(!sameRef(held.reservationRef,ref)||held.status!=='Held'||held.bindingRef.id!==actionRef.id||held.bindingRef.type!=='abh.action'||!sameRef(held.requestRef,snapshot.resourceOriginSnapshotRef))throw new CoreError('OBLIGATION_CONFLICT');reservations.push(held);}
    await ledger.lockCurrent(tx,reservations.map(reservation=>reservation.ledgerRef.id));await lockAction(tx,actionRef.id);
    if(canonicalJson(await actions.get(tx,actionRef.id))!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    const children=await operations.list(tx,actionRef.id);
    if(children.length!==plan.nodes.length||children.some(child=>child.attemptCount!==0||child.position.lifecycle!=='Pending')||slots.some(slot=>slot?.unresolvedOperationRef&&children.some(child=>child.operationRef.id===slot.unresolvedOperationRef!.id)))throw new CoreError('PRECONDITION_FAILED');
    const permits=await tx.owner('OperationController')`SELECT id FROM execution.dispatch_permits WHERE resource_organization_id=${c.resourceOrganizationId} AND action_id=${actionRef.id} LIMIT 1`;
    if(permits.length)throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    if(input.mode==='Expire'&&Date.parse(intent.expiresAt)>clock!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
    const cleanupRef={type:'abh.action-cleanup',id:randomUUID(),version:1},released:EntityRef[]=[];
    for(const reservation of [...reservations].sort((a,b)=>a.ledgerRef.id<b.ledgerRef.id?-1:1))released.push((await ledger.release(tx,command,{reservationRef:reservation.reservationRef,evidence:{verdict:'ConfirmedNoEffect',evidenceRef:cleanupRef}})).reservationRef);
    if(input.mode!=='Reauthorize')await operations.cancelPending(tx,command,actionRef);
    const unsigned=contract('ActionCleanupRecord',{cleanupRef,resourceOrganizationId:c.resourceOrganizationId,actionRef,snapshotRef:snapshot.snapshotRef,planRef:plan.planRef,...input,releasedReservationRefs:released,checkedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const cleanup=contract('ActionCleanupRecord',{...unsigned,digest:await digestContract('ActionCleanupRecord',unsigned)});
    await tx.owner('ActionEngine')`INSERT INTO execution.action_cleanups(resource_organization_id,id,workspace_id,purpose_names,action_id,snapshot_id,record)
      VALUES (${c.resourceOrganizationId},${cleanupRef.id},${c.workspaceId??null},${intent.purposeNames},${actionRef.id},${snapshot.snapshotRef.id},${JSON.stringify(cleanup)}::text::jsonb)`;
    await appendChange(tx,{command,target:cleanupRef,eventType:'abh.action-cleanup.created',changedFields:['mode','releasedReservationRefs','snapshotRef'],relatedRefs:[actionRef,snapshot.snapshotRef,...released]});
    const token=Object.freeze({kind:'IssuedActionCleanup' as const});issued.set(token,{tx,actionRef,cleanup,complete});return token;
  }
}
