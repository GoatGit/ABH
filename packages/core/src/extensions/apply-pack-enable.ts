import {assertCurrentGrants} from '../control/grants.ts';
import {verifyPackEnableApproval} from '../human/approval-proof.ts';
import type {EnablePackPayload,EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {preparePackEnableCommit,type PackEnableCommitAdmission} from './prepare-pack-enable-commit.ts';

/** Initial transition only, inside the caller's command UoW. Reconstructs current
 * approval/evidence itself; a caller-supplied prospective record is never a permit.
 * The caller must use executeCommand for Receipt/rollback and separately admit replay. */
export async function applyPackEnable(tx:TenantTransaction,options:TransactionOptions,command:CommandIdentity,input:EnablePackPayload,root:string,
 grants:{enable:readonly EntityRef[];impact:readonly EntityRef[];stage:readonly EntityRef[]},admission:PackEnableCommitAdmission):Promise<InstalledPackRecord>{
 const identity=structuredClone(command),authority=structuredClone(grants);
 if(identity.type!=='abh.packs.enable')throw new CoreError('INVALID_ARGUMENT');
 const transition=await preparePackEnableCommit(tx,options,input,root,authority,admission),owner=new InstalledPackOwner(),revisions=new PackDeploymentRevisionOwner();
 if(await revisions.current(tx)!==transition.proposal.expectedDeploymentVersion)throw new CoreError('VERSION_CONFLICT');
 const previous=await owner.retainCurrent(tx,transition.previousPackRef);
 if(previous.status!=='Staged')throw new CoreError('PRECONDITION_FAILED');
 const enabled=contract('InstalledPackRecord',{...previous,packRef:transition.enabledPackRef,status:'Enabled',deploymentVersion:transition.deploymentVersion,enablement:transition});
 // No host callbacks follow final admission. SQL uses database time so expiry
 // during persistence cannot create an Enabled row after approval expiration.
 const c=tx.context.tenant;
 const rows=await tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=${enabled.packRef.version},status='Enabled',
  deployment_version=${enabled.deploymentVersion},record=${JSON.stringify(enabled)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
  WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.packRef.id} AND version=${previous.packRef.version}
   AND status='Staged' AND record=${JSON.stringify(previous)}::text::jsonb AND clock_timestamp()<${transition.proposal.expiresAt}::timestamptz
  RETURNING id`;
 if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
 const saved=await owner.retainCurrent(tx,enabled.packRef);
 if(canonicalJson(saved)!==canonicalJson(enabled))throw new CoreError('PRECONDITION_FAILED');
 const revision=await revisions.advance(tx,transition.proposal.expectedDeploymentVersion,enabled.packRef);
 await appendChange(tx,{command:identity,target:enabled.packRef,eventType:'abh.pack.enabled',changedFields:['status','deploymentVersion','enablement'],
  relatedRefs:[previous.packRef,transition.approvalRef,transition.proposal.capabilitySetRef,transition.proposal.ctkRef,transition.proposal.migrationVerificationRef,revision.revisionRef]});
 await verifyPackEnableApproval(tx,transition.approvalRef,transition.proposal);
 const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:identity.type},authority.enable);
 tx.assertActive();return saved;
}
