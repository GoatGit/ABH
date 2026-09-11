import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('Exception binds technical evidence to responsibility without accepting an outcome or unfreeze flag',async()=>{
  const record={exceptionRef:ref('abh.exception'),resourceOrganizationId:randomUUID(),sourceRef:ref('abh.operation'),reportRef:ref('abh.reconciliation'),
    category:'TerminalContradiction',severity:'High',impactUpperBound:{scopeRefs:[ref('abh.organization')],resourceRequirements:[],maxMoney:[],description:'Frozen resource'},
    blockedScopeRefs:[ref('abh.resource-fence')],requiredResponsibilityRefs:[ref('abh.responsibility-assignment')],requestRef:ref('abh.responsibility-request'),
    proposalDigest:'sha256:'+'a'.repeat(64),recordedAt:'2026-09-08T00:00:00Z',digest:'sha256:'+'0'.repeat(64)};
  assert.equal(validateContract('ExceptionRecord',record).success,true);
  for(const extra of [{outcome:'Failed'},{unfreeze:true},{status:'Closed'}])assert.equal(validateContract('ExceptionRecord',{...record,...extra}).success,false);
  assert.notEqual(await digestContract('ExceptionRecord',record),await digestContract('ExceptionRecord',{...record,reportRef:ref('abh.reconciliation')}));
  assert.notEqual(await digestContract('ExceptionRecord',record),await digestContract('ExceptionRecord',{...record,requestRef:ref('abh.responsibility-request')}));
});
