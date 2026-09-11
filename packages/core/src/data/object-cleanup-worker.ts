import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {AuthorizedContextRef,EntityRef,StoredObjectRef} from '@abh/contracts';
import type {ObjectStorePort} from '@abh/contracts/ports';
import type {Database,TenantTransaction,TransactionOptions} from './uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {contract,inputDigest,type CommandIdentity} from './journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import type {ObjectStagingCleanupCandidate,ObjectStagingCleanupItem} from './object-artifacts.ts';
import {ObjectArtifactOwner} from './object-artifacts.ts';

export interface ObjectCleanupOptions {
  readonly workerId:string;
  readonly context:ContextSource;
  readonly objectStore:ObjectStorePort;
  readonly authorizedContextRef:AuthorizedContextRef;
  readonly grantRefs:readonly EntityRef[];
  readonly resolveTracking:(trackingRef:EntityRef,options:{readonly signal:AbortSignal;readonly deadline:number})=>
    Promise<StoredObjectRef|undefined>;
  readonly signal:AbortSignal;
  readonly pageSize?:number;
  readonly intervalMs?:number;
  readonly transactionTimeoutMs?:number;
  readonly minimumAgeMs?:number;
  readonly leaseSeconds?:number;
  readonly onPage?:(result:{readonly scanned:number;readonly cleaned:number})=>Promise<void>|void;
}

/** Clean one explicit persisted Tracked ref; Pending puts without a returned ref cannot be safely addressed. */
export async function cleanupAbandonedObjectArtifact(database:Database,context:VerifiedContext,
  options:TransactionOptions,attemptId:string,input:ObjectCleanupOptions):Promise<boolean>{
  contract('UUID',input.workerId);contract('AuthorizedContextRef',input.authorizedContextRef);
  const refs=structuredClone(input.grantRefs),owner=new ObjectArtifactOwner(),leases=new WorkLeaseOwner(),
    c=context.tenant,scope={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
  if(c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('PURPOSE_DENIED');
  const authorize=async(tx:TenantTransaction,objectRef:StoredObjectRef)=>{
    await assertCurrentGrants(tx,{objectRef,scopeRefs:[scope],
      action:'abh.artifacts.delete'},refs);
  };
  let candidate:ObjectStagingCleanupCandidate,lease:{readonly leaseRef:EntityRef;readonly fencingToken:number};
  const command:CommandIdentity={commandId:randomUUID(),type:'abh.artifacts.cleanup',idempotencyKey:randomUUID(),
    digest:await inputDigest({operation:'object-artifact-cleanup'})};
  try{
    ({candidate,lease}=await database.transaction(context,options,async tx=>{
      const staged=await owner.queueCleanup(tx,attemptId);
      await authorize(tx,staged.objectRef);
      const claimed=await leases.claim(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},
        {targetRef:staged.artifactRef,workerId:input.workerId,leaseSeconds:input.leaseSeconds??30},
        async(_,target)=>{if(target.id!==staged.artifactRef.id)throw new CoreError('PRECONDITION_FAILED');});
      return {candidate:staged,lease:{leaseRef:claimed.leaseRef,fencingToken:claimed.fencingToken}};
    }));
  }catch(error){
    if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return false;
    throw error;
  }
  const deadline=Math.min(options.deadline,Date.parse(c.contextExpiresAt)),request={
    context:{deadline:new Date(deadline).toISOString(),callId:randomUUID(),
      requestContextRef:{type:'abh.request-context' as const,id:c.requestId,version:1},
      target:{objectRef:candidate.objectRef,scopeRefs:[scope],action:'abh.artifacts.delete',deadline:new Date(deadline).toISOString()}},
    authorizedContextRef:structuredClone(input.authorizedContextRef),objectRef:candidate.objectRef,
    deletionProofRef:{type:'abh.deletion-proof' as const,id:candidate.proofId,version:1},
    idempotencyKey:candidate.deleteIdempotencyKey};
  try{
    const result=await input.objectStore.delete(request,{signal:options.signal});
    if(result.status!=='Completed')return false;
    const deleted=contract('StoredObjectRef',result.data.objectRef);
    if(deleted.id!==candidate.objectRef.id||deleted.version!==candidate.objectRef.version
      ||deleted.type!==candidate.objectRef.type)return false;
    await database.transaction(context,options,async tx=>{
      await authorize(tx,candidate.objectRef);
      await owner.completeCleanup(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},
        candidate.attemptId,candidate.artifactRef,candidate.objectRef,result.data.receiptRef);
      await leases.requireCurrent(tx,lease.leaseRef,input.workerId,lease.fencingToken,candidate.artifactRef);
    });
    return true;
  }catch(error){
    if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return false;
    throw error;
  }finally{
    try{await database.transaction(context,{...options,deadline:Math.min(Date.now()+1000,deadline)},
      async tx=>leases.release(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},
        lease.leaseRef,input.workerId,lease.fencingToken));
    }catch{}
  }
}

