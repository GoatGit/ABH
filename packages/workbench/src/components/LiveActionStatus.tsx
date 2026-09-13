'use client';

import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import type {ActionQueryResponse} from '@abh/contracts';
import {actionQueryKey,projectionEventPathWithCursor,type QueryIdentity} from '@/lib/query-keys';
import {formatDateTime} from '@/lib/format';

export function LiveActionStatus({identity,actionId,initial,staleSeconds,sseEnabled}:{
  identity:QueryIdentity;actionId:string;initial:ActionQueryResponse;staleSeconds:number;
  sseEnabled?:boolean;
}){
  const queryClient=useQueryClient(),queryKey=actionQueryKey(identity,actionId);
  const [streamState,setStreamState]=useState<'connecting'|'live'|'reset'|'disabled'>(
    sseEnabled===false?'disabled':'connecting');
  const query=useQuery({
    queryKey,initialData:initial,
    staleTime:staleSeconds*1000,refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<ActionQueryResponse>=>{
      const response=await fetch(`/api/actions/${actionId}`,{
        signal,headers:{accept:'application/json'},cache:'no-store',
      });
      const result=await response.json() as ActionQueryResponse&{error?:string};
      if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
      return result;
    },
  });
  useEffect(()=>{
    if(sseEnabled===false){setStreamState('disabled');return;}
    let lastEventId='',source:EventSource,reconnectTimer:number|undefined,closed=false;
    const connect=()=>{
      source=new EventSource(projectionEventPathWithCursor('abh.action',actionId,lastEventId));
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
  },[actionId,queryClient,queryKey,sseEnabled]);
  if(query.isError)return <p className="message error" role="alert">
    执行状态不可用：{(query.error as Error).message}</p>;
  if(query.isPending)return <p className="message stale">正在同步执行状态…</p>;
  const current=query.data.data,changed=current.actionRef.version!==initial.data.actionRef.version
    ||current.position.lifecycle!==initial.data.position.lifecycle
    ||current.position.outcome!==initial.data.position.outcome;
  return <aside className="card" aria-live="polite">
    <h2>服务端状态</h2>
    <p><strong>{current.position.lifecycle}</strong> · {current.position.outcome} ·
      {' '}版本 {current.actionRef.version} · 时点 {formatDateTime(query.data.meta.asOf)}</p>
    <p role="status">订阅状态：{streamState==='live'?'实时':streamState==='reset'?'已重置，请刷新重建基线':streamState==='disabled'?'授权轮询':'连接中'}</p>
    {changed?<p className="message stale">服务端状态已变更；提交前请刷新页面确认最新版本与可用操作。</p>:null}
  </aside>;
}
