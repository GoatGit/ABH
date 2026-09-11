import {cookies,headers} from 'next/headers';
import {cache} from 'react';
import type {WorkbenchOrganizationSelection,WorkbenchSession} from './identity';
import {identityAdapter} from './identity-install';
import {organizationCookieNames,parseOrganizationSelection} from './organization';

async function resolveSession():Promise<WorkbenchSession|null>{
  const requestHeaders=new Headers(await headers());
  const cookieStore=await cookies();
  const organizationSelection:WorkbenchOrganizationSelection|undefined=parseOrganizationSelection({
    actingOrganizationId:cookieStore.get(organizationCookieNames.actingOrganizationId)?.value,
    resourceOrganizationId:cookieStore.get(organizationCookieNames.resourceOrganizationId)?.value,
    workspaceId:cookieStore.get(organizationCookieNames.workspaceId)?.value,
  });
  return identityAdapter.resolve(requestHeaders,organizationSelection);
}

export const currentSession=cache(resolveSession);
