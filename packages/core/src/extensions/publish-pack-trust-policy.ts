import type {Digest,EntityRef,PublishPackTrustPolicyCommand,SignedTrustPolicyDocument} from '@abh/contracts';
import {canonicalJson,digestBytes,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import {verifiedTrustPolicyEvidence,type VerifiedTrustPolicy} from './verify-trust-policy.ts';

export interface PackTrustPublicationEvidence {
  document:SignedTrustPolicyDocument;
  keyDigest:Digest;
  verifiedAt:string;
}
export interface PackTrustPublicationAdmission {
  fenceRefs(tx:TenantTransaction,evidence:PackTrustPublicationEvidence):Promise<EntityRef[]>;
  /** Recheck current management signer authority, revocation, references and retention under locks, including replay. */
  current(tx:TenantTransaction,evidence:PackTrustPublicationEvidence):Promise<void>;
}

/** Atomic signed policy publication, audit, event and receipt; current admission always precedes replay. */
export async function publishPackTrustPolicy(database:Database,context:VerifiedContext,options:TransactionOptions,
  command:PublishPackTrustPolicyCommand,candidate:VerifiedTrustPolicy,grantRefs:readonly EntityRef[],checks:PackTrustPublicationAdmission):Promise<EntityRef>{
  requireVerifiedContext(context);
  const input=contract('PublishPackTrustPolicyCommand',JSON.parse(canonicalJson(command)));
  const proof=verifiedTrustPolicyEvidence(candidate),evidence={document:proof.document,keyDigest:proof.keyDigest,verifiedAt:proof.verifiedAt};
  const grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks),c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||
    input.target.id!==c.resourceOrganizationId||proof.document.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  if(input.payload.documentDigest!==await digestBytes(new TextEncoder().encode(canonicalJson(proof.document)))||
    input.payload.signerKeyDigest!==proof.keyDigest||proof.document.snapshot.policyRef.version!==input.payload.expectedVersion+1)throw new CoreError('INVALID_ARGUMENT');
  const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,options,async tx=>{
    const owner=new PackTrustPolicyOwner();
    const result=await executeCommand(tx,identity,async()=>{
      const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(evidence))]);
      await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
      await admit(tx,structuredClone(evidence));
    },async()=>{
      await owner.publish(tx,candidate,input.payload.expectedVersion,async()=>{tx.assertActive();});
      const ref=proof.document.snapshot.policyRef;
      await appendChange(tx,{command:identity,target:ref,eventType:'abh.pack.trust-policy-published',changedFields:['snapshotDigest','signerKeyDigest']});
      return ref;
    });
    if(canonicalJson(result.receipt.resultRef)!==canonicalJson(proof.document.snapshot.policyRef))throw new CoreError('INTERNAL_ERROR');
    return result.receipt.resultRef;
  });
}
