import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const id='11111111-1111-4111-8111-111111111111',digest='sha256:'+'a'.repeat(64),ref=(type:string)=>({type,id,version:1});
const binding={capability:{kind:'abh.tool',id:'org.example.tool',version:'1.0.0'},schemaPath:'schema/tool.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),permissionEnvelope:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]}};
test('capability build bindings are explicit, closed, exact and permission bounded by later Pack validation',async()=>{
 assert.equal(validateContract('PackCapabilityBinding',binding).success,true);
 for(const patch of [{schemaPath:'../schema.json'},{capability:{...binding.capability,version:'latest'}},{modulePath:'/tmp/code.js'},{permissionEnvelope:{commands:[]}}])assert.equal(validateContract('PackCapabilityBinding',{...binding,...patch}).success,false);
 const record={...binding,packRef:ref('abh.installed-pack'),subjectDigest:digest,schemaDigest:digest,registrationDigest:digest};
 assert.equal(validateContract('PackCapabilityRegistration',record).success,true);
 const initial=await digestContract('PackCapabilityRegistration',record);
 for(const patch of [{healthRef:{...binding.healthRef,version:2}},{schemaPath:'schema/other.json'},{schemaDigest:'sha256:'+'b'.repeat(64)},{permissionEnvelope:{...binding.permissionEnvelope,commands:['org.example.execute']}}])assert.notEqual(await digestContract('PackCapabilityRegistration',{...record,...patch}),initial);
});

test('complete capability sets bind one exact Pack and reject duplicate identities',async()=>{
 const registration={...binding,packRef:ref('abh.installed-pack'),subjectDigest:digest,schemaDigest:digest,registrationDigest:digest};
 const set={setRef:ref('abh.pack-capability-set'),packRef:registration.packRef,registrations:[registration],recordedAt:'2026-09-09T00:00:00Z',setDigest:digest};
 assert.equal(validateContract('PackCapabilitySetRecord',set).success,true);
 assert.equal(validateContract('PackCapabilitySetRecord',{...set,registrations:[]}).success,true);
 for(const patch of [{setRef:{...set.setRef,version:2}},{registrations:[registration,registration]},{registrations:[registration,{...registration,capability:{version:binding.capability.version,id:binding.capability.id,kind:binding.capability.kind}}]},{registrations:[{...registration,packRef:{...registration.packRef,version:2}}]}])assert.equal(validateContract('PackCapabilitySetRecord',{...set,...patch}).success,false);
 const first=await digestContract('PackCapabilitySetRecord',set);assert.notEqual(first,await digestContract('PackCapabilitySetRecord',{...set,registrations:[]}));
 const command={type:'abh.packs.register-capabilities',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'register-fixture',target:{type:'abh.organization',id},payload:{packRef:registration.packRef,bindingsDigest:digest}};
 assert.equal(validateContract('RegisterPackCapabilitiesCommand',command).success,true);
 assert.equal(validateContract('RegisterPackCapabilitiesCommand',{...command,payload:{...command.payload,bindings:[binding]}}).success,false);
});
