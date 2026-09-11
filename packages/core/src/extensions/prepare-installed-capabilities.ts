import type {EntityRef,PackCapabilityBinding} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import {recoverStagedPackInTransaction} from './recover-staged-pack.ts';
import type {PackRecordAdmission} from './record-pack-validation.ts';
import {preparePackCapabilities,type PackCapabilityBindingChecks} from './prepare-pack-capabilities.ts';

/** Derive static registrations from actual currently authorized staged content.
 * Callers declare schema/implementation authority fences through pack.fenceRefs.
 * Returned data is not a registry write, execution handle or permission grant. */
export async function prepareInstalledCapabilities(tx:TenantTransaction,options:TransactionOptions,packRef:EntityRef,root:string,
 stageGrants:readonly EntityRef[],bindings:readonly PackCapabilityBinding[],admission:{pack:PackRecordAdmission;capabilities:PackCapabilityBindingChecks}){
 const ref=structuredClone(packRef),grants=structuredClone(stageGrants),input=structuredClone(bindings),work=migrationWorkOptions(tx,options);
 const p=admission.pack,c=admission.capabilities,pack={fenceRefs:p.fenceRefs.bind(p),current:p.current.bind(p)},checks={schema:c.schema.bind(c),implementation:c.implementation.bind(c)};
 const recovered=await recoverStagedPackInTransaction(tx,work,ref,root,grants,pack);
 const registrations=await preparePackCapabilities(recovered.metadata().manifest,ref,input,recovered.files.payload,work,checks);assertMigrationWorkActive(tx,work);
 const latest=await recoverStagedPackInTransaction(tx,work,ref,root,grants,pack);
 if(canonicalJson(latest.metadata())!==canonicalJson(recovered.metadata())||canonicalJson(latest.installation())!==canonicalJson(recovered.installation()))throw new CoreError('VERSION_CONFLICT');
 assertMigrationWorkActive(tx,work);return {installation:latest.installation(),registrations};
}
