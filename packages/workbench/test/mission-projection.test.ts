import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readMissionProjectionSummary} from '../src/lib/mission-projection.ts';

test('mission projection charts accept exact authorized summary shapes only',()=>{
  const missionId='00000000-0000-4000-8000-000000000001';
  const data={
    missionRef:{type:'abh.mission',id:missionId,version:4},
    status:'Active',goalRevision:2,pendingTriggerCount:3,blockerCount:1,
    updatedAt:'2026-09-11T00:00:00.000Z',
  };
  assert.deepEqual(readMissionProjectionSummary(data,missionId),{
    missionId,missionVersion:4,status:'Active',goalRevision:2,
    pendingTriggerCount:3,blockerCount:1,updatedAt:'2026-09-11T00:00:00.000Z',
  });
  assert.equal(readMissionProjectionSummary(data,'00000000-0000-4000-8000-000000000002'),null);
  assert.equal(readMissionProjectionSummary({...data,pendingTriggerCount:1.5},missionId),null);
  assert.equal(readMissionProjectionSummary({...data,status:''},missionId),null);
  assert.equal(readMissionProjectionSummary({...data,updatedAt:'invalid'},missionId),null);
});
