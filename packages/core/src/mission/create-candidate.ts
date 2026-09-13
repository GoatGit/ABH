import type {CreateCandidateCommand,EntityRef,LearningCandidateRecord} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function createCandidate(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:CreateCandidateCommand,grants:readonly EntityRef[]):Promise<LearningCandidateRecord>{
 requireVerifiedContext(context);
 const input=contract('CreateCandidateCommand',structuredClone(supplied)),refs=structuredClone([...grants]),
   payload=contract('CreateCandidatePayload',structuredClone(input.payload)),c=context.tenant;
 if(input.type!=='abh.learning.create-candidate'||input.target.type!=='abh.organization')throw new CoreError('INVALID_ARGUMENT');
 if(input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
   digest:await digestCommandIntent(input)},owner=new LearningOwner();
 const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[scope,...refs]);
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.learning.create-candidate'},refs);
  await new InlineArtifactOwner().lockSources(tx,[payload.candidateArtifactRef]);
 },async()=>(await owner.createCandidate(tx,command,payload)).candidateRef));
 const candidateRef={type:'abh.learning-candidate' as const,id:result.receipt.resultRef.id,
   version:result.receipt.resultRef.version};
 return database.transaction(context,options,async tx=>await owner.getCandidate(tx,candidateRef));
}
