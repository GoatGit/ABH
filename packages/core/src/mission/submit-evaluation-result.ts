import type {EntityRef,EvaluationResultRecord,SubmitEvaluationResultCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function submitEvaluationResult(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:SubmitEvaluationResultCommand,grants:readonly EntityRef[]):Promise<EvaluationResultRecord>{
 requireVerifiedContext(context);
 const input=contract('SubmitEvaluationResultCommand',structuredClone(supplied)),refs=structuredClone([...grants]);
 if(input.type!=='abh.learning.submit-evaluation-result'||input.target.type!=='abh.evaluation-run'
   ||input.target.id!==input.payload.runRef.id
   ||input.expectedVersion!==input.payload.runRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
   digest:await digestCommandIntent(input)},owner=new LearningOwner();
 const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
  const organization={type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1};
  await lockFences(tx,[organization,...refs]);
  await assertCurrentGrants(tx,{objectRef:input.payload.runRef,scopeRefs:[organization],
    action:'abh.learning.submit-evaluation-result'},refs);
  await new InlineArtifactOwner().lockSources(tx,input.payload.artifactRefs);
 },async()=>(await owner.submitEvaluationResult(tx,command,input.payload)).resultRef));
 const resultRef={type:'abh.evaluation-result' as const,id:result.receipt.resultRef.id,
   version:result.receipt.resultRef.version};
 return database.transaction(context,options,async tx=>await owner.getEvaluationResult(tx,resultRef));
}
