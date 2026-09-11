import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const id='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222',digest='sha256:'+'a'.repeat(64),other='sha256:'+'b'.repeat(64);
const ref=(type:string)=>({type,id,version:1});
const proposal={action:'EnablePack',resourceOrganizationId:id,packRef:ref('abh.installed-pack'),subjectDigest:digest,expectedDeploymentVersion:1,environmentDigest:digest,validationRef:ref('abh.pack-validation'),governanceRef:ref('abh.pack-trust-policy'),governanceDigest:digest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:ref('abh.pack-capability-set'),capabilitySetDigest:digest,impactUpperBound:{scopeRefs:[ref('abh.organization')],resourceRequirements:[],maxMoney:[],description:'Enable the exact installed Pack'},expiresAt:'2026-09-09T00:01:00Z',proposalDigest:digest};
test('Pack Enable proposal fixes exact evidence and organization without granting approval',()=>{
 assert.equal(validateContract('PackEnableProposal',proposal).success,true);
 for(const patch of [{capabilitySetRef:{...ref('abh.pack-capability-set'),version:2}},{capabilitySetRef:ref('abh.artifact')},{capabilitySetDigest:'invalid'},{action:'SuspendPack'},{packRef:ref('abh.action')},{validationRef:ref('abh.artifact')},{ctkRef:ref('abh.pack-validation')},{impactRef:ref('abh.artifact')},{migrationVerificationRef:ref('abh.pack-inspection-job')},{expectedDeploymentVersion:0},{approvalRef:ref('abh.decision')},{expiresAt:'invalid'},
  {impactUpperBound:{...proposal.impactUpperBound,scopeRefs:[{...ref('abh.organization'),id:otherId}]}},
 ])assert.equal(validateContract('PackEnableProposal',{...proposal,...patch}).success,false,JSON.stringify(patch));
 for(const field of Object.keys(proposal)){const value={...proposal};delete value[field as keyof typeof value];assert.equal(validateContract('PackEnableProposal',value).success,false,field);}
});
test('Pack Enable approval digest binds every semantic input and excludes only its own digest',async()=>{
 const initial=await digestContract('PackEnableProposal',proposal);
 assert.equal(await digestContract('PackEnableProposal',{...proposal,proposalDigest:other}),initial);
 for(const patch of [
  {packRef:{...proposal.packRef,version:2}},{subjectDigest:other},{expectedDeploymentVersion:2},{environmentDigest:other},
  ...(['validationRef','governanceRef','ctkRef','impactRef','migrationVerificationRef','capabilitySetRef'] as const).map(key=>({[key]:{...proposal[key],id:otherId}})),
  {capabilitySetDigest:other},{governanceDigest:other},{expiresAt:'2026-09-09T00:02:00Z'},{impactUpperBound:{...proposal.impactUpperBound,description:'Changed installation impact'}},
  {resourceOrganizationId:otherId,impactUpperBound:{...proposal.impactUpperBound,scopeRefs:[{...ref('abh.organization'),id:otherId}]}},
 ])assert.notEqual(await digestContract('PackEnableProposal',{...proposal,...patch}),initial,JSON.stringify(patch));
});
