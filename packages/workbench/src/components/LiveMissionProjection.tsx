'use client';

import {useQuery,useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type {ProjectionQueryResult} from '@abh/contracts';
import {missionProjectionFieldSet,projectionQueryKey,type QueryIdentity} from '@/lib/query-keys';
import {readMissionProjectionSummary} from '@/lib/mission-projection';

import {useProjectionStream} from './use-projection-stream';
const EChartsMissionProjection=dynamic(()=>
  import('./EChartsMissionProjection').then(module=>module.EChartsMissionProjection),{
  ssr:false,
  loading:()=><p className="message stale">正在加载投影图表…</p>,
});

export function LiveMissionProjection({identity,missionId,initial,staleSeconds,sseEnabled}:{
  identity:QueryIdentity;missionId:string;initial:ProjectionQueryResult;staleSeconds:number;sseEnabled:boolean;
}){
  const queryClient=useQueryClient();
  const queryKey=projectionQueryKey(identity,'abh.mission',missionId,missionProjectionFieldSet);
  const streamState=useProjectionStream(
    sseEnabled?{type:'abh.mission',id:missionId}:undefined,
    ()=>void queryClient.invalidateQueries({queryKey}),
    ()=>queryClient.removeQueries({queryKey}),
    sseEnabled);
  const query=useQuery({
    queryKey,initialData:initial,staleTime:staleSeconds*1000,
    refetchInterval:staleSeconds*1000,
    queryFn:async({signal}):Promise<ProjectionQueryResult>=>{
      const response=await fetch(`/api/projections/${missionId}`,{
        signal,headers:{accept:'application/json'},cache:'no-store',
      });
      const result=await response.json() as ProjectionQueryResult&{error?:string};
      if(!response.ok||result.error)throw new Error(result.error??'UNAVAILABLE');
      return result;
    },
  });


  if(query.isPending)return <p className="message stale">正在读取授权投影…</p>;
  if(query.isError)return <p className="message error" role="alert">投影不可用：{(query.error as Error).message}</p>;
  const projection=query.data.projection;
  const summary=readMissionProjectionSummary(projection.data,missionId);
  const asOf=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'})
    .format(Date.parse(projection.asOf));
  return <section className="card"><h2>实时投影</h2>
    {summary?(
      <>
        <dl aria-label="项目投影摘要">
          <dt>状态</dt><dd>{summary.status}</dd>
          <dt>目标修订</dt><dd>{summary.goalRevision}</dd>
          <dt>待处理触发</dt><dd>{summary.pendingTriggerCount}</dd>
          <dt>阻塞</dt><dd>{summary.blockerCount}</dd>
        </dl>
        <EChartsMissionProjection summary={summary} title="待处理触发与阻塞数量"/>
      </>
    ):<p className="message error" role="alert">投影数据形状不受支持，请刷新或重建基线。</p>}
    <p className="message stale">投影版本 {projection.subjectRef.version}；水位 {projection.watermark}；时点 {asOf}</p>
    <p role="status">订阅状态：{streamState==='live'?'实时':streamState==='reset'?'已重置，请刷新重建基线':streamState==='disabled'?'授权轮询':'连接中'}</p>
  </section>;
}
