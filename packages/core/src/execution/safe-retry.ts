import type {AttemptObservationRecord,DispatchPermitRecord,EntityRef,IssueDispatchPermitPayload,OperationPlanNode,OperationRecord} from '@abh/contracts';
import type {Database,TransactionOptions,TenantTransaction} from '../data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {DispatchAuthorizationResolver,type DispatchSourceChecks} from '../control/dispatch.ts';
import {DispatchOwner} from './dispatch.ts';
import {OperationOwner} from './operations.ts';
import {readPermit} from './dispatch-facts.ts';

export interface SafeRetryChecks {
  /** Current independent execution admission; it never replaces snapshot, policy, grant or resource-fence checks. */
  admit(tx:TenantTransaction,operation:OperationRecord,permit:DispatchPermitRecord):Promise<void>;
  /** Installed capability safety policy: bounded attempts, deterministic transport failure and monotonic payload identity. */
  verifyRetrySafety(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode,
    permit:DispatchPermitRecord,observation:AttemptObservationRecord):Promise<void>;
}

const maxAttempts=3;

/** Explicit safe retry: the failed Attempt stays immutable and the same Provider idempotency key gets one re-authorized Permit. */
export async function safeRetryDispatch(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:CommandIdentity,operationRef:EntityRef,input:{expectedPermitRef:EntityRef;permit:IssueDispatchPermitPayload},
  resolver:DispatchAuthorizationResolver,checks:DispatchSourceChecks,grantRefs:readonly EntityRef[],
  retryChecks:SafeRetryChecks):Promise<DispatchPermitRecord>{
  const operation=structuredClone(operationRef),request=structuredClone(input),grants=structuredClone([...grantRefs]);
  const command=structuredClone(supplied);
  if(command.type!=='abh.operations.safe-retry'||command.digest!==await inputDigest(
    {operationRef:operation,expectedPermitRef:request.expectedPermitRef,permit:request.permit}))throw new CoreError('INVALID_ARGUMENT');
  const scope={type:'abh.organization' as const,id:context.tenant.resourceOrganizationId,version:1 as const};
  await database.transaction(context,options,tx=>assertCurrentGrants(tx,{objectRef:operation,scopeRefs:[scope],action:'abh.operations.safe-retry'},grants));
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{
    const operations=new OperationOwner(),current=await operations.get(tx,operation.id),plan=await operations.getPlan(tx,current.actionRef.id);
    const node=plan?.nodes.find(candidate=>candidate.nodeKey===current.nodeKey);
    if(!sameExpected(current.operationRef,operation)||!plan||!node||current.position.lifecycle!=='Dispatching'
      ||current.position.outcome!=='Pending'||current.attemptCount<1||current.attemptCount>=maxAttempts)
      throw new CoreError('PRECONDITION_FAILED');
    if(!sameExpected(request.expectedPermitRef,{type:'abh.dispatch-permit',id:request.expectedPermitRef.id,version:request.expectedPermitRef.version}))
      throw new CoreError('INVALID_ARGUMENT');
    const prior=await readPermit(tx,request.expectedPermitRef);
    if(prior.operationRef.id!==operation.id||prior.ordinal!==current.attemptCount||prior.ordinal<1
      ||!sameExpected(prior.snapshotRef,request.permit.snapshotRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    const observations=await new DispatchOwner().observations(tx,prior.attemptRef),last=observations.at(-1);
    if(!last||last.status!=='TransportFailed')throw new CoreError('PRECONDITION_FAILED');
    await retryChecks.admit(tx,current,prior);
    await retryChecks.verifyRetrySafety(tx,current,node,prior,last);
  },async()=>{
    return await new DispatchOwner().issue(tx,command,operation,request.permit,async authorizedTx=>{
      const authorization=await resolver.authorizeExit(authorizedTx,command,request.expectedPermitRef,checks);
      await assertCurrentGrants(authorizedTx,{objectRef:operation,scopeRefs:[scope],action:'abh.operations.safe-retry'},grants,{lock:false});
      return authorization;
    },{retry:true}).then(permit=>permit.permitRef);
  }));
  return database.transaction(context,options,tx=>new DispatchOwner().getPermit(tx,result.receipt.resultRef));
}

function sameExpected<T extends {type:string;id:string;version:number}>(actual:T,expected:T):boolean{
  return actual.type===expected.type&&actual.id===expected.id&&actual.version===expected.version;
}
