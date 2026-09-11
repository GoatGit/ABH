import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
const step={ref:'migration.sql',digest:`sha256:${'a'.repeat(64)}`,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
test('migration step contracts reject invalid bounds, missing evidence and destructive phase contradictions',()=>{
 assert.equal(validateContract('PackMigrationStep',step).success,true);
 for(const patch of [{schemas:[]},{schemas:['hello_domain','hello_domain']},{schemas:['A']},{databaseRole:'a'.repeat(64)},
  {operations:[]},{operations:['Create','Create']},{reviewRef:undefined},{transactional:'true'},{unknown:true},{operations:['Drop']},{phase:'Contract'}])
  assert.equal(validateContract('PackMigrationStep',{...step,...patch}).success,false);
 assert.equal(validateContract('PackMigrationStep',{...step,phase:'Contract',operations:['Drop'],retirementRef:ref,transactional:false}).success,true);
});
test('schema ownership shape is closed and identifiers cannot contain SQL syntax',()=>{
 const value={packId:'org.example.hello',schemaName:'hello_domain',databaseRole:'hello_migrator'};
 assert.equal(validateContract('PackSchemaOwnership',value).success,true);
 for(const patch of [{schemaName:'hello;DROP SCHEMA control'},{databaseRole:'"hello"'},{packId:'bad name'},{extra:true}])
  assert.equal(validateContract('PackSchemaOwnership',{...value,...patch}).success,false);
});
test('migration evidence binds an outcome to environment and complete step with bounded supporting refs',()=>{
 const digest='sha256:'+'a'.repeat(64);
 const record={organizationId:ref.id,packageDigest:digest,stepDigest:digest,environmentDigest:digest,deploymentVersion:1,kind:'DryRun',status:'Passed',issuedAt:'2026-09-08T00:00:00Z',expiresAt:'2026-09-09T00:00:00Z',supportingRefs:[ref]};
 assert.equal(validateContract('PackMigrationEvidence',record).success,true);
 for(const patch of [{kind:'Unknown'},{supportingRefs:[]},{supportingRefs:[ref,ref]},{deploymentVersion:0},{expiresAt:record.issuedAt},{extra:true}])assert.equal(validateContract('PackMigrationEvidence',{...record,...patch}).success,false);
});
test('migration claims bind exact Pack versions; execution observations cannot claim verification or retry',()=>{
 const attemptRef={...ref,type:'abh.pack-migration-attempt'};
 const digest=step.digest;
 const record={attemptRef,organizationId:ref.id,packId:'org.example.hello',packVersion:'1.0.0',packageDigest:digest,step,stepDigest:digest,environmentDigest:digest,deploymentVersion:1,impactRef:ref,evidenceRefs:[ref],claimedAt:'2026-09-08T00:00:00Z'};
 assert.equal(validateContract('PackMigrationAttemptRecord',record).success,true);
 for(const patch of [{packVersion:'^1.0.0'},{packId:'bad name'},{evidenceRefs:[]},{evidenceRefs:[ref,ref]},{attemptRef:{...attemptRef,version:2}},{mayExecute:true}])assert.equal(validateContract('PackMigrationAttemptRecord',{...record,...patch}).success,false);
 const observation={observationRef:{...ref,type:'abh.pack-migration-observation'},attemptRef,kind:'OutcomeUnknown',evidenceRef:ref,observedAt:record.claimedAt};
 assert.equal(validateContract('PackMigrationObservationRecord',observation).success,true);
 assert.equal(validateContract('PackMigrationObservationRecord',{...observation,kind:'CommitAcknowledged'}).success,true);
 for(const patch of [{kind:'Verified'},{kind:'RetryAllowed'},{enabled:true},{evidenceRef:undefined}])assert.equal(validateContract('PackMigrationObservationRecord',{...observation,...patch}).success,false);
});
test('execution records distinguish raw acknowledgement from verification and preserve microsecond ordering',()=>{
 const attempt={attemptRef:{...ref,type:'abh.pack-migration-attempt'},organizationId:ref.id,packId:'org.example.hello',packVersion:'1.0.0',packageDigest:step.digest,step,stepDigest:step.digest,environmentDigest:step.digest,deploymentVersion:1,impactRef:ref,evidenceRefs:[ref],claimedAt:'2026-09-08T00:00:00.000002Z'};
 const result={kind:'CommitAcknowledged',sqlStarted:true,connectionClosed:true};
 const record={attempt,result,observedAt:attempt.claimedAt};
 assert.equal(validateContract('PackMigrationExecutionRecord',record).success,true);
 assert.equal(validateContract('PackMigrationExecutionRecord',{...record,observedAt:'2026-09-08T00:00:00.000001Z'}).success,false);
 for(const patch of [{kind:'Verified'},{sqlStarted:false},{connectionClosed:'true'},{retryAllowed:true}]){
  assert.equal(validateContract('PackMigrationExecutionResult',{...result,...patch}).success,false);
  assert.equal(validateContract('PackMigrationExecutionRecord',{...record,result:{...result,...patch}}).success,false);
 }
 assert.equal(validateContract('PackMigrationExecutionRecord',{...record,result:{kind:'OutcomeUnknown',sqlStarted:false,connectionClosed:false}}).success,true);
 assert.equal(validateContract('PackMigrationExecutionRecord',{...record,result:{...result,connectionClosed:false}}).success,true);
 assert.equal(validateContract('PackMigrationExecutionRecord',{...record,attempt:{...attempt,step:{...step,operations:['Drop']}}}).success,false);
});
