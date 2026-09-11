import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const passed={checkId:'data.security-manifest',status:'Passed',errorCode:null,violationCount:0};
test('database doctor contract cannot claim success with errors or invent persisted receipts',()=>{
 assert.equal(validateContract('DatabaseDiagnosticResult',passed).success,true);
 const output={...passed,commandRef:null,evidenceRefs:[],remediation:null};assert.equal(validateContract('CliDoctorDataResult',output).success,true);
 for(const bad of [{...passed,errorCode:'FORBIDDEN'},{...passed,violationCount:1},{...passed,status:'Failed'},{...passed,status:'Failed',errorCode:'PRECONDITION_FAILED'},{...passed,extra:'secret'}])assert.equal(validateContract('DatabaseDiagnosticResult',bad).success,false);
 for(const bad of [{...output,commandRef:{type:'abh.command',id:'11111111-1111-4111-8111-111111111111',version:1}},{...output,evidenceRefs:[{type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1}]},{...output,remediation:'repair'}])assert.equal(validateContract('CliDoctorDataResult',bad).success,false);
});
test('diagnostic failures carry actionable output and distinguish drift from dependency errors',()=>{
 for(const errorCode of ['INVALID_ARGUMENT','FORBIDDEN','PRECONDITION_FAILED','DEPENDENCY_TIMEOUT','DEPENDENCY_UNAVAILABLE']){
  const failure={...passed,status:'Failed',errorCode,violationCount:errorCode==='PRECONDITION_FAILED'?1:0};
  assert.equal(validateContract('DatabaseDiagnosticResult',failure).success,true);
  assert.equal(validateContract('CliDoctorDataResult',{...failure,commandRef:null,evidenceRefs:[],remediation:'Check the deployment.'}).success,true);
  assert.equal(validateContract('CliDoctorDataResult',{...failure,commandRef:null,evidenceRefs:[],remediation:null}).success,false);
 }
 assert.equal(validateContract('DatabaseDiagnosticResult',{...passed,status:'Failed',errorCode:'DEPENDENCY_TIMEOUT',violationCount:1}).success,false);
});
test('projection doctor separates health facts from CLI receipt ownership',()=>{
 const health={checkId:'projection.mission-summary',projectionType:'abh.projection.mission-summary',
  subjectId:'11111111-1111-4111-8111-111111111111',present:true,sourceVersion:3,goalRevision:2,stopEpoch:1,
  stale:false,watermarkEventId:'22222222-2222-4222-8222-222222222222',
  watermarkAt:'2026-09-11T00:00:00Z',latestEventId:'33333333-3333-4333-8333-333333333333',
  latestEventAt:'2026-09-11T00:00:01Z',lagMs:1000,gapCount:0,
  safeRebuildCommand:'abh.projections.refresh-mission-summary'};
 assert.equal(validateContract('ProjectionHealthResult',health).success,true);
 const passed={checkId:health.checkId,projectionType:health.projectionType,subjectId:health.subjectId,
  health,status:'Passed',errorCode:null,violationCount:0,commandRef:null,evidenceRefs:[],remediation:null};
 assert.equal(validateContract('CliDoctorProjectionResult',passed).success,true);
 const failed={...passed,status:'Failed',errorCode:'PRECONDITION_FAILED',violationCount:1,
  remediation:'Query current source, then submit the refresh command.'};
 assert.equal(validateContract('CliDoctorProjectionResult',failed).success,true);
 assert.equal(validateContract('ProjectionHealthResult',{...health,present:'yes'}).success,false);
 assert.equal(validateContract('ProjectionHealthResult',{...health,lagMs:-1}).success,false);
 assert.equal(validateContract('ProjectionHealthResult',{...health,extra:'secret'}).success,false);
 assert.equal(validateContract('CliDoctorProjectionResult',{...passed,errorCode:'PRECONDITION_FAILED',violationCount:0}).success,false);
 assert.equal(validateContract('CliDoctorProjectionResult',{...passed,evidenceRefs:[
   {type:'abh.artifact',id:'44444444-4444-4444-8444-444444444444',version:1}]}).success,false);
});
