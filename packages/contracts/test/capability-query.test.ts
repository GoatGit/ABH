import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
test('capability query is bounded, distinguishes exact identity from ranges, and cannot carry execution authority',()=>{
 const query={kind:'abh.tool',capabilityId:'org.example.tool',version:'1.0.0',limit:25};
 assert.equal(validateContract('QueryPackCapabilitiesQuery',query).success,true);
 for(const patch of [{versionRange:'^1.0.0'},{kind:'Tool'},{limit:0},{limit:101},{assignmentRef:{}},{version:'latest'}])assert.equal(validateContract('QueryPackCapabilitiesQuery',{...query,...patch}).success,false);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{kind:query.kind,version:'1.0.0',limit:25}).success,false);
 assert.equal(validateContract('QueryPackCapabilitiesQuery',{kind:query.kind,versionRange:'^1.0.0',limit:25}).success,true);
 assert.equal(validateContract('PackCapabilityQueryResult',{candidates:[],complete:true}).success,true);
 assert.equal(validateContract('PackCapabilityAvailability',{visible:true,compatible:true,healthy:'unknown'}).success,false);
});
