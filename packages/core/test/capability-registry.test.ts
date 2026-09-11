import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {PackCapabilityBinding} from '@abh/contracts';
import {digestContract,digestPackManifest} from '@abh/contracts/digest';
import {contract,inputDigest,executeCommand} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackCapabilityRegistryOwner} from '../src/extensions/capability-registry.ts';
import {preparePackCapabilities} from '../src/extensions/prepare-pack-capabilities.ts';
import {packManifest} from './pack-fixture.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('capability identity reservations are immutable, tenant-local and detect missing or substituted child records',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),org=c.tenant.resourceOrganizationId,owner=new PackCapabilityRegistryOwner();
 const original=await packManifest(),raw={...original,capabilities:{provides:[{kind:'abh.tool',id:'org.example.hello.tool',version:'1.0.0'}],requires:[]}};
 const {signaturePayload:_,...digests}=await digestPackManifest(raw),pack=contract('PackManifest',{...raw,integrity:{...raw.integrity,...digests}}),packRef=ref('abh.installed-pack');
 const record=contract('InstalledPackRecord',{packRef,manifest:pack,snapshot:{id:randomUUID(),metadataDigest:pack.integrity.packageDigest},validationRef:ref('abh.pack-validation'),reportDigest:pack.integrity.packageDigest,governanceRef:ref('abh.pack-trust-policy'),governanceDigest:pack.integrity.packageDigest,deploymentVersion:1,status:'Staged',stagedAt:new Date().toISOString()});
 // Fixture Stage row; formal command/current signed recovery is exercised by pack-conformance.test.ts.
 await f.admin`INSERT INTO extension.installed_packs(resource_organization_id,id,created_by,updated_by,purpose_names,record,pack_id,pack_version,package_digest,deployment_version) VALUES (${org},${packRef.id},${c.tenant.actor.id},${c.tenant.actor.id},ARRAY['abh.pack.manage'],${JSON.stringify(record)}::text::jsonb,${pack.metadata.id},${pack.metadata.version},${pack.integrity.packageDigest},1)`;
 const binding:PackCapabilityBinding={capability:pack.capabilities.provides[0]!,schemaPath:'input.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),permissionEnvelope:pack.permissions};
 const registrations=await preparePackCapabilities(pack,packRef,[binding],{refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}})},options(),{schema:async(_b,bytes)=>{assert.equal(new TextDecoder().decode(bytes),'abc');},implementation:async()=>{}});
 for(const patch of [{schemaDigest:'sha256:'+'b'.repeat(64)},{permissionEnvelope:{...binding.permissionEnvelope,commands:['org.example.forbidden']}}]){
  const bad={...registrations[0]!,...patch};bad.registrationDigest=await digestContract('PackCapabilityRegistration',bad);
  await assert.rejects(f.database.transaction(c,options(),tx=>owner.register(tx,{type:'abh.packs.register-capabilities',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:bad.registrationDigest},packRef,[bad],async()=>{})));
 }
 const identity={type:'abh.packs.register-capabilities',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(registrations)};
 const register=()=>f.database.transaction(c,options(),tx=>executeCommand(tx,identity,async()=>{},()=>owner.register(tx,identity,packRef,registrations,async()=>{})));
 const initial=await register();assert.equal((await register()).replayed,true);const setRef=initial.receipt.resultRef;
 const read=()=>f.database.transaction(c,options(),tx=>owner.readSet(tx,setRef,async()=>{}));
 const saved=await read();assert.deepEqual(saved.registrations,registrations);
 const changed={...registrations[0]!,healthRef:ref('abh.artifact')};changed.registrationDigest=await digestContract('PackCapabilityRegistration',changed);
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.register(tx,identity,packRef,[changed],async()=>{})),{code:'VERSION_CONFLICT'});
 await f.admin`UPDATE extension.capabilities SET record=${JSON.stringify(changed)}::text::jsonb WHERE pack_id=${packRef.id}`;
 try{await assert.rejects(read(),{code:'PRECONDITION_FAILED'});}finally{await f.admin`UPDATE extension.capabilities SET record=${JSON.stringify(registrations[0])}::text::jsonb WHERE pack_id=${packRef.id}`;}
 await f.admin`UPDATE extension.capabilities SET purpose_names=ARRAY['abh.pack.manage'] WHERE pack_id=${packRef.id}`;
 const [child]=await f.admin`SELECT * FROM extension.capabilities WHERE pack_id=${packRef.id}`;
 await f.admin`DELETE FROM extension.capabilities WHERE pack_id=${packRef.id}`;
 await assert.rejects(read(),{code:'PRECONDITION_FAILED'});
 await f.admin`INSERT INTO extension.capabilities(resource_organization_id,id,pack_id,set_id,kind,capability_id,capability_version,record,created_by,updated_by) VALUES (${org},${child!.id},${packRef.id},${setRef.id},${child!.kind},${child!.capability_id},${child!.capability_version},${JSON.stringify(child!.record)}::text::jsonb,${c.tenant.actor.id},${c.tenant.actor.id})`;
 assert.deepEqual(await read(),saved);
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`INSERT INTO extension.capabilities(resource_organization_id,id,pack_id,set_id,kind,capability_id,capability_version,record) VALUES (${org},${randomUUID()},${packRef.id},${setRef.id},${child!.kind},${child!.capability_id},${child!.capability_version},${JSON.stringify(child!.record)}::text::jsonb)`),{code:'23505'});
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`UPDATE extension.capabilities SET record=record`),{code:'42501'});
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`DELETE FROM extension.capability_sets`),{code:'42501'});
 assert.equal((await f.raw`SELECT id FROM extension.capabilities`).length,0);await f.database.verify();
});
