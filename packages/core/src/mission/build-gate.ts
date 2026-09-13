import type {EntityRef,EvaluationGateArtifactRecord,BuildGateCommand} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function buildGate(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:BuildGateCommand,grants:readonly EntityRef[]):Promise<EvaluationGateArtifactRecord>{
 requireVerifiedContext(context);
 const input=contract('BuildGateCommand',structuredClone(supplied)),refs=structuredClone([...grants]);
 if(input.type!=='abh.learning.build-gate'||input.target.type!=='abh.learning-candidate'
   ||input.target.id!==input.payload.candidateRef.id
   ||input.expectedVersion!==input.payload.candidateRef.version)throw new CoreError('INVALID_ARGUMENT');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
   digest:await digestCommandIntent(input)},owner=new LearningOwner();
 const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
  const organization={type:'abh.organization' as const,id:tx.context.tenant.resourceOrganizationId,version:1};
  await lockFences(tx,[organization,...refs]);
  await assertCurrentGrants(tx,{objectRef:input.payload.candidateRef,scopeRefs:[organization],action:'abh.learning.build-gate'},refs);
 },async()=>(await owner.buildGate(tx,command,input.payload)).gateRef));
 const gateRef={type:'abh.learning-gate' as const,id:result.receipt.resultRef.id,version:result.receipt.resultRef.version};
 return database.transaction(context,options,async tx=>await owner.getEvaluationGate(tx,gateRef));
}
