'use client';

import {useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {projectionEventPathWithCursor,type QueryIdentity} from '@/lib/query-keys';

export type LiveStreamState='connecting'|'live'|'reset'|'disabled';

export function useOrganizationLiveInvalidation(identity:QueryIdentity,
  queryKeys:readonly (readonly unknown[])[],sseEnabled=true):LiveStreamState{
  const queryClient=useQueryClient();
  const [streamState,setStreamState]=useState<LiveStreamState>(
    sseEnabled?'connecting':'disabled');
  const queryKeySignature=JSON.stringify(queryKeys);
  useEffect(()=>{
    if(!sseEnabled){setStreamState('disabled');return;}
    const queryKeys=JSON.parse(queryKeySignature) as readonly (readonly unknown[])[];
    let lastEventId='',source:EventSource,reconnectTimer:number|undefined,closed=false;
    const invalidate=()=>{
      for(const queryKey of queryKeys)
        void queryClient.invalidateQueries({queryKey});
    };
    const connect=()=>{
      source=new EventSource(projectionEventPathWithCursor(
        'abh.organization',identity.resourceOrganizationId,lastEventId));
      source.addEventListener('projection_changed',event=>{
        lastEventId=(event as MessageEvent).lastEventId||lastEventId;
        setStreamState('live');
        invalidate();
      });
      source.addEventListener('projection_reset',()=>{
        setStreamState('reset');
        for(const queryKey of queryKeys)queryClient.removeQueries({queryKey});
        source.close();
      });
      source.onopen=()=>setStreamState('live');
      source.onerror=()=>{
        setStreamState(current=>current==='reset'?'reset':'connecting');
        if(source.readyState===EventSource.CLOSED&&!closed)
          reconnectTimer=window.setTimeout(connect,500);
      };
    };
    connect();
    return()=>{
      closed=true;window.clearTimeout(reconnectTimer);source.close();
    };
  },[identity.resourceOrganizationId,queryClient,queryKeySignature,sseEnabled]);
  return streamState;
}
