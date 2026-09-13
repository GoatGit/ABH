import type {EntityRef,EvaluationRunRecord,ExpireEvaluationRunCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function expireEvaluation(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ExpireEvaluationRunCommand,grants:readonly EntityRef[]):Promise<EvaluationRunRecord>{
  requireVerifiedContext(context);
  const input=contract('ExpireEvaluationRunCommand',structuredClone(supplied)),refs=structuredClone([...grants]);
  if(input.type!=='abh.learning.expire-evaluation'||input.target.type!=='abh.evaluation-run'
    ||input.target.id!==input.payload.runRef.id
    ||input.expectedVersion!==input.payload.runRef.version)throw new CoreError('INVALID_ARGUMENT');
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await digestCommandIntent(input)},owner=new LearningOwner();
  const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
    const organization={type:'abh.organization' as const,id:tx.context.tenant.resourceOrganizationId,version:1};
    await lockFences(tx,[organization,...refs]);
    await assertCurrentGrants(tx,{objectRef:input.payload.runRef,scopeRefs:[organization],
      action:'abh.learning.expire-evaluation'},refs);
  },async()=>(await owner.expireEvaluationRun(tx,command,input.payload)).runRef));
  const runRef={type:'abh.evaluation-run' as const,id:result.receipt.resultRef.id,version:result.receipt.resultRef.version};
  return await database.transaction(context,options,tx=>owner.getEvaluationRun(tx,runRef));
}
