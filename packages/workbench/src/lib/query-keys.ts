export type ProjectionSubjectType='abh.mission'|'abh.decision';
export interface QueryIdentity{
  actorId:string;actingOrganizationId:string;resourceOrganizationId:string;
  workspaceId?:string;purposeOfUse:string;authorizationDigest:string;
}

export const missionProjectionFieldSet='status,goalRevision,pendingTriggerCount,blockerCount,updatedAt';

export function projectionQueryKey(identity:QueryIdentity,subjectType:ProjectionSubjectType,
  subjectId:string,fieldSet:string):readonly unknown[]{
    return ['workbench','projection',subjectType,subjectId,identity.actingOrganizationId,
      identity.resourceOrganizationId,identity.workspaceId??null,
    identity.purposeOfUse,identity.authorizationDigest,identity.actorId,fieldSet];
}

export function projectionEventPath(subjectType:ProjectionSubjectType,subjectId:string):string{
  return projectionEventPathWithCursor(subjectType,subjectId,'');
}

export function projectionEventPathWithCursor(subjectType:ProjectionSubjectType,
  subjectId:string,lastEventId:string):string{
  const base=`/api/events/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`;
  if(!lastEventId||lastEventId.length>64)return base;
  return `${base}?lastEventId=${encodeURIComponent(lastEventId)}`;
}

export function decisionQueryKey(identity:QueryIdentity,decisionId:string):readonly unknown[]{
  return ['workbench','decision',decisionId,identity.actingOrganizationId,
    identity.resourceOrganizationId,identity.workspaceId??null,
      identity.purposeOfUse,identity.authorizationDigest,identity.actorId];
}

export function actionQueryKey(identity:QueryIdentity,actionId:string):readonly unknown[]{
  return ['workbench','action',actionId,identity.actingOrganizationId,
    identity.resourceOrganizationId,identity.workspaceId??null,
    identity.purposeOfUse,identity.authorizationDigest,identity.actorId];
}

export interface ActionListFilters{
  missionId?:string;lifecycle?:string;outcome?:string;cursor?:string;
}

export function actionListQueryKey(identity:QueryIdentity,filters:ActionListFilters):
  readonly unknown[]{
    return ['workbench','action-list',filters.missionId??null,filters.lifecycle??null,
      filters.outcome??null,filters.cursor??null,identity.actingOrganizationId,
      identity.resourceOrganizationId,identity.workspaceId??null,
      identity.purposeOfUse,identity.authorizationDigest,identity.actorId];
}

export function overviewMissionsQueryKey(identity:QueryIdentity):readonly unknown[]{
  return ['workbench','overview','missions',identity.actingOrganizationId,
    identity.resourceOrganizationId,identity.workspaceId??null,
    identity.purposeOfUse,identity.authorizationDigest,identity.actorId];
}

export function overviewInboxQueryKey(identity:QueryIdentity):readonly unknown[]{
  return ['workbench','overview','inbox',identity.actingOrganizationId,
    identity.resourceOrganizationId,identity.workspaceId??null,
    identity.purposeOfUse,identity.authorizationDigest,identity.actorId];
}
