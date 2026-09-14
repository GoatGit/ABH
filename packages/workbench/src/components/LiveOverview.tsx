'use client';

import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import type {DecisionInboxResponse,MissionListResult} from '@abh/contracts';
import {overviewInboxQueryKey,overviewMissionsQueryKey,type QueryIdentity} from '@/lib/query-keys';
import {formatDateTime,formatImpact} from '@/lib/format';
import {useOrganizationLiveInvalidation} from './useOrganizationLiveInvalidation';
import {Badge,Card,PageHeader} from './primitives';

export function LiveOverview({displayName,identity,initialMissions,initialInbox,staleSeconds}:{
  displayName:string;identity:QueryIdentity;initialMissions:MissionListResult;
  initialInbox:DecisionInboxResponse;staleSeconds:number;
}){
  const streamState=useOrganizationLiveInvalidation(identity,[
    overviewMissionsQueryKey(identity),overviewInboxQueryKey(identity)]);
  const missionsQuery=useQuery({
    queryKey:overviewMissionsQueryKey(identity),initialData:initialMissions,
    staleTime:staleSeconds*1000,refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<MissionListResult>=>
      readOverview('/api/overview/missions',signal),
  });
  const inboxQuery=useQuery({
    queryKey:overviewInboxQueryKey(identity),initialData:initialInbox,
    staleTime:staleSeconds*1000,refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<DecisionInboxResponse>=>
      readOverview('/api/overview/inbox',signal),
  });
  const missions=missionsQuery.data,inbox=inboxQuery.data;
  const pending=missionsQuery.isPending||inboxQuery.isPending;
  const error=missionsQuery.isError?(missionsQuery.error as Error).message:
    inboxQuery.isError?(inboxQuery.error as Error).message:undefined;

  return <main>
    <PageHeader title="业务总览" description={<>身份：<strong>{displayName}</strong>
      {' '}<code>{identity.actorId}</code>；组织上下文见页首。</>}/>
    {pending?<p className="message stale" role="status">正在读取授权总览…</p>:null}
    {error?<p className="message error" role="alert">总览不可用：{error}</p>:(
      <div className="grid">
        <section className="card"><h2>项目进展（{missions.missions.length}）</h2>
          {missions.missions.length===0?<p className="message empty" role="status">暂无目标项目。</p>:(
            <ul className="card-links">{missions.missions.map(item=>(
              <li key={item.missionRef.id}><Link href={`/missions/${item.missionRef.id}`}>
                {item.domainType} · <Badge>{item.status}</Badge> · 版本 {item.missionRef.version}</Link></li>))}</ul>)}
          <p className="meta">数据时点：{formatDateTime(missions.asOf)}</p>
        </section>
        <section className="card"><h2>责任待办（{inbox.data.length}）</h2>
          {inbox.data.length===0?<p className="message empty" role="status">当前没有待处理责任。</p>:(
            <ul className="card-links">{inbox.data.map(item=>(
              <li key={item.decisionRef.id}><Link href={`/decisions/${item.decisionRef.id}`}>
                {item.package.question}</Link></li>))}</ul>)}
          <p className="meta">数据时点：{formatDateTime(inbox.meta.asOf)}</p>
        </section>
      </div>)}
    {!error&&inbox.data[0]?<section className="card"><h2>最高优先影响</h2>
      <p>{formatImpact(inbox.data[0].package.impactUpperBound)}</p></section>:null}
    <p className="message stale" role="status">刷新状态：{streamState==='live'?'实时':'授权轮询'}；时点 {formatDateTime(missions.asOf)}</p>
  </main>;
}

async function readOverview<T>(path:string,signal:AbortSignal):Promise<T>{
  const response=await fetch(path,{signal,headers:{accept:'application/json'},cache:'no-store'});
  const result=await response.json() as T&{error?:string};
  if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
  return result;
}
