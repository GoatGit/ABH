export const organizationCookieNames={
  actingOrganizationId:'wb_acting_organization',
  resourceOrganizationId:'wb_resource_organization',
  workspaceId:'wb_workspace',
} as const;

export interface OrganizationSelectionInput{
  actingOrganizationId?:string;resourceOrganizationId?:string;workspaceId?:string;
}

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value:string|undefined):value is string{
  return typeof value==='string'&&uuidPattern.test(value);
}

export function parseOrganizationSelection(input:OrganizationSelectionInput){
  if(!isUuid(input.actingOrganizationId)||!isUuid(input.resourceOrganizationId))return undefined;
  if(input.workspaceId!==undefined&&!isUuid(input.workspaceId))return undefined;
  return {
    actingOrganizationId:input.actingOrganizationId,resourceOrganizationId:input.resourceOrganizationId,
    ...(input.workspaceId?{workspaceId:input.workspaceId}:{}),
  };
}

export function isOrganizationChoice(choice:{
  key:string;actingOrganizationId:string;resourceOrganizationId:string;workspaceId?:string;
}):boolean{
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(choice.key)&&isUuid(choice.actingOrganizationId)
    &&isUuid(choice.resourceOrganizationId)
    &&(choice.workspaceId===undefined||isUuid(choice.workspaceId));
}
