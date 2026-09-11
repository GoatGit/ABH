export interface WorkbenchOrganizationSelection{
  actingOrganizationId:string;
  resourceOrganizationId:string;
  workspaceId?:string;
}

export interface WorkbenchSession{
  readonly actorId:string;
  readonly displayName:string;
  readonly actingOrganizationId:string;
  readonly resourceOrganizationId:string;
  readonly organizationSelectionKey:string;
  readonly switchableOrganizations:readonly WorkbenchOrganizationChoice[];
  readonly workspaceId?:string;
  readonly purposeOfUse:string;
  readonly authorizationDigest:string;
  apiHeaders():Promise<HeadersInit>;
}

interface WorkbenchOrganizationChoice{
  readonly key:string;
  readonly label:string;
  readonly actingOrganizationId:string;
  readonly resourceOrganizationId:string;
  readonly workspaceId?:string;
}

export interface WorkbenchIdentityAdapter{
  resolve(headers:Headers,selection?:WorkbenchOrganizationSelection):Promise<WorkbenchSession|null>;
}

export const denyAllIdentityAdapter:WorkbenchIdentityAdapter={
  resolve:async()=>null,
};

type FixtureOrganization=WorkbenchOrganizationChoice & {
  token:string;
  authorizationDigest:string;
  purposeOfUse?:string;
};

const organizations:readonly FixtureOrganization[]=[
  {
    key:'e2e-a',label:'Organization A',
    actingOrganizationId:'00000000-0000-4000-8000-0000000000c1',
    resourceOrganizationId:'00000000-0000-4000-8000-0000000000c1',
    token:'browser-e2e',authorizationDigest:'browser-e2e-authorization-a',
  },
  {
    key:'e2e-b',label:'Organization B',
    actingOrganizationId:'00000000-0000-4000-8000-0000000000c2',
    resourceOrganizationId:'00000000-0000-4000-8000-0000000000c2',
    token:'browser-e2e-b',authorizationDigest:'browser-e2e-authorization-b',
  },
];

function createSession(choice:FixtureOrganization):WorkbenchSession{
  return {
    actorId:'00000000-0000-4000-8000-0000000000a1',
    displayName:'E2E Reviewer',
    actingOrganizationId:choice.actingOrganizationId,
    resourceOrganizationId:choice.resourceOrganizationId,
    organizationSelectionKey:choice.key,
    switchableOrganizations:organizations.filter(item=>item.key!==choice.key),
    purposeOfUse:choice.purposeOfUse??'abh.mission.manage',
    authorizationDigest:choice.authorizationDigest,
    apiHeaders:async()=>({'authorization':`Bearer ${choice.token}`}),
  };
}

function organizationForSelection(selection?:WorkbenchOrganizationSelection){
  if(!selection)return organizations[0]!;
  return organizations.find(item=>item.actingOrganizationId===selection.actingOrganizationId
    &&item.resourceOrganizationId===selection.resourceOrganizationId
    &&item.workspaceId===selection.workspaceId);
}

export const fixtureIdentityAdapter:WorkbenchIdentityAdapter={
  resolve:async(headers:Headers,selection?:WorkbenchOrganizationSelection)=>{
    const requestUrl=headers.get('referer');
    const purposeOfUse=requestUrl&&new URL(requestUrl).pathname.startsWith('/missions/')
      ?'abh.mission.manage':undefined;
    const choice=organizationForSelection(selection);
    if(choice&&purposeOfUse)return createSession({...choice,purposeOfUse});
    return choice?createSession(choice):null;
  },
};

const identityAdapter:WorkbenchIdentityAdapter=fixtureIdentityAdapter;

export function currentIdentityAdapter():WorkbenchIdentityAdapter{
  return identityAdapter;
}
