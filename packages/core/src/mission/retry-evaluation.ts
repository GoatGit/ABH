import type {EntityRef,EvaluationRunRecord,RetryEvaluationCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function retryEvaluation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:RetryEvaluationCommand,grants:readonly EntityRef[]):Promise<EvaluationRunRecord>{
 requireVerifiedContext(context);
 const input=contract('RetryEvaluationCommand',structuredClone(supplied)),refs=structuredClone([...grants]),
   c=context.tenant;
 if(input.type!=='abh.learning.retry-evaluation'||input.target.type!=='abh.organization')throw new CoreError('INVALID_ARGUMENT');
 if(input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
   digest:await digestCommandIntent(input)},owner=new LearningOwner();
 const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[scope,...refs]);
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.learning.retry-evaluation'},refs);
 },async()=>(await owner.retryEvaluation(tx,command,structuredClone(input.payload))).runRef));
 const runRef={type:'abh.evaluation-run' as const,id:result.receipt.resultRef.id,
   version:result.receipt.resultRef.version};
 return database.transaction(context,options,async tx=>await owner.getEvaluationRun(tx,runRef));
}
