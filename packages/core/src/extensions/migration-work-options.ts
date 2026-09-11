import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
/** A nested migration operation may stop earlier than its containing UoW. Never
 * replace that operation's cancellation with the transaction's longer lifetime. */
export function migrationWorkOptions(tx:TenantTransaction,options:TransactionOptions):TransactionOptions {
 const current={...options,signal:AbortSignal.any([options.signal,tx.signal])};
 assertMigrationWorkActive(tx,current);
 return current;
}
export function assertMigrationWorkActive(tx:TenantTransaction,current:TransactionOptions):void {
 tx.assertActive();
 if(current.signal.aborted||!Number.isSafeInteger(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
}
