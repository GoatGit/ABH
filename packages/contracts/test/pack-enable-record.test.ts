import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {createContractCatalog,validateRegisteredTarget} from '../src/catalog.ts';
import {protocolRegistry} from '../src/http.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',digest='sha256:'+'a'.repeat(64);
const ref=(type:string,version=1)=>({type,id,version});
const proposal={action:'EnablePack',resourceOrganizationId:id,packRef:ref('abh.installed-pack'),subjectDigest:digest,expectedDeploymentVersion:4,environmentDigest:digest,validationRef:ref('abh.pack-validation'),governanceRef:ref('abh.pack-trust-policy'),governanceDigest:digest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:ref('abh.pack-capability-set'),capabilitySetDigest:digest,impactUpperBound:{scopeRefs:[ref('abh.organization')],resourceRequirements:[],maxMoney:[],description:'Enable Pack'},expiresAt:'2026-09-09T00:01:00Z',proposalDigest:digest};
const payload={proposal,approvalRef:ref('abh.request-completion-evidence')};
const record={...payload,previousPackRef:proposal.packRef,enabledPackRef:ref('abh.installed-pack',2),deploymentVersion:5,enabledAt:'2026-09-09T00:00:59.999999Z'};
test('Enable transition binds approval and advances Pack and deployment independently exactly once',()=>{
 assert.equal(validateContract('PackEnableRecord',record).success,true);
 for(const patch of [{enabledPackRef:ref('abh.installed-pack',3)},{enabledPackRef:{...record.enabledPackRef,id:other}},{previousPackRef:ref('abh.installed-pack',2)},{deploymentVersion:4},{deploymentVersion:6},{enabledAt:proposal.expiresAt},{approvalRef:ref('abh.decision')},{status:'Enabled'}])assert.equal(validateContract('PackEnableRecord',{...record,...patch}).success,false,JSON.stringify(patch));
 for(const key of Object.keys(record)){const changed={...record};delete changed[key as keyof typeof changed];assert.equal(validateContract('PackEnableRecord',changed).success,false,key);}
});
test('Enable command is internal and requires a dedicated management action',()=>{
 const command={type:'abh.packs.enable',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'enable-fixture',target:{type:'abh.organization',id},payload};
 assert.equal(validateContract('EnablePackCommand',command).success,true);
 assert.equal(validateContract('EnablePackCommand',{...command,payload:{...payload,approved:true}}).success,false);
 assert.equal(protocolRegistry.commands.find(c=>c.type===command.type)!.visibility,'Internal');
 const catalog=createContractCatalog();assert.equal(catalog.success,true);if(!catalog.success)return;
 const scope=ref('abh.organization'),target={objectRef:scope,scopeRefs:[scope],action:command.type};
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.pack.manage').success,true);
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.action.prepare').success,false);
});

test('Suspend command fixes the prior version, explicit emergency policy and evidence',()=>{
 const payload={packRef:ref('abh.installed-pack',2),expectedDeploymentVersion:5,reason:'Stop new calls',emergency:true,evidenceRefs:[ref('abh.artifact')]};
 const command={type:'abh.packs.suspend',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'suspend-fixture',target:{type:'abh.organization',id},payload};
 assert.equal(validateContract('SuspendPackCommand',command).success,true);
 for(const patch of [{evidenceRefs:[]},{expectedDeploymentVersion:0},{emergency:'true'},{packRef:ref('abh.action')}])assert.equal(validateContract('SuspendPackCommand',{...command,payload:{...payload,...patch}}).success,false);
 assert.equal(protocolRegistry.commands.find(c=>c.type===command.type)!.visibility,'Internal');
 const catalog=createContractCatalog();assert.ok(catalog.success);if(!catalog.success)return;
 assert.equal(validateRegisteredTarget(catalog.data,{objectRef:ref('abh.organization'),scopeRefs:[ref('abh.organization')],action:command.type},'abh.pack.manage').success,true);
});

test('Retire requires exact suspended version, reference review and elapsed rollback window',()=>{
 const payload={packRef:ref('abh.installed-pack',3),expectedDeploymentVersion:6,reason:'Retain history and end installation lifecycle',evidenceRefs:[ref('abh.artifact')],referenceReviewRef:ref('abh.artifact'),rollbackWindowEndsAt:'2026-09-09T00:01:00Z'};
 const command={type:'abh.packs.retire',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'retire-fixture',target:{type:'abh.organization',id},payload};
 assert.equal(validateContract('RetirePackCommand',command).success,true);
 for(const patch of [{packRef:ref('abh.installed-pack',2)},{referenceReviewRef:ref('abh.action')},{rollbackWindowEndsAt:'invalid'},{evidenceRefs:[]},{emergency:true}])assert.equal(validateContract('RetirePackPayload',{...payload,...patch}).success,false,JSON.stringify(patch));
 for(const key of ['referenceReviewRef','rollbackWindowEndsAt']){const changed={...payload};delete changed[key as keyof typeof changed];assert.equal(validateContract('RetirePackCommand',{...command,payload:changed}).success,false);}
 const record={...payload,retiredPackRef:ref('abh.installed-pack',4),deploymentVersion:7,retiredAt:payload.rollbackWindowEndsAt};
 assert.equal(validateContract('PackRetirementRecord',record).success,true);
 for(const patch of [{retiredPackRef:ref('abh.installed-pack',3)},{retiredPackRef:{...ref('abh.installed-pack',4),id:other}},{deploymentVersion:8},{retiredAt:'2026-09-09T00:00:59.999999Z'}])assert.equal(validateContract('PackRetirementRecord',{...record,...patch}).success,false,JSON.stringify(patch));
 assert.equal(protocolRegistry.commands.find(c=>c.type===command.type)!.visibility,'Internal');
 const catalog=createContractCatalog();assert.ok(catalog.success);if(!catalog.success)return;
 const target={objectRef:ref('abh.organization'),scopeRefs:[ref('abh.organization')],action:command.type};
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.pack.manage').success,true);
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.action.prepare').success,false);
});
