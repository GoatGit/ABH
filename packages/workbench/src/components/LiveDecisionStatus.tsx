'use client';

import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import type {DecisionQueryResponse} from '@abh/contracts';
import {decisionQueryKey,projectionEventPathWithCursor,type QueryIdentity} from '@/lib/query-keys';

export function LiveDecisionStatus({identity,decisionId,initial,staleSeconds,sseEnabled}:{
  identity:QueryIdentity;decisionId:string;initial:DecisionQueryResponse;staleSeconds:number;sseEnabled:boolean;
}){
  const queryClient=useQueryClient(),queryKey=decisionQueryKey(identity,decisionId);
  const [streamState,setStreamState]=useState<'connecting'|'live'|'reset'|'disabled'>(
    sseEnabled?'connecting':'disabled');
  const query=useQuery({
    queryKey,initialData:initial,staleTime:staleSeconds*1000,
    refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<DecisionQueryResponse>=>{
      const response=await fetch(`/api/decisions/${decisionId}`,{
        signal,headers:{accept:'application/json'},cache:'no-store',
      });
      const result=await response.json() as DecisionQueryResponse&{error?:string};
      if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
      return result;
    },
  });

  useEffect(()=>{
    if(!sseEnabled){setStreamState('disabled');return;}
    let lastEventId='',source:EventSource,reconnectTimer:number|undefined,closed=false;
    const connect=()=>{
      source=new EventSource(projectionEventPathWithCursor('abh.decision',decisionId,lastEventId));
      source.addEventListener('projection_changed',event=>{
        lastEventId=(event as MessageEvent).lastEventId||lastEventId;
        setStreamState('live');
        void queryClient.invalidateQueries({queryKey});
      });
      source.addEventListener('projection_reset',()=>{
        setStreamState('reset');
        queryClient.removeQueries({queryKey});
        source.close();
      });
      source.onopen=()=>{
        setStreamState('live');
        void queryClient.invalidateQueries({queryKey});
      };
      source.onerror=()=>{
        setStreamState(current=>current==='reset'?'reset':'connecting');
        if(source.readyState===EventSource.CLOSED&&!closed){
          reconnectTimer=window.setTimeout(connect,500);
        }
      };
    };
    connect();
    return()=>{closed=true;window.clearTimeout(reconnectTimer);source.close();};
  },[decisionId,queryClient,sseEnabled]);

  if(query.isError)return <p className="message error" role="alert">决定状态不可用：{(query.error as Error).message}</p>;
  if(query.isPending)return <p className="message stale">正在同步决定状态…</p>;
  const current=query.data.data,changed=current.decisionRef.version!==initial.data.decisionRef.version
    ||current.status!==initial.data.status;
  return <aside className="card" aria-live="polite">
    <h2>服务端状态</h2>
    <p><strong>{current.status}</strong> · 版本 {current.decisionRef.version} · 时点 {query.data.meta.asOf}</p>
    <p>订阅状态：{streamState==='live'?'实时':streamState==='reset'?'已重置，请刷新重建基线':streamState==='disabled'?'授权轮询':'连接中'}</p>
    {changed?<p className="message stale">服务端状态已变更；提交前请刷新页面确认最新版本与可用操作。</p>:null}
  </aside>;
}
