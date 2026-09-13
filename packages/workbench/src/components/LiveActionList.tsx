'use client';

import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import type {ActionListResponse} from '@abh/contracts';
import {actionListQueryKey,type ActionListFilters,type QueryIdentity} from '@/lib/query-keys';
import {actionPositionLabel} from '@/lib/action-view';
import {formatDateTime} from '@/lib/format';
import {useOrganizationLiveInvalidation} from './useOrganizationLiveInvalidation';

export function LiveActionList({identity,filters,initial,staleSeconds}:{
  identity:QueryIdentity;filters:ActionListFilters;initial:ActionListResponse;staleSeconds:number;
}){
  const streamState=useOrganizationLiveInvalidation(identity,[
    actionListQueryKey(identity,filters)]);
  const query=useQuery({
    queryKey:actionListQueryKey(identity,filters),initialData:initial,
    staleTime:staleSeconds*1000,refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<ActionListResponse>=>
      await readActions(filters,signal),
  });
  const actions=query.data;
  if(query.isError)return <p className="message error" role="alert">
    执行结果不可用：{(query.error as Error).message}</p>;
  if(query.isPending||!actions)return <p className="message stale">正在同步授权执行结果…</p>;
  const nextQuery=new URLSearchParams();
  if(filters.missionId)nextQuery.set('missionId',filters.missionId);
  if(filters.lifecycle)nextQuery.set('lifecycle',filters.lifecycle);
  if(filters.outcome)nextQuery.set('outcome',filters.outcome);
  if(actions.meta.nextCursor)nextQuery.set('cursor',actions.meta.nextCursor);
  return <>
    <p className="message stale" role="status">刷新状态：{streamState==='live'?'实时':'授权轮询'}；时点 {formatDateTime(actions.meta.asOf)}</p>
    {actions.data.length===0?<p className="message empty" role="status">没有可见执行记录；可能缺少目标或授权。</p>:(
      <div className="grid">{actions.data.map(item=>(
        <section key={item.actionRef.id} className="card">
          <h2>{item.actionType} · {item.actionRef.id}</h2>
          <dl><dt>状态</dt><dd>{actionPositionLabel(item.position)}</dd>
            <dt>子项</dt><dd>{item.operationSummary.length}</dd>
            <dt>待确认</dt><dd>{item.unresolvedRefs.length}</dd></dl>
          <Link href={`/actions/${item.actionRef.id}`}>查看详情</Link>
        </section>))}</div>)}
    <p className="message stale">数据时点：{formatDateTime(actions.meta.asOf)}；水位 {actions.meta.watermark}</p>
    {actions.meta.nextCursor?<p><Link href={`/actions?${nextQuery.toString()}`}>下一页</Link></p>:null}
  </>;
}

async function readActions(filters:ActionListFilters,signal:AbortSignal):
  Promise<ActionListResponse>{
    const query=new URLSearchParams();
    if(filters.missionId)query.set('missionId',filters.missionId);
    if(filters.lifecycle)query.set('lifecycle',filters.lifecycle);
    if(filters.outcome)query.set('outcome',filters.outcome);
    if(filters.cursor)query.set('cursor',filters.cursor);
    const response=await fetch(`/api/actions?${query.toString()}`,{
      signal,headers:{accept:'application/json'},cache:'no-store',
    });
    const result=await response.json() as ActionListResponse&{error?:string};
    if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
    return result;
}
