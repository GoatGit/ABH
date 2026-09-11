import type {EntityRef,RequestPackEnableCommand,RequestPackEnablePayload} from '@abh/contracts';
import {canonicalJson,digestContract,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner,type DecisionEligibility} from '../human/decisions.ts';
import {preparePackEnableProposal,type PackEnableProposalAdmission} from './prepare-pack-enable-proposal.ts';
import {assertMigrationWorkActive,migrationWorkOptions} from './migration-work-options.ts';

export interface PackEnableRequestAdmission {
 proposal:PackEnableProposalAdmission;
 eligibility:DecisionEligibility;
 /** Declare all routing/eligibility/policy Control fences before Deployment/Pack locks. */
 fenceRefs(tx:TenantTransaction,input:RequestPackEnablePayload):Promise<EntityRef[]>;
 /** Current governance decides permitted slots, candidates, questions and risk disclosures; also on replay. */
 routing(tx:TenantTransaction,input:RequestPackEnablePayload):Promise<void>;
}
/** Bind every frozen Decision package to the exact proposal before consulting external admission. */
export async function assertPackEnableRequestBinding(input:RequestPackEnablePayload):Promise<void>{
 const {proposal:p,responsibility:{request:r,packages}}=contract('RequestPackEnablePayload',input);
 const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
 const evidence=[p.validationRef,p.governanceRef,p.ctkRef,p.impactRef,p.migrationVerificationRef,p.capabilitySetRef];
 const includes=(refs:EntityRef[])=>evidence.every(ref=>refs.some(actual=>same(ref,actual)));
 if(await digestContract('PackEnableProposal',p)!==p.proposalDigest||r.kind!=='Authorization'||r.resourceOrganizationId!==p.resourceOrganizationId||
  !same(r.subjectRef,p.packRef)||r.proposalDigest!==p.proposalDigest||r.expiresAt!==p.expiresAt||r.status!=='Unresolved'||r.requestRef.version!==1||r.routeRevision!==1||r.decisionRefs.length||
  !includes(r.evidenceRefs)||!r.requiredSlots.some(slot=>slot.required)||r.requiredSlots.some(slot=>slot.responsibleOrganizationId!==p.resourceOrganizationId||slot.required&&slot.responsibilityType!=='Authorization')||
  packages.length!==r.requiredSlots.length||new Set(packages.map(pkg=>pkg.slotId)).size!==packages.length)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
 for(const pkg of packages)if(!same(pkg.requestRef,r.requestRef)||pkg.routeRevision!==1||!same(pkg.subjectRef,p.packRef)||pkg.proposalDigest!==p.proposalDigest||
  !r.requiredSlots.some(slot=>slot.slotId===pkg.slotId)||!same(pkg.impactUpperBound,p.impactUpperBound)||!includes(pkg.evidenceRefs)||Date.parse(pkg.validUntil)>Date.parse(p.expiresAt)||
  !pkg.allowedResponses.includes('Approved')||!pkg.allowedResponses.includes('Rejected')||await digestContract('DecisionPackage',pkg)!==pkg.packageDigest)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
}

/** Formal internal request: independently authorize, reconstruct current evidence,
 * persist Human Gateway frozen routing and one atomic command receipt. No Enable transition. */
export async function requestPackEnable(database:Database,context:VerifiedContext,options:TransactionOptions,input:RequestPackEnableCommand,
 root:string,grants:{request:readonly EntityRef[];impact:readonly EntityRef[];stage:readonly EntityRef[]},admission:PackEnableRequestAdmission){
 requireVerifiedContext(context);
 const command=contract('RequestPackEnableCommand',structuredClone(input)),payload=command.payload,authority=structuredClone(grants),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type)||command.target.id!==c.resourceOrganizationId||payload.proposal.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const fences=admission.fenceRefs.bind(admission),routing=admission.routing.bind(admission),e=admission.eligibility;
 const eligibility={lock:e.lock.bind(e),candidate:e.candidate.bind(e),submit:e.submit.bind(e),revalidate:e.revalidate.bind(e),conditions:e.conditions.bind(e)};
 const original=admission.proposal,om=original.migration,oi=om.impact,oc=original.conformance;
 const p:PackEnableProposalAdmission={capabilityFenceRefs:original.capabilityFenceRefs.bind(original),capabilities:original.capabilities.bind(original),impact:original.impact.bind(original),migration:{references:om.references.bind(om),read:om.read.bind(om),impact:{fenceRefs:oi.fenceRefs.bind(oi),current:oi.current.bind(oi),signer:oi.signer.bind(oi),source:oi.source.bind(oi)}},conformance:{references:oc.references.bind(oc),read:oc.read.bind(oc),pack:{fenceRefs:oc.pack.fenceRefs.bind(oc.pack),current:oc.pack.current.bind(oc.pack)}}};
 const m=p.migration,mi=m.impact,ct=p.conformance,cp=ct.pack;
 const mf=mi.fenceRefs.bind(mi),mc=mi.current.bind(mi);
 await assertPackEnableRequestBinding(payload);
 const identity={commandId:command.commandId,idempotencyKey:command.idempotencyKey,type:command.type,digest:await digestCommandIntent(command)};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},owner=new DecisionOwner();
  const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:command.type},authority.request);
  const checks:PackEnableProposalAdmission={
   capabilityFenceRefs:p.capabilityFenceRefs,capabilities:p.capabilities,
   impact:async(inner,proposal)=>{await p.impact(inner,proposal);assertMigrationWorkActive(tx,work);await routing(tx,structuredClone(payload));assertMigrationWorkActive(tx,work);},conformance:{pack:{fenceRefs:cp.fenceRefs.bind(cp),current:cp.current.bind(cp)},references:ct.references.bind(ct),read:ct.read.bind(ct)},
   migration:{references:m.references.bind(m),read:m.read.bind(m),impact:{signer:mi.signer.bind(mi),source:mi.source.bind(mi),
    fenceRefs:async(...args)=>[...authority.request,...await mf(...args),...await fences(tx,structuredClone(payload))],
    current:async(...args)=>{await authorize();await mc(...args);}}},
  };
  const assess=async()=>{
   const actual=await preparePackEnableProposal(tx,work,payload.proposal,root,authority,checks);
   if(canonicalJson(actual)!==canonicalJson(payload.proposal))throw new CoreError('VERSION_CONFLICT');
   await authorize();assertMigrationWorkActive(tx,work);
  };
  const result=await executeCommand(tx,identity,assess,async()=>{
   const request=await owner.open(tx,identity,structuredClone(payload.responsibility),eligibility);
   return request.requestRef;
  });
  // The receipt remains the original acceptance, even after requests close or routes advance.
  if(result.receipt.resultRef.type!=='abh.responsibility-request'||result.receipt.resultRef.id!==payload.responsibility.request.requestRef.id)throw new CoreError('PRECONDITION_FAILED');
  const [saved]=await tx.owner('HumanGateway')`SELECT record FROM human.routing_proposals WHERE resource_organization_id=${c.resourceOrganizationId}
   AND request_id=${result.receipt.resultRef.id} AND route_revision=1 AND deleted_at IS NULL AND workspace_id IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if(!saved||canonicalJson(contract('OpenResponsibilityRequestPayload',saved.record))!==canonicalJson(payload.responsibility))throw new CoreError('PRECONDITION_FAILED');
  // Eligibility and routing callbacks cannot leave committed requests based on withdrawn evidence.
  await assess();
  return {requestRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
