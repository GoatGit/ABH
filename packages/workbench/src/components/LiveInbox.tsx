'use client';

import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import type {DecisionInboxResponse} from '@abh/contracts';
import {overviewInboxQueryKey,type QueryIdentity} from '@/lib/query-keys';
import {formatDateTime,formatImpact} from '@/lib/format';

export function LiveInbox({identity,initial,staleSeconds}:{
  identity:QueryIdentity;initial:DecisionInboxResponse;staleSeconds:number;
}){
  const query=useQuery({
    queryKey:overviewInboxQueryKey(identity),initialData:initial,
    staleTime:staleSeconds*1000,refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<DecisionInboxResponse>=>
      await readInbox('/api/overview/inbox',signal),
  });
  const inbox=query.data;
  if(query.isError)return <main><h1>待办与审批</h1>
    <p className="message error" role="alert">待办不可用：{(query.error as Error).message}</p></main>;
  if(query.isPending||!inbox)return <main><h1>待办与审批</h1>
    <p className="message stale">正在同步授权待办…</p></main>;
  return <main><h1>待办与审批</h1>
    <p className="message stale" role="status">刷新状态：授权轮询；时点 {formatDateTime(inbox.meta.asOf)}</p>
    {inbox.data.length===0?<p className="message empty" role="status">无待办；可创建目标或等待新责任。</p>:(
      <div className="grid">{inbox.data.map(item=>(
        <section key={item.decisionRef.id} className="card">
          <h2>{item.package.question}</h2>
          <dl><dt>类型</dt><dd>{item.package.slotId}</dd>
            <dt>影响</dt><dd>{formatImpact(item.package.impactUpperBound)}</dd>
            <dt>截止</dt><dd>{formatDateTime(item.package.validUntil)}</dd></dl>
          <p>提交后不会立即显示“已生效”；生效必须等待服务端确认。</p>
          <Link href={`/decisions/${item.decisionRef.id}`}>查看并审批</Link>
        </section>))}</div>)}
  </main>;
}

async function readInbox(path:string,signal:AbortSignal):Promise<DecisionInboxResponse>{
  const response=await fetch(path,{signal,headers:{accept:'application/json'},cache:'no-store'});
  const result=await response.json() as DecisionInboxResponse&{error?:string};
  if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
  return result;
}
