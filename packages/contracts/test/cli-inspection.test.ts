import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
const diagnostic={jobRef:{...ref,type:'abh.pack-inspection-job'},status:'Failed',assessedAt:'2026-09-09T00:00:00Z',nextStep:'Terminal',evidenceRefs:[ref],elapsedMs:10,remainingDurationMs:0,remainingAttempts:0};
const reported={commandRef:null,checkId:'pack.inspection-job',status:'Reported',errorCode:null,evidenceRefs:[ref],diagnostic,remediation:'Review the terminal Job.'};
test('CLI diagnostic report preserves existing evidence without inventing a Command or successful Job',()=>{
 assert.equal(validateContract('CliInspectionDiagnosticResult',reported).success,true);
 for(const bad of [{...reported,commandRef:ref},{...reported,diagnostic:null},{...reported,evidenceRefs:[]},{...reported,status:'Passed'},{...reported,errorCode:'FORBIDDEN'},{...reported,secret:'not output'}])assert.equal(validateContract('CliInspectionDiagnosticResult',bad).success,false);
 const failed={...reported,status:'Failed',errorCode:'FORBIDDEN',diagnostic:null,evidenceRefs:[]};assert.equal(validateContract('CliInspectionDiagnosticResult',failed).success,true);
 for(const bad of [{...failed,evidenceRefs:[ref]},{...failed,diagnostic},{...failed,errorCode:null}])assert.equal(validateContract('CliInspectionDiagnosticResult',bad).success,false);
});
