import { randomUUID } from 'node:crypto';
import type { CredentialRef, RequestContext } from '@abh/contracts';
import type { IdentityProviderPort } from '@abh/contracts/ports';
import { validatePortResult } from '@abh/contracts/ports';
import { createContractCatalog } from '@abh/contracts/catalog';
import { Database, type TransactionOptions } from '../data/uow.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { deriveVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { currentIdentity } from './owner.ts';

/** Server-fixed IdP configuration. No issuer, audience, identity or epoch is accepted from the body. */
export class IdentityIngress {
  #database: Database;
  #provider: IdentityProviderPort;
  #issuer: string;
  #audience: string;
  constructor(database: Database, provider: IdentityProviderPort, config: {issuer:string;audience:string}) {
    this.#database=database; this.#provider=provider; this.#issuer=config.issuer; this.#audience=config.audience;
  }
  async authenticate(input: {credentialRef:CredentialRef; organizationId:string; purpose:string}, options: TransactionOptions): Promise<VerifiedContext> {
    contract('CredentialRef',input.credentialRef); contract('UUID',input.organizationId); contract('RegisteredName',input.purpose);
    const catalog=createContractCatalog();
    if (!catalog.success || !Object.hasOwn(catalog.data.purposes,input.purpose)) throw new CoreError('PURPOSE_DENIED');
    if (!Number.isFinite(options.deadline) || options.signal.aborted || options.deadline<=Date.now()) throw new CoreError('DEPENDENCY_TIMEOUT');
    const signal=AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,options.deadline-Date.now()))]);
    const request={callId:randomUUID(),credentialRef:input.credentialRef,issuer:this.#issuer,audience:this.#audience,deadline:new Date(options.deadline).toISOString()};
    // Adapter may fail to observe AbortSignal; ingress still enforces its deadline.
    let onAbort=()=>{};
    const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
    let result: Awaited<ReturnType<IdentityProviderPort['verify']>>;
    try {result=await Promise.race([this.#provider.verify(request,{signal}),aborted]);}
    finally {signal.removeEventListener('abort',onAbort);}
    if (!validatePortResult('IdentityProviderPort.verify',result).success || result.status!=='Completed') throw new CoreError('UNAUTHENTICATED');
    const identity=result.data;
    if (identity.issuer!==this.#issuer || identity.audience!==this.#audience || Date.parse(identity.verifiedAt)>Date.now() || Date.parse(identity.expiresAt)<=Date.now()) throw new CoreError('UNAUTHENTICATED');
    const digest=await inputDigest([identity.issuer,identity.subject]);
    const locations=await this.#database.locateIdentity(digest,options);
    const location=locations.find(value=>value.resourceOrganizationId===input.organizationId);
    if (!location) throw new CoreError('FORBIDDEN');
    const requestContext: RequestContext={requestId:randomUUID(),correlationId:randomUUID(),actingOrganizationId:location.resourceOrganizationId,resourceOrganizationId:location.resourceOrganizationId,
      actor:{type:identity.identityKind,id:location.principalRef.id},purposeOfUse:input.purpose,authnStrength:identity.authnStrength,
      sessionEpoch:identity.credentialEpoch,scopeEpoch:0,receivedAt:new Date().toISOString(),
      contextExpiresAt:new Date(Math.min(Date.parse(identity.expiresAt),Date.now()+60_000)).toISOString()};
    // A temporary internal context only reads this authenticated identity's tenant. It is never returned.
    const provisional=deriveVerifiedContext(requestContext);
    const current=await this.#database.transaction(provisional,{...options,readOnly:true},tx=>currentIdentity(tx));
    return deriveVerifiedContext({...requestContext,scopeEpoch:current.scopeEpoch});
  }
}
