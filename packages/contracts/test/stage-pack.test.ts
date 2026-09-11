import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {StagePackCommand} from '../src/index.ts';
const id='11111111-1111-4111-8111-111111111111',digest=`sha256:${'a'.repeat(64)}` as const;
test('StagePack binds persisted validation, durable snapshot and expected deployment version',async()=>{
 const command:StagePackCommand={commandId:id,type:'abh.packs.stage',schemaVersion:'0.1.0',idempotencyKey:'stage-pack',target:{type:'abh.organization',id},
  payload:{validationRef:{type:'abh.pack-validation',id,version:1},snapshot:{id,metadataDigest:digest},expectedDeploymentVersion:0}};
 assert.equal(validateContract('StagePackCommand',command).success,true);
 for(const payload of [{...command.payload,validationRef:{type:'abh.action',id,version:1}},
  {...command.payload,validationRef:{type:'abh.pack-validation',id,version:2}},
  {...command.payload,expectedDeploymentVersion:-1},{...command.payload,expectedDeploymentVersion:0.5},
  {...command.payload,snapshot:{id:'../escape',metadataDigest:digest}},
  {...command.payload,snapshot:{id,metadataDigest:digest,root:'/host/path'}}])assert.equal(validateContract('StagePackCommand',{...command,payload}).success,false);
 const intent=await digestCommandIntent(command);
 for(const payload of [{...command.payload,expectedDeploymentVersion:1},
  {...command.payload,snapshot:{id,metadataDigest:`sha256:${'b'.repeat(64)}` as const}},
  {...command.payload,validationRef:{...command.payload.validationRef,id:'22222222-2222-4222-8222-222222222222'}}])
  assert.notEqual(await digestCommandIntent({...command,payload}),intent);
});
