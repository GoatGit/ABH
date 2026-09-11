import {createContractCatalog} from '@abh/contracts/catalog';
import type {Database} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {currentIdentity} from '../identity/owner.ts';
import {CoreError} from '../internal/errors.ts';
import type {HttpServiceOptions} from './service.ts';

type StartupCheck=NonNullable<HttpServiceOptions['startup']>['checks'][number];

/** Same-organization Service startup admission, not a Grant or an execution permit. */
export function serviceIdentityCheck(database:Database,input:{name:string;organizationId:string;principalId:string;purpose:string;context:ContextSource}):StartupCheck{
  const {name,organizationId,principalId,purpose,context}=input;
  contract('UUID',organizationId);contract('UUID',principalId);contract('RegisteredName',purpose);
  const catalog=createContractCatalog();
  if(!catalog.success||!Object.hasOwn(catalog.data.purposes,purpose))throw new CoreError('PURPOSE_DENIED');
  return {name,verify:async options=>{
    const current=await requestVerifiedContext(context,{...options,readOnly:true}),c=current.tenant;
    if(c.actor.type!=='Service'||c.actor.id!==principalId||c.resourceOrganizationId!==organizationId
      ||c.actingOrganizationId!==organizationId||c.workspaceId!==undefined||c.purposeOfUse!==purpose)throw new CoreError('FORBIDDEN');
    await database.transaction(current,{...options,readOnly:true},async tx=>{
      const identity=await currentIdentity(tx);
      if(identity.scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');
    });
  }};
}
