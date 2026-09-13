import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
test('capability query is bounded, distinguishes exact identity from ranges, and cannot carry execution authority',()=>{
 const query={kind:'abh.tool',capabilityId:'org.example.tool',version:'1.0.0',limit:25};
 assert.equal(validateContract('QueryPackCapabilitiesQuery',query).success,true);
 for(const patch of [{versionRange:'^1.0.0'},{kind:'Tool'},{limit:0},{limit:101},{assignmentRef:{}},{version:'latest'}])assert.equal(validateContract('QueryPackCapabilitiesQuery',{...query,...patch}).success,false);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{kind:query.kind,version:'1.0.0',limit:25}).success,false);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{kind:query.kind,versionRange:'^1.0.0',limit:25}).success,true);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{...query,safetyStop:true}).success,true);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{...query,safetyStop:'true'}).success,false);
 assert.equal(validateContract('PackCapabilityQueryResult',{candidates:[],complete:true}).success,true);
 assert.equal(validateContract('PackCapabilityAvailability',{visible:true,compatible:true,healthy:'unknown'}).success,false);
});
test('safety stop discovery is bounded and cannot invent responsibility',()=>{
 const candidate={fenceRef:{type:'abh.resource-fence',id:'0f0e0d0c-0b0a-4928-8276-4d4d4d4d4d4d',version:1},
  connectionRef:{type:'abh.connection',id:'0f0e0d0c-0b0a-4928-8276-4d4d4d4d4d40',version:1},
  accountRef:{type:'abh.account',id:'0f0e0d0c-0b0a-4928-8276-4d4d4d4d4d41',version:1},
  resourceKey:'org.example.resource',fencingToken:1,
  unresolvedOperationRef:{type:'abh.operation',id:'0f0e0d0c-0b0a-4928-8276-4d4d4d4d4d42',version:1}};
 assert.equal(validateContract('SafetyStopCandidate',candidate).success,true);
 assert.equal(validateContract('SafetyStopCandidate',{...candidate,unresolvedOperationRef:undefined}).success,false);
 assert.equal(validateContract('ListSafetyStopsQuery',{limit:0}).success,false);
 assert.equal(validateContract('ListSafetyStopsQuery',{limit:100}).success,true);
 assert.equal(validateContract('SafetyStopListResult',{candidates:[candidate],complete:true,asOf:'2026-09-13T00:00:00Z'}).success,true);
});
