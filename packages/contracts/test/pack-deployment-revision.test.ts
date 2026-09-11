import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const id='11111111-1111-4111-8111-111111111111';
const record={revisionRef:{type:'abh.pack-deployment-revision',id,version:1},resourceOrganizationId:id,deploymentVersion:2,previousDeploymentVersion:1,targetRef:{type:'abh.installed-pack',id,version:2},recordedAt:'2026-09-09T00:00:00Z'};
test('deployment revisions advance once and remain immutable across Pack transitions',()=>{
 assert.equal(validateContract('PackDeploymentRevisionRecord',record).success,true);
 assert.equal(validateContract('PackDeploymentRevisionRecord',{...record,deploymentVersion:1,previousDeploymentVersion:0}).success,true);
 for(const change of [{deploymentVersion:3},{previousDeploymentVersion:2},{revisionRef:{...record.revisionRef,version:2}},{targetRef:{...record.targetRef,type:'abh.action'}},{previousDeploymentVersion:-1}])assert.equal(validateContract('PackDeploymentRevisionRecord',{...record,...change}).success,false);
});
