import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {CapabilityRef,DispatchPermitRecord,OperationReconciliationRecord,
  OperationRecord,ResourceFenceRecord} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import {inspectOperationReadiness} from '../src/diagnostics.ts';
import {createDatabaseFixture} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const digest='sha256:'+'a'.repeat(64);
const connector={kind:'Connector',id:'doctor.connector',version:'1.0.0',digest} as const;
const observedAt=new Date(Date.now()-60_000).toISOString();

test('operation doctor reports recovery facts without touching providers', {timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const organizationId=randomUUID(),workspaceId=randomUUID(),actorId=randomUUID();
  const actionRef=ref('abh.action'),planRef=ref('abh.operation-plan'),operationRef=ref('abh.operation');
  const nodeKey='create.remote',idempotencyKey='doctor-provider-key';
  const operation:OperationRecord={operationRef,resourceOrganizationId:organizationId,
    actionRef,planRef,nodeKey,providerIdempotencyKey:idempotencyKey,
    position:{lifecycle:'Dispatching',outcome:'Pending'},attemptCount:1};
  const permit:DispatchPermitRecord={permitRef:ref('abh.dispatch-permit'),resourceOrganizationId:organizationId,
    actionRef,operationRef,attemptRef:ref('abh.attempt'),ordinal:1,snapshotRef:ref('abh.authorization-snapshot'),
    workerId:actorId,leaseRef:ref('abh.work-lease'),leaseFencingToken:1,
    resourceFenceRef:ref('abh.resource-fence'),resourceFencingToken:1,connectorRef:connector,
    payloadRef:ref('abh.artifact'),payloadDigest:digest,providerIdempotencyKey:idempotencyKey,
    policyEvaluationRefs:[ref('abh.policy-evaluation'),ref('abh.policy-evaluation')],dependencyRefs:[],
    issuedAt:new Date(Date.now()-1_000).toISOString(),expiresAt:new Date(Date.now()+4_000).toISOString(),digest};
  const fence:ResourceFenceRecord={fenceRef:ref('abh.resource-fence'),resourceOrganizationId:organizationId,
    connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),resourceKey:'account.primary',
    fencingToken:1,unresolvedOperationRef:operationRef};
  const purposes=['abh.operation.reconcile'];
  await f.admin`INSERT INTO execution.operations
    (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,
    action_id,plan_id,node_key,lifecycle,outcome)
    VALUES (${organizationId},${operationRef.id},${actorId},${actorId},${workspaceId},${purposes},
    ${JSON.stringify(operation)}::text::jsonb,${actionRef.id},${planRef.id},${nodeKey},'Dispatching','Pending')`;
  await f.admin`INSERT INTO execution.dispatch_permits
    (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,
    action_id,operation_id,attempt_id,ordinal,expires_at)
    VALUES (${organizationId},${permit.permitRef.id},${actorId},${actorId},${workspaceId},${purposes},
    ${JSON.stringify(permit)}::text::jsonb,${actionRef.id},${operationRef.id},${permit.attemptRef.id},1,
    ${permit.expiresAt}::timestamptz)`;
  await f.admin`INSERT INTO execution.attempts
    (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,operation_id,permit_id,ordinal)
    VALUES (${organizationId},${permit.attemptRef.id},${actorId},${actorId},${workspaceId},${purposes},
    ${JSON.stringify({attemptRef:permit.attemptRef,resourceOrganizationId:organizationId,operationRef,
    ordinal:1,permitRef:permit.permitRef,providerIdempotencyKey:idempotencyKey,createdAt:permit.issuedAt})}::text::jsonb,
    ${operationRef.id},${permit.permitRef.id},1)`;
  await f.admin`INSERT INTO execution.resource_fences
    (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,connection_id,
    account_type,account_id,resource_key,fencing_token,unresolved_operation_id)
    VALUES (${organizationId},${fence.fenceRef.id},${actorId},${actorId},${workspaceId},${purposes},
    ${JSON.stringify(fence)}::text::jsonb,${fence.connectionRef.id},${fence.accountRef.type},${fence.accountRef.id},
    ${fence.resourceKey},${fence.fencingToken},${operationRef.id})`;
  const invoke=async(overrides:Partial<{operationId:string;organizationId:string;workspaceId:string;timeoutMs:number}>={})=>
    inspectOperationReadiness({connectionString:f.runtimeUrl,signal:new AbortController().signal,
      organizationId:overrides.organizationId??organizationId,
      operationId:overrides.operationId??operationRef.id,
      workspaceId:overrides.workspaceId===undefined?workspaceId:overrides.workspaceId,
      timeoutMs:overrides.timeoutMs??10_000});

  await t.test('invalid arguments never query the database',async()=>{
    for(const overrides of [{organizationId:'no-uuid'},{operationId:'no-uuid'},{timeoutMs:99}]){
      const result=await invoke(overrides);assert.equal(result.status,'Failed');
      assert.equal(result.errorCode,'INVALID_ARGUMENT');assert.deepEqual(result.operations,[]);
      assert.equal(validateContract('CliDoctorOperationResult',result).success,true);
    }
  });
  await t.test('unknown operation has no invented facts',async()=>{
    const result=await invoke({operationId:randomUUID()});
    assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
    assert.deepEqual(result.operations,[]);assert.equal(result.violationCount,1);
  });
  await t.test('pending protected dispatch is safe to resume',async()=>{
    const result=await invoke();
    assert.deepEqual(result.operations[0]!.stopReasons,[]);assert.equal(result.operations[0]!.safeRetry,true);
    assert.equal(result.operations[0]!.remainingResponsibility,true);
    assert.equal(result.operations[0]!.permitRef?.id,permit.permitRef.id);
  });
  await t.test('unknown without receipt retains bounded recovery reasons',async()=>{
    const unknown:OperationRecord={...operation,operationRef:{...operationRef,version:2},
      position:{lifecycle:'Observing',outcome:'Unknown'}};
    await f.admin`UPDATE execution.operations SET record=${JSON.stringify(unknown)}::text::jsonb,
      version=2,lifecycle='Observing',outcome='Unknown' WHERE id=${operationRef.id}`;
    const result=await invoke();
    assert.deepEqual(result.operations[0]!.stopReasons,['RECEIPT_MISSING','RECONCILIATION_MISSING',
      'UNKNOWN_OUTCOME_RETAINED']);assert.equal(result.violationCount,3);
    assert.equal(result.operations[0]!.remainingResponsibility,true);assert.equal(result.operations[0]!.safeRetry,false);
    assert.equal(result.operations[0]!.resourceFenceRef?.id,fence.fenceRef.id);
  });
  await t.test('closed operation reports its final reconciliation verdict',async()=>{
    const reconciliation:OperationReconciliationRecord={reconciliationRef:ref('abh.reconciliation'),
      resourceOrganizationId:organizationId,operationRef:{...operationRef,version:3},
      permitRef:permit.permitRef,
      observationRefs:[ref('hello.observation')],comparisonRuleRef:ref('hello.rule'),verdict:'ConfirmedSuccess',
      reason:'complete visible match',recordedAt:observedAt,receiptRefs:[ref('hello.receipt')],
      confirmedExternal:{externalId:'remote-1',sourceVersion:'1'},planRef,payloadDigest:digest,digest};
    const closed:OperationRecord={...operation,operationRef:{...operationRef,version:3},
      position:{lifecycle:'Closed',outcome:'Succeeded'},reconciliationRef:reconciliation.reconciliationRef};
    await f.admin`INSERT INTO execution.reconciliations
      (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,operation_id)
      VALUES (${organizationId},${reconciliation.reconciliationRef.id},${actorId},${actorId},${workspaceId},${purposes},
      ${JSON.stringify(reconciliation)}::text::jsonb,${operationRef.id})`;
    await f.admin`UPDATE execution.operations SET record=${JSON.stringify(closed)}::text::jsonb,
      version=3,lifecycle='Closed',outcome='Succeeded' WHERE id=${operationRef.id}`;
    await f.admin`UPDATE execution.resource_fences SET unresolved_operation_id=NULL
      WHERE id=${fence.fenceRef.id}`;
    const result=await invoke();
    assert.equal(result.status,'Passed');assert.deepEqual(result.operations[0]!.stopReasons,[]);
    assert.equal(result.operations[0]!.reconciliationVerdict,'ConfirmedSuccess');
    assert.equal(result.operations[0]!.remainingResponsibility,false);
    assert.equal(validateContract('CliDoctorOperationResult',result).success,true);
  });
});
