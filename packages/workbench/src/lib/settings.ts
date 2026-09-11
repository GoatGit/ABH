import type {WorkbenchSession} from './identity';

export interface WorkbenchSettingsMember{
  id:string;
  label:string;
  role:string;
  status:string;
}

export interface WorkbenchSettingsPurpose{
  name:string;
  label:string;
  enabled:boolean;
}

export interface WorkbenchSettingsConnection{
  id:string;
  label:string;
  kind:string;
  status:string;
  scopeNames:readonly string[];
}

export interface WorkbenchSettingsAutomation{
  key:string;
  label:string;
  level:string;
  enabled:boolean;
}

export interface WorkbenchSettingsOrganization{
  organizationId:string;
  workspaceId?:string;
  label:string;
  collaborationBoundary:string;
}

export interface WorkbenchSettingsCommand{
  key:string;
  label:string;
  description:string;
  requiresConfirmation:boolean;
  inputSchema:Record<string,unknown>;
  uiSchema?:Record<string,unknown>;
  initialData?:Record<string,unknown>;
}

export interface WorkbenchSettingsView{
  asOf:string;
  source:string;
  organization:WorkbenchSettingsOrganization;
  members:readonly WorkbenchSettingsMember[];
  purposes:readonly WorkbenchSettingsPurpose[];
  connections:readonly WorkbenchSettingsConnection[];
  automation:readonly WorkbenchSettingsAutomation[];
  commands:readonly WorkbenchSettingsCommand[];
}

export interface WorkbenchSettingsResolveRequest{
  session:WorkbenchSession;
}

export interface WorkbenchSettingsCommandRequest{
  session:WorkbenchSession;
  commandKey:string;
  requestId: string;
  input:Record<string,unknown>;
}

export interface WorkbenchSettingsAdapter{
  resolve(request:WorkbenchSettingsResolveRequest):Promise<WorkbenchSettingsView|null>;
  execute(request:WorkbenchSettingsCommandRequest):Promise<void>;
}

export const denyAllSettingsAdapter:WorkbenchSettingsAdapter={
  resolve:async()=>null,
  execute:async()=>{throw new Error('FORBIDDEN');},
};
