export interface MissionProjectionSummary{
  missionId:string;
  missionVersion:number;
  status:string;
  goalRevision:number;
  pendingTriggerCount:number;
  blockerCount:number;
  updatedAt:string;
}

function isFiniteNonNegativeInteger(value:unknown):value is number{
  return typeof value==='number'&&Number.isInteger(value)&&value>=0
    &&Number.isFinite(value);
}

function isProjectionText(value:unknown,maxLength:number):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=maxLength;
}

export function readMissionProjectionSummary(data:unknown,missionId:string):
  MissionProjectionSummary|null{
  if(!data||typeof data!=='object')return null;
  const candidate=data as Record<string,unknown>;
  const missionRef=candidate.missionRef as Record<string,unknown>|undefined;
  if(!missionRef||missionRef.type!=='abh.mission'||missionRef.id!==missionId
    ||!isFiniteNonNegativeInteger(missionRef.version)||missionRef.version<1
    ||!isProjectionText(candidate.status,128)
    ||!isFiniteNonNegativeInteger(candidate.goalRevision)||candidate.goalRevision<1
    ||!isFiniteNonNegativeInteger(candidate.pendingTriggerCount)
    ||!isFiniteNonNegativeInteger(candidate.blockerCount)
    ||!isProjectionText(candidate.updatedAt,40)
    ||Number.isNaN(Date.parse(candidate.updatedAt)))return null;
  return {
    missionId,missionVersion:missionRef.version,status:candidate.status,
    goalRevision:candidate.goalRevision,pendingTriggerCount:candidate.pendingTriggerCount,
    blockerCount:candidate.blockerCount,updatedAt:candidate.updatedAt,
  };
}
