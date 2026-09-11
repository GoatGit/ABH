import type {EnablePackPayload,EntityRef,PackEnableRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {approvalFenceRefs,verifyPackEnableApproval} from '../human/approval-proof.ts';
import {preparePackEnableProposal,type PackEnableProposalAdmission} from './prepare-pack-enable-proposal.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';

export interface PackEnableCommitAdmission {
 proposal:PackEnableProposalAdmission;
 /** Declare compatibility/dependency/runtime installation fences before Pack locks. */
 fenceRefs(tx:TenantTransaction,payload:EnablePackPayload):Promise<EntityRef[]>;
 /** Current dependency resolution, deployment mode, isolation and capability availability checks.
  * This executes before final evidence/approval rereads, never after final authorization. */
 installation(tx:TenantTransaction,payload:EnablePackPayload):Promise<void>;
}
/** Assemble a prospective Enable transition in the caller's command UoW.
 * All authority and evidence locks remain held. The result is data, not a permit:
 * the lifecycle Owner must still atomically CAS state, register capabilities, retain
 * history, advance deployment and append Journal before commit. No write occurs here. */
export async function preparePackEnableCommit(tx:TenantTransaction,options:TransactionOptions,input:EnablePackPayload,root:string,
 grants:{enable:readonly EntityRef[];impact:readonly EntityRef[];stage:readonly EntityRef[]},admission:PackEnableCommitAdmission):Promise<PackEnableRecord>{
 const payload=contract('EnablePackPayload',structuredClone(input)),authority=structuredClone(grants),work=migrationWorkOptions(tx,options),c=tx.context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||payload.proposal.resourceOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const p=admission.proposal,m=p.migration,i=m.impact,ct=p.conformance,cp=ct.pack;
 const fences=admission.fenceRefs.bind(admission),installation=admission.installation.bind(admission),impact=p.impact.bind(p),mf=i.fenceRefs.bind(i),mc=i.current.bind(i);
 const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.enable'},authority.enable);
 const checks:PackEnableProposalAdmission={
  capabilityFenceRefs:p.capabilityFenceRefs.bind(p),capabilities:p.capabilities.bind(p),
  conformance:{pack:{fenceRefs:cp.fenceRefs.bind(cp),current:cp.current.bind(cp)},references:ct.references.bind(ct),read:ct.read.bind(ct)},
  impact:async(inner,proposal)=>{
   await impact(inner,proposal);assertMigrationWorkActive(tx,work);
   await installation(tx,structuredClone(payload));assertMigrationWorkActive(tx,work);
  },
  migration:{references:m.references.bind(m),read:m.read.bind(m),impact:{signer:i.signer.bind(i),source:i.source.bind(i),
   fenceRefs:async(...args)=>[...authority.enable,...await mf(...args),...await approvalFenceRefs(tx,payload.approvalRef),...await fences(tx,structuredClone(payload))],
   current:async(...args)=>{await authorize();await mc(...args);},
  }},
 };
 const actual=await preparePackEnableProposal(tx,work,payload.proposal,root,authority,checks);
 if(canonicalJson(actual)!==canonicalJson(payload.proposal))throw new CoreError('VERSION_CONFLICT');
 await verifyPackEnableApproval(tx,payload.approvalRef,actual);
 await authorize();assertMigrationWorkActive(tx,work);
 const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
 if(Date.parse(actual.expiresAt)<=clock!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
 return contract('PackEnableRecord',{proposal:actual,approvalRef:payload.approvalRef,previousPackRef:actual.packRef,
  enabledPackRef:{...actual.packRef,version:actual.packRef.version+1},deploymentVersion:actual.expectedDeploymentVersion+1,enabledAt:clock!.now.toISOString()});
}
