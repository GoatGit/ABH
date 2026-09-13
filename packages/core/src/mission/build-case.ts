import type {BuildCaseCommand,EntityRef,LearningCaseRecord} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {LearningOwner} from './learning.ts';

export async function buildCase(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:BuildCaseCommand,grants:readonly EntityRef[]):Promise<LearningCaseRecord>{
 requireVerifiedContext(context);
 const input=contract('BuildCaseCommand',structuredClone(supplied)),refs=structuredClone([...grants]),
   payload=contract('BuildCasePayload',structuredClone(input.payload)),c=context.tenant;
 if(input.type!=='abh.learning.build-case'||input.target.type!=='abh.organization')throw new CoreError('INVALID_ARGUMENT');
 if(input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
   digest:await digestCommandIntent(input)},owner=new LearningOwner();
 const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,async()=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[scope,...refs]);
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.learning.build-case'},refs);
  await new InlineArtifactOwner().lockSources(tx,[...payload.evidenceRefs,...payload.counterEvidenceRefs]);
  for(const ref of [...payload.evidenceRefs,...payload.counterEvidenceRefs])
   await new InlineArtifactOwner().read(tx,ref,async artifact=>{if(artifact.status!=='Available')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');})
     .catch(error=>{if(error instanceof CoreError&&error.code==='RESOURCE_NOT_FOUND')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');throw error;});
 },async()=>(await owner.buildCase(tx,command,payload)).caseRef));
 const caseRef={type:'abh.learning-case' as const,id:result.receipt.resultRef.id,version:result.receipt.resultRef.version};
 return database.transaction(context,options,async tx=>await owner.getCase(tx,caseRef));
}
