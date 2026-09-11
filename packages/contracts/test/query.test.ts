import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
import {createContractCatalog,validateRegisteredTarget} from '../src/catalog.ts';
import {protocolRegistry} from '../src/http.ts';
const ref=(type:string)=>({type,id:'00000000-0000-4000-8000-000000000001',version:1});
const digest='sha256:'+'0'.repeat(64);
test('query exit binds independent authority, real remote key and charged reservation evidence',async()=>{
  const exit={exitRef:ref('abh.query-exit'),resourceOrganizationId:ref('abh.organization').id,operationRef:ref('abh.operation'),actionRef:ref('abh.action'),queryAuthorityRef:ref('abh.execution-authority'),authorityDigest:digest,
    queryPolicyRef:ref('abh.artifact'),connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),connectorRef:{kind:'Connector',id:'hello.connector',version:'0.1.0',digest},providerIdempotencyKey:'remote-key',payloadDigest:digest,
    leaseRef:ref('abh.work-lease'),workerId:ref('abh.principal').id,leaseFencingToken:1,reservationRefs:[ref('abh.reservation')],claimedAt:'2026-09-08T01:00:00.000Z',expiresAt:'2026-09-08T01:00:05.000Z',digest};
  assert.equal(validateContract('QueryExitRecord',exit).success,true);
  const compatible={...exit,queryConnectorRef:{...exit.connectorRef,version:'0.2.0'},compatibilityEvidenceRef:ref('abh.artifact'),compatibilityEvidenceDigest:digest};
  assert.equal(validateContract('QueryExitRecord',compatible).success,true);
  for(const changed of [{queryConnectorRef:exit.connectorRef},{compatibilityEvidenceRef:undefined},{compatibilityEvidenceDigest:undefined},{queryConnectorRef:undefined}])assert.equal(validateContract('QueryExitRecord',{...compatible,...changed}).success,false);
  assert.notEqual(await digestContract('QueryExitRecord',compatible),await digestContract('QueryExitRecord',{...compatible,compatibilityEvidenceDigest:'sha256:'+'1'.repeat(64)}));

  for(const changed of [{reservationRefs:[]},{reservationRefs:[ref('abh.reservation'),ref('abh.reservation')]},{expiresAt:exit.claimedAt},{queryAuthorityRef:ref('abh.grant')},{url:'https://caller.example'},{leaseFencingToken:0}])assert.equal(validateContract('QueryExitRecord',{...exit,...changed}).success,false);
  for(const changed of [{providerIdempotencyKey:'other-key'},{queryAuthorityRef:{...exit.queryAuthorityRef,version:2}},{reservationRefs:[{...ref('abh.reservation'),version:2}]}])assert.notEqual(await digestContract('QueryExitRecord',exit),await digestContract('QueryExitRecord',{...exit,...changed}));
});
test('query capture cannot invent a receipt for failed transport or discard unsupported raw evidence',()=>{
  const capture={captureRef:ref('abh.query-capture'),resourceOrganizationId:ref('abh.organization').id,operationRef:ref('abh.operation'),exitRef:ref('abh.query-exit'),transportStatus:'TransportFailed',normalization:'NotApplicable',observedAt:'2026-09-08T01:00:00.000Z',digest};
  assert.equal(validateContract('QueryCaptureRecord',capture).success,true);
  assert.equal(validateContract('QueryCaptureRecord',{...capture,receiptRef:ref('abh.operation-receipt')}).success,false);
  assert.equal(validateContract('QueryCaptureRecord',{...capture,transportStatus:'Responded',normalization:'Unsupported'}).success,false);
  const unsupported={...capture,transportStatus:'Responded',normalization:'Unsupported',rawArtifactRef:ref('abh.artifact')};
  assert.equal(validateContract('QueryCaptureRecord',unsupported).success,true);
  assert.equal(validateContract('QueryCaptureRecord',{...unsupported,normalization:'Normalized'}).success,false);
  assert.equal(validateContract('QueryCaptureRecord',{...unsupported,normalization:'Normalized',receiptRef:ref('abh.operation-receipt')}).success,true);
});

test('compatible query evidence closes its fields and binds two distinct Connectors',()=>{
 const originalConnectorRef={kind:'Connector',id:'hello.connector',version:'1.0.0',digest};
 const proof={kind:'CompatibleQueryEvidence',operationRef:ref('abh.operation'),originalConnectorRef,queryConnectorRef:{...originalConnectorRef,version:'2.0.0'},connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),expiresAt:'2026-09-09T01:00:00Z'};
 assert.equal(validateContract('CompatibleQueryEvidence',proof).success,true);
 for(const patch of [{queryConnectorRef:originalConnectorRef},{queryConnectorRef:{...proof.queryConnectorRef,kind:'Tool'}},{operationRef:ref('abh.action')},{connectionRef:ref('abh.artifact')},{expiresAt:'invalid'},{url:'https://caller.example'},{approved:true}])assert.equal(validateContract('CompatibleQueryEvidence',{...proof,...patch}).success,false,JSON.stringify(patch));
 for(const key of Object.keys(proof)){const changed={...proof};delete changed[key as keyof typeof changed];assert.equal(validateContract('CompatibleQueryEvidence',changed).success,false,key);}
});

test('compatible evidence publication requires exact reviewed proof and independent reconcile permission',()=>{
 const originalConnectorRef={kind:'Connector',id:'hello.connector',version:'1.0.0',digest};
 const evidence={kind:'CompatibleQueryEvidence',operationRef:ref('abh.operation'),originalConnectorRef,queryConnectorRef:{...originalConnectorRef,version:'2.0.0'},connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),expiresAt:'2026-09-09T01:00:00Z'};
 const payload={evidence,reviewRef:ref('abh.artifact'),retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('abh.organization')}};
 const command={type:'abh.operations.record-compatible-query-evidence',schemaVersion:'0.1.0',commandId:ref('abh.command').id,idempotencyKey:'compatible-review',target:{type:'abh.organization',id:ref('abh.organization').id},payload};
 assert.equal(validateContract('RecordCompatibleQueryEvidenceCommand',command).success,true);
 for(const patch of [{reviewRef:undefined},{reviewRef:ref('abh.decision')},{approved:true},{evidence:{...evidence,queryConnectorRef:originalConnectorRef}},{retention:{...payload.retention,url:'https://caller.example'}}])assert.equal(validateContract('RecordCompatibleQueryEvidenceCommand',{...command,payload:{...payload,...patch}}).success,false);
 assert.equal(protocolRegistry.commands.find(item=>item.type===command.type)!.visibility,'Internal');
 const catalog=createContractCatalog();assert.ok(catalog.success);if(!catalog.success)return;
 const scope=ref('abh.organization'),target={objectRef:scope,scopeRefs:[scope],action:command.type};
 assert.equal(validateRegisteredTarget(catalog.data,target,'abh.operation.reconcile').success,true);
 for(const purpose of ['abh.pack.manage','abh.action.prepare','abh.action.execute'])assert.equal(validateRegisteredTarget(catalog.data,target,purpose).success,false);
});
