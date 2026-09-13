'use client';

import {useQueryClient} from '@tanstack/react-query';
import {useProjectionStream} from './use-projection-stream';
import type {QueryIdentity} from '@/lib/query-keys';

export type {LiveStreamState} from './use-projection-stream';

export function useOrganizationLiveInvalidation(identity:QueryIdentity,
  queryKeys:readonly (readonly unknown[])[],sseEnabled=true){
  const queryClient=useQueryClient();
  const queryKeySignature=JSON.stringify(queryKeys);
  return useProjectionStream(
    {type:'abh.organization',id:identity.resourceOrganizationId},
    ()=>invalidateAll(JSON.parse(queryKeySignature) as readonly (readonly unknown[])[],queryClient),
    ()=>removeAll(JSON.parse(queryKeySignature) as readonly (readonly unknown[])[],queryClient),
    sseEnabled);
}

function invalidateAll(queryKeys:readonly (readonly unknown[])[],queryClient:ReturnType<typeof useQueryClient>){
  for(const queryKey of queryKeys)void queryClient.invalidateQueries({queryKey});
}

function removeAll(queryKeys:readonly (readonly unknown[])[],queryClient:ReturnType<typeof useQueryClient>){
  for(const queryKey of queryKeys)queryClient.removeQueries({queryKey});
}
