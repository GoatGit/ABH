'use client';

import {useQuery} from '@tanstack/react-query';
import type {ActionQueryResponse} from '@abh/contracts';
import {actionQueryKey,type QueryIdentity} from '@/lib/query-keys';
import {formatDateTime} from '@/lib/format';

export function LiveActionStatus({identity,actionId,initial,staleSeconds}:{
  identity:QueryIdentity;actionId:string;initial:ActionQueryResponse;staleSeconds:number;
}){
  const query=useQuery({
    queryKey:actionQueryKey(identity,actionId),initialData:initial,
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
    <p>订阅状态：授权轮询</p>
    {changed?<p className="message stale">服务端状态已变更；提交前请刷新页面确认最新版本与可用操作。</p>:null}
  </aside>;
}
