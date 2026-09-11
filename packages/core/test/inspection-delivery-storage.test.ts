import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {digestContract} from '@abh/contracts/digest';
import {context,options,createDatabaseFixture} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackInspectionDeliveryOwner} from '../src/extensions/inspection-deliveries.ts';
import {DatabaseReadinessError} from '../src/data/readiness.ts';
test('inspection acceptance storage is immutable, tenant scoped and requires a committed Inbox for discovery',{timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const seed=context(),c=deriveVerifiedContext({...seed.request,purposeOfUse:'abh.pack.manage',actor:{...seed.request.actor,type:'Service'}}),org=c.tenant.resourceOrganizationId;
 const ref=(type:string)=>({type,id:randomUUID(),version:1});
 const unsigned={deliveryRef:ref('abh.pack-inspection-delivery'),resourceOrganizationId:org,jobRef:ref('abh.pack-inspection-job'),eventRef:ref('abh.event'),eventDigest:'sha256:'+'a'.repeat(64),sourceCommandRef:ref('abh.command'),acceptedAt:new Date().toISOString(),digest:'sha256:'+'0'.repeat(64)};
 const record={...unsigned,digest:await digestContract('PackInspectionDeliveryRecord',unsigned)};
 // Direct storage fixture cannot stand in for an actual Inbox acceptance.
 await f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`INSERT INTO extension.inspection_deliveries(resource_organization_id,id,purpose_names,job_id,job_version,event_id,record)
  VALUES (${org},${record.deliveryRef.id},${['abh.pack.manage','abh.runtime.deliver']},${record.jobRef.id},1,${record.eventRef.id},${JSON.stringify(record)}::text::jsonb)`);
 assert.equal(await f.database.transaction(c,options(),tx=>new PackInspectionDeliveryOwner().findAccepted(tx,record.jobRef,async()=>{})),undefined);
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`UPDATE extension.inspection_deliveries SET record=record`),{code:'42501'});
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`DELETE FROM extension.inspection_deliveries`),{code:'42501'});
 await assert.rejects(f.admin`UPDATE extension.inspection_deliveries SET record=record-'jobRef' WHERE id=${record.deliveryRef.id}`,{code:'23514'});
 await assert.rejects(f.admin`UPDATE extension.inspection_deliveries SET job_version=2 WHERE id=${record.deliveryRef.id}`,{code:'23514'});
 const foreignSeed=context(),foreign=deriveVerifiedContext({...foreignSeed.request,purposeOfUse:'abh.pack.manage',actor:{...foreignSeed.request.actor,type:'Service'}});
 const rows=await f.database.transaction(foreign,options(),tx=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_deliveries`);assert.equal(rows.length,0);
 await assert.rejects(f.database.transaction(foreign,options(),tx=>tx.owner('PackLoader')`INSERT INTO extension.inspection_deliveries(resource_organization_id,id,purpose_names,job_id,job_version,event_id,record)
  VALUES (${org},${randomUUID()},${['abh.pack.manage']},${record.jobRef.id},1,${record.eventRef.id},${JSON.stringify(record)}::text::jsonb)`));
 await f.admin`ALTER TABLE extension.inspection_deliveries DROP CONSTRAINT inspection_delivery_job_version_key`;
 await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('lookup-index:extension.inspection_delivery_job_version_key'));
 await f.admin`ALTER TABLE extension.inspection_deliveries ADD CONSTRAINT inspection_delivery_job_version_key UNIQUE(resource_organization_id,job_id,job_version)`;
 await f.database.verify();
});
