import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {digestPackManifest} from '@abh/contracts/digest';
import type {VerifiedContext} from '../src/internal/context.ts';
import {discoverStagedPacks,type StagedPackDiscoveryAdmission} from '../src/extensions/discover-staged-packs.ts';
import {createDatabaseFixture,options} from './database-fixture.ts';
/** Real StagePack supplies the first row; a second consistent storage fixture tests
 * bounded paging only, never claims to possess admission for executing that pack. */
export async function checkStagedDiscovery(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,packRef:EntityRef,grantRef:EntityRef){
 const checks:StagedPackDiscoveryAdmission={fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true};
 const scan=(limit=1,after?:number,policy=checks,grants=[grantRef])=>discoverStagedPacks(f.database,c,options(),limit,after,grants,policy);
 const initial=await scan();assert.equal(initial.scanned,1);assert.deepEqual(initial.candidates[0]!.packRef,packRef);assert.equal(initial.next,undefined);
 const extraId=randomUUID(),otherOrg=randomUUID(),[stored]=await f.admin`SELECT record FROM extension.installed_packs WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${packRef.id}`;
 const extra=structuredClone(stored!.record) as InstalledPackRecord;
 extra.packRef={type:'abh.installed-pack',id:extraId,version:1};extra.deploymentVersion=2;extra.manifest.metadata.version='1.0.1';
 const {signaturePayload,...digests}=await digestPackManifest(extra.manifest);Object.assign(extra.manifest.integrity,digests);
 await f.admin`INSERT INTO extension.installed_packs(resource_organization_id,id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version,status,created_by,updated_by)
 VALUES (${c.tenant.resourceOrganizationId},${extraId},${['abh.pack.manage']},${JSON.stringify(extra)}::text::jsonb,${extra.manifest.metadata.id},${extra.manifest.metadata.version},${extra.manifest.integrity.packageDigest},2,'Staged',${c.tenant.actor.id},${c.tenant.actor.id})`;
 await f.admin`INSERT INTO extension.installed_packs(resource_organization_id,id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version,status,created_by,updated_by)
 SELECT ${otherOrg},id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version,status,created_by,updated_by FROM extension.installed_packs WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${extraId}`;
 try{
  assert.equal((await scan(100)).candidates.length,2);
  const hidden=await scan(1,undefined,{...checks,canRead:async()=>false});assert.equal(hidden.scanned,1);assert.deepEqual(hidden.candidates,[]);assert.equal(hidden.next,1);
  const next=await scan(1,hidden.next);assert.equal(next.scanned,1);assert.equal(next.candidates[0]!.packRef.id,extraId);assert.equal(next.next,undefined);
  let emptyAdmissions=0;const empty=await scan(1,2,{...checks,admit:async()=>{emptyAdmissions++;}});assert.equal(empty.scanned,0);assert.deepEqual(empty.candidates,[]);assert.equal(emptyAdmissions,2);
  await assert.rejects(scan(1,2,checks,[]),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(scan(0),{code:'INVALID_ARGUMENT'});await assert.rejects(scan(1,Number.MAX_SAFE_INTEGER+1),{code:'INVALID_ARGUMENT'});
  let admissions=0;await assert.rejects(scan(1,undefined,{...checks,admit:async()=>{if(++admissions===2)throw new Error('discovery policy withdrawn');}}),/discovery policy withdrawn/);
  await assert.rejects(scan(1,undefined,{...checks,canRead:async tx=>{await tx.owner('Control')`UPDATE control.grants SET status='Revoked' WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${grantRef.id}`;return true;}}),{code:'AUTHORITY_REQUIRED'});
  assert.equal((await scan()).candidates.length,1);
  const copied=await scan(1,undefined,{...checks,canRead:async(_tx,record)=>{record.manifest.metadata.id='org.changed.pack';return true;}});assert.equal(copied.candidates[0]!.manifest.metadata.id,initial.candidates[0]!.manifest.metadata.id);
 }finally{await f.admin`DELETE FROM extension.installed_packs WHERE resource_organization_id IN (${c.tenant.resourceOrganizationId},${otherOrg}) AND id=${extraId}`;}
}
