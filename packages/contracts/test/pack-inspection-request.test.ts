import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import {protocolRegistry} from '../src/http.ts';
import type {RequestPackInspectionCommand} from '../generated/types.ts';
const id='11111111-1111-4111-8111-111111111111';
const command:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'inspection-1',target:{type:'abh.organization',id},payload:{packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,expiresAt:'2026-09-09T01:00:00Z',maxAttempts:3,maxDurationMs:30000}};
test('inspection request is an internal bounded governance command without caller-selected progress',()=>{
 assert.equal(validateContract('RequestPackInspectionCommand',command).success,true);
 assert.equal(protocolRegistry.commands.find(item=>item.type===command.type)?.visibility,'Internal');
 for(const payload of [{...command.payload,maxAttempts:0},{...command.payload,maxAttempts:1001},{...command.payload,maxDurationMs:86400001},{...command.payload,status:'Succeeded'},{...command.payload,attempts:0},{...command.payload,packRef:{...command.payload.packRef,version:2}}])assert.equal(validateContract('RequestPackInspectionCommand',{...command,payload}).success,false);
});
test('inspection request intent binds exact installation, environment, expiry and budget',async()=>{
 const original=await digestCommandIntent(command);
 assert.equal(await digestCommandIntent({...command,commandId:'21111111-1111-4111-8111-111111111111'}),original);
 for(const payload of [{...command.payload,maxAttempts:4},{...command.payload,maxDurationMs:30001},{...command.payload,environmentDigest:'sha256:'+'c'.repeat(64)},{...command.payload,expiresAt:'2026-09-09T02:00:00Z'},{...command.payload,deploymentVersion:2}])assert.notEqual(await digestCommandIntent({...command,payload}),original);
});