/** Persists the adapter-declared StoredObjectRef only after an explicit tracking lookup; Core never guesses it. */
export async function resolveAbandonedObjectTracking(database:Database,context:VerifiedContext,
  options:TransactionOptions,item:ObjectStagingCleanupItem,input:ObjectCleanupOptions):Promise<boolean>{
  if(item.status!=='Tracked')return false;
  contract('UUID',input.workerId);const refs=structuredClone(input.grantRefs),leases=new WorkLeaseOwner(),
    c=context.tenant,scope={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1},
    command:CommandIdentity={commandId:randomUUID(),type:'abh.artifacts.cleanup.resolve',
      idempotencyKey:randomUUID(),digest:await inputDigest({operation:'object-artifact-resolve'})};
  if(c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('PURPOSE_DENIED');
  const authorize=async(tx:TenantTransaction,objectRef:StoredObjectRef)=>assertCurrentGrants(tx,
    {objectRef,scopeRefs:[scope],action:'abh.artifacts.delete'},refs);
  let lease:{readonly leaseRef:EntityRef;readonly fencingToken:number};
  try{
    ({lease}=await database.transaction(context,options,async tx=>{
      const claimed=await leases.claim(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},
        {targetRef:item.artifactRef,workerId:input.workerId,leaseSeconds:input.leaseSeconds??30},async()=>undefined);
      return {lease:{leaseRef:claimed.leaseRef,fencingToken:claimed.fencingToken}};
    }));
  }catch(error){
    if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return false;
    throw error;
  }
  const deadline=Math.min(options.deadline,Date.parse(c.contextExpiresAt));
  try{
    const objectRef=await boundedCallback(callbackOptions=>input.resolveTracking(item.trackingRef,callbackOptions),
      {deadline,signal:options.signal});
    if(!objectRef)return false;
    const object=contract('StoredObjectRef',objectRef);
    await database.transaction(context,options,async tx=>{
      await authorize(tx,object);
      await new ObjectArtifactOwner().resolveTracking(tx,item.attemptId,object);
      await leases.requireCurrent(tx,lease.leaseRef,input.workerId,lease.fencingToken,item.artifactRef);
    });
    return true;
  }catch(error){
    if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return false;
    throw error;
  }finally{
    try{await database.transaction(context,{...options,deadline:Math.min(Date.now()+1000,deadline)},
      async tx=>leases.release(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},
        lease.leaseRef,input.workerId,lease.fencingToken));
    }catch{}
  }
}

export async function runObjectCleanupWorker(database:Database,input:ObjectCleanupOptions):Promise<void>{
  const pageSize=input.pageSize??100,intervalMs=input.intervalMs??1000,timeout=input.transactionTimeoutMs??10000,
    minimumAgeMs=input.minimumAgeMs??5000;
  contract('UUID',input.workerId);contract('AuthorizedContextRef',input.authorizedContextRef);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(intervalMs)||intervalMs<1||intervalMs>60000
    ||!Number.isInteger(timeout)||timeout<1||timeout>30000||!Number.isSafeInteger(minimumAgeMs)||minimumAgeMs<0
    ||minimumAgeMs>3_600_000||!Number.isInteger(input.leaseSeconds??30)||(input.leaseSeconds??30)<1||(input.leaseSeconds??30)>300)
    throw new CoreError('INVALID_ARGUMENT');
  let cursor:string|undefined,tenantKey:string|undefined;
  const currentContext=async()=>{
    const value=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+timeout,signal:input.signal}),
      c=value.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actor.id,c.actingOrganizationId]);
    if(tenantKey!==undefined&&tenantKey!==key)throw new CoreError('FORBIDDEN');tenantKey=key;return value;
  },options=():TransactionOptions=>({deadline:Date.now()+timeout,signal:input.signal});
  while(!input.signal.aborted){
    try{
      const current=await currentContext(),page=await database.transaction(current,options(),tx=>
        new ObjectArtifactOwner().abandonedStaged(tx,pageSize,cursor,minimumAgeMs));
      let cleaned=0;
      for(const item of page){
        if(input.signal.aborted)break;
        if(item.status==='Tracked'){
          if(await resolveAbandonedObjectTracking(database,await currentContext(),options(),item,input))continue;
        }else if(await cleanupAbandonedObjectArtifact(database,await currentContext(),options(),item.attemptId,input))cleaned++;
      }
      if(input.signal.aborted)return;
      cursor=page.length===pageSize?page.at(-1)!.attemptId:undefined;
      if(input.onPage)await input.onPage({scanned:page.length,cleaned});
      await delay(intervalMs,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
