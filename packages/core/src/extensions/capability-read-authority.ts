import type {EntityRef} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
/** Read authority only: does not grant implementation invocation or alter tenant purpose. */
export async function assertCapabilityRead(tx:TenantTransaction,grants:readonly EntityRef[]):Promise<void>{
 const c=tx.context.tenant,authority=structuredClone(grants);
 if(!['abh.action.prepare','abh.action.execute','abh.operation.reconcile'].includes(c.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
 if(c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},authority);
}
