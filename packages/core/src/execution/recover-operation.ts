import type {EntityRef,OperationRecord,RecoverOperationPayload} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {OperationController} from './operation-controller.ts';

/** Independent recovery permission on every replay; a new recovery also requires the Controller's current lease and resource fences. */
export async function recoverOperation(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  operationRef:EntityRef,input:RecoverOperationPayload,grantRefs:readonly EntityRef[]):Promise<OperationRecord>{
  contract('OperationRef',operationRef);contract('RecoverOperationPayload',input);
  if(command.type!=='abh.operations.recover'||command.digest!==await inputDigest({operationRef,payload:input}))throw new CoreError('INVALID_ARGUMENT');
  return database.transaction(context,options,async tx=>{
    const operations=new OperationOwner(),admit=async()=>{
      await assertCurrentGrants(tx,{objectRef:operationRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.operations.recover'},grantRefs);
      await operations.get(tx,operationRef.id);
    };
    const result=await executeCommand(tx,command,admit,async()=>(await new OperationController().recoverExpired(tx,command,operationRef,input,{admit})).operationRef);
    if(result.receipt.resultRef.type!=='abh.operation'||result.receipt.resultRef.id!==operationRef.id)throw new CoreError('INTERNAL_ERROR');
    return operations.get(tx,operationRef.id);
  });
}
