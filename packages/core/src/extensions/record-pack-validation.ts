import type {EntityRef,RecordPackValidationCommand} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {PackValidationReportOwner,type StoredPackValidation} from './validation-reports.ts';
import type {GovernedLocalPack} from './validate-current-pack.ts';

export interface PackRecordAdmission {
  fenceRefs(tx:TenantTransaction,evidence:StoredPackValidation):Promise<EntityRef[]>;
  /** Under transaction locks, verify deployment policy version/digest, revocations, references and retention, also on replay. */
  current(tx:TenantTransaction,evidence:StoredPackValidation):Promise<void>;
}

/** Current identity + organization Grant + dedicated purpose precede every new record or replay. */
export async function recordPackValidation(database:Database,context:VerifiedContext,options:TransactionOptions,
  command:RecordPackValidationCommand,candidate:GovernedLocalPack,grantRefs:readonly EntityRef[],checks:PackRecordAdmission):Promise<EntityRef>{
  requireVerifiedContext(context);
  const input=contract('RecordPackValidationCommand',JSON.parse(canonicalJson(command))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[];
  const fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks),c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  return database.transaction(context,options,tx=>new PackValidationReportOwner().record(tx,input,candidate,async evidence=>{
    const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(evidence))]);
    await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
    await admit(tx,structuredClone(evidence));
  }));
}
