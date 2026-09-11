export interface WorkbenchSession {
  readonly actorId:string;
  readonly displayName:string;
  readonly actingOrganizationId:string;
  readonly resourceOrganizationId:string;
  readonly organizationSelectionKey:string;
  readonly switchableOrganizations:readonly WorkbenchOrganizationChoice[];
  readonly workspaceId?:string;
  readonly purposeOfUse:string;
  /** Stable, non-secret current authorization summary used only to partition client caches. */
  readonly authorizationDigest:string;
  /** Per-request credentials for the ABH API; the browser never receives them. */
  apiHeaders(signal:AbortSignal):Promise<HeadersInit>;
}

export interface WorkbenchOrganizationChoice{
  /** Stable non-secret key used only to select a host-declared choice. */
  readonly key:string;
  readonly label:string;
  readonly actingOrganizationId:string;
  readonly resourceOrganizationId:string;
  readonly workspaceId?:string;
}

export interface WorkbenchOrganizationSelection{
  readonly actingOrganizationId:string;
  readonly resourceOrganizationId:string;
  readonly workspaceId?:string;
}

export interface WorkbenchIdentityAdapter {
  /** The organization cookie selection is untrusted; hosts must revalidate membership and purpose. */
  resolve(requestHeaders:Headers,organizationSelection?:WorkbenchOrganizationSelection):
    Promise<WorkbenchSession|null>;
}

/** Production hosts replace this explicit installation. No anonymous or shared identity exists. */
export const denyAllIdentityAdapter:WorkbenchIdentityAdapter={
  resolve:async()=>null,
};
