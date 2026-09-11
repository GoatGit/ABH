import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {PublishPackTrustPolicyCommand} from '../src/index.ts';

test('policy publication binds signed document, signer and expected version in command intent',async()=>{
 const command:PublishPackTrustPolicyCommand={commandId:'11111111-1111-4111-8111-111111111111',type:'abh.packs.publish-trust-policy',schemaVersion:'0.1.0',idempotencyKey:'publish-policy',
  target:{type:'abh.organization',id:'22222222-2222-4222-8222-222222222222'},payload:{documentDigest:`sha256:${'a'.repeat(64)}`,signerKeyDigest:`sha256:${'b'.repeat(64)}`,expectedVersion:0}};
 assert.equal(validateContract('PublishPackTrustPolicyCommand',command).success,true);
 for(const payload of [{...command.payload,expectedVersion:-1},{...command.payload,expectedVersion:1.5},{...command.payload,documentDigest:'invalid'},{...command.payload,signerKeyDigest:undefined},{...command.payload,extra:true}])
  assert.equal(validateContract('PublishPackTrustPolicyCommand',{...command,payload}).success,false);
 const digest=await digestCommandIntent(command);
 assert.equal(await digestCommandIntent({...command,commandId:'33333333-3333-4333-8333-333333333333'}),digest);
 for(const payload of [{...command.payload,expectedVersion:1},{...command.payload,documentDigest:command.payload.signerKeyDigest},{...command.payload,signerKeyDigest:command.payload.documentDigest}])
  assert.notEqual(await digestCommandIntent({...command,payload}),digest);
});
