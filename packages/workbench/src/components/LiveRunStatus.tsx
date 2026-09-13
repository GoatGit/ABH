'use client';

import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useProjectionStream} from './use-projection-stream';
import type {RunView} from '@abh/contracts';
import {runQueryKey,type QueryIdentity} from '@/lib/query-keys';
import {formatDateTime} from '@/lib/format';
import {Badge} from './primitives';

export function LiveRunStatus({identity,runId,initial,staleSeconds,sseEnabled}:{
  identity:QueryIdentity;runId:string;initial:RunView;staleSeconds:number;sseEnabled:boolean;
}){
  const queryClient=useQueryClient(),queryKey=runQueryKey(identity,runId);
  const streamState=useProjectionStream(
    {type:'abh.run',id:runId},
    ()=>{void readRun(runId).then(result=>queryClient.setQueryData(queryKey,result));},
    ()=>queryClient.removeQueries({queryKey}),
    sseEnabled);
  const query=useQuery({
    queryKey,initialData:initial,staleTime:staleSeconds*1000,
    refetchInterval:staleSeconds*1000,
    queryFn:({signal}):Promise<RunView>=>readRun(runId,signal),
  });
  if(query.isError)return <p className="message error" role="alert">
    Run 状态不可用：{(query.error as Error).message}</p>;
  if(query.isPending)return <p className="message stale">正在同步 Run 状态…</p>;
  const current=query.data.run,changed=current.runRef.version!==initial.run.runRef.version
    ||current.status!==initial.run.status;
  return <aside className="card" aria-live="polite">
    <h2>Run 服务端状态</h2>
    <p><Badge>{current.status}</Badge> · 版本 {current.runRef.version} · 时点 {query.data.asOf}</p>
    <p role="status">订阅状态：{streamState==='live'?'实时':streamState==='reset'?'已重置，请刷新重建基线':streamState==='disabled'?'授权轮询':'连接中'}</p>
    {changed?<p className="message stale">Run 已变更；取消前请确认最新版本和任务状态。</p>:null}
  </aside>;
}

async function readRun(runId:string,signal?:AbortSignal):Promise<RunView>{
  const response=await fetch(`/api/runs/${runId}`,{
    signal,headers:{accept:'application/json'},cache:'no-store',
  });
  const result=await response.json() as RunView&{error?:string};
  if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
  return result;
}
