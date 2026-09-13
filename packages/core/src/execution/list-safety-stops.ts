import type {EntityRef,ListSafetyStopsQuery,SafetyStopCandidate,SafetyStopListResult} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext} from '../internal/context.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';

/** Current candidate discovery only; it never authorizes or dispatches a safety-stop Action. */
export async function listSafetyStops(database:Database,context:VerifiedContext,options:TransactionOptions,
  input:ListSafetyStopsQuery,grantRefs:readonly EntityRef[]):Promise<SafetyStopListResult>{
  requireVerifiedContext(context);
  const query=contract('ListSafetyStopsQuery',structuredClone(input)),grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,scope={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1 as const};
    await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants]);
    await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.actions.read'},grants);
    const rows=await tx.owner('OperationController')`SELECT id,record,version,clock_timestamp() AS now
      FROM execution.resource_fences WHERE resource_organization_id=${c.resourceOrganizationId}
      AND unresolved_operation_id IS NOT NULL AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      ORDER BY updated_at DESC,id DESC LIMIT ${query.limit+1}`;
    const candidates:SafetyStopCandidate[]=[];
    for(const row of rows.slice(0,query.limit)){
      const fence=contract('ResourceFenceRecord',row.record);
      if(fence.fenceRef.id!==String(row.id)||fence.fenceRef.version!==Number(row.version)||fence.resourceOrganizationId!==c.resourceOrganizationId
        ||!fence.unresolvedOperationRef)throw new CoreError('INTERNAL_ERROR');
      candidates.push({fenceRef:fence.fenceRef,connectionRef:fence.connectionRef,accountRef:fence.accountRef,
        resourceKey:fence.resourceKey,fencingToken:fence.fencingToken,unresolvedOperationRef:fence.unresolvedOperationRef,
        ...(fence.safetyStopOperationRef?{safetyStopOperationRef:fence.safetyStopOperationRef}:{}),
        ...(fence.blockedByReportRef?{blockedByReportRef:fence.blockedByReportRef}:{})});
    }
    return contract('SafetyStopListResult',{candidates,complete:rows.length<=query.limit,
      asOf:(rows[0]?.now??new Date()).toISOString()});
  });
}
