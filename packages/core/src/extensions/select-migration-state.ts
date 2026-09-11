import type {EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {discoverMigrationState,type MigrationStateDiscoveryAdmission,type MigrationStateDiscoveryBinding} from './discover-migration-state.ts';
export type MigrationStateSelection=
 |{status:'Missing'}
 |{status:'Ambiguous'}
 |{status:'Incomplete'}
 |{status:'Selected';artifactRef:EntityRef};
/** Select a recovery hint only from a complete bounded scan. A partial scan with
 * zero or one matching observation cannot establish absence or uniqueness. More
 * than one matching observation is already ambiguous even if further rows exist.
 * This is not a durable claim: later recovery must reread current evidence/state.
 */
export async function selectMigrationState(database:Database,context:VerifiedContext,options:TransactionOptions,binding:MigrationStateDiscoveryBinding,
 grants:readonly EntityRef[],checks:MigrationStateDiscoveryAdmission,maxScanned=20):Promise<MigrationStateSelection>{
 const page=await discoverMigrationState(database,context,options,binding,grants,checks,maxScanned);
 if(page.candidates.length>1)return {status:'Ambiguous'};
 if(page.next!==undefined)return {status:'Incomplete'};
 if(!page.candidates.length)return {status:'Missing'};
 return {status:'Selected',artifactRef:structuredClone(page.candidates[0]!.artifactRef)};
}
