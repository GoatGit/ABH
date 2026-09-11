import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {claimPackInspectionLease,renewPackInspectionLease,releasePackInspectionLease,requirePackInspectionLease} from '../src/extensions/inspection-leases.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionLeases(f:Awaited<ReturnType<typeof createDatabaseFixture>>,context:VerifiedContext,pack:InstalledPackRecord,grant:EntityRef){
 const firstWorker=randomUUID(),secondWorker=randomUUID(),grants=[grant];
 const claim=(worker=firstWorker)=>claimPackInspectionLease(f.database,context,options(),pack,grants,worker);
 const first=await claim();assert.deepEqual(first.targetRef,pack.packRef);assert.equal(first.fencingToken,1);
 assert.deepEqual(await claim(),first);
 await assert.rejects(claim(secondWorker),{code:'PRECONDITION_FAILED'});
 await assert.rejects(claimPackInspectionLease(f.database,context,options(),pack,[],firstWorker),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(claimPackInspectionLease(f.database,context,options(),{...pack,deploymentVersion:pack.deploymentVersion+1},grants,firstWorker),{code:'VERSION_CONFLICT'});
 const human=deriveVerifiedContext({...context.request,actor:{type:'Human',id:context.tenant.actor.id}});
 await assert.rejects(claimPackInspectionLease(f.database,human,options(),pack,grants,firstWorker),{code:'FORBIDDEN'});
 await f.database.transaction(context,options(),tx=>requirePackInspectionLease(tx,options(),pack,grants,first));
 const renewed=await renewPackInspectionLease(f.database,context,options(),pack,grants,first);
 assert.equal(renewed.fencingToken,first.fencingToken);assert.equal(renewed.leaseRef.version,first.leaseRef.version+1);
 await assert.rejects(releasePackInspectionLease(f.database,context,options(),pack,grants,first),{code:'VERSION_CONFLICT'});
 // A refreshed Ref version is not required for fencing checks: the token is the
 // current ownership epoch, while renewal/release themselves retain CAS versions.
 await f.database.transaction(context,options(),tx=>requirePackInspectionLease(tx,options(),pack,grants,first));
 await releasePackInspectionLease(f.database,context,options(),pack,grants,renewed);
 const second=await claim(secondWorker);assert.equal(second.leaseRef.id,first.leaseRef.id);assert.equal(second.fencingToken,first.fencingToken+1);
 await assert.rejects(f.database.transaction(context,options(),tx=>requirePackInspectionLease(tx,options(),pack,grants,first)),{code:'PRECONDITION_FAILED'});
 await assert.rejects(releasePackInspectionLease(f.database,context,options(),pack,grants,first),{code:'PRECONDITION_FAILED'});
 await releasePackInspectionLease(f.database,context,options(),pack,grants,second);
}
