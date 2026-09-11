'use client';

import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core';
import {BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import type {MissionProjectionSummary} from '@/lib/mission-projection';

echarts.use([BarChart,GridComponent,TooltipComponent,SVGRenderer]);

export function EChartsMissionProjection({summary,title}:{summary:MissionProjectionSummary;title:string}){
  const chartRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=chartRef.current;
    if(!element)return;
    const chart=echarts.init(element,null,{renderer:'svg'});
    chart.setOption({
      grid:{left:48,right:24,top:32,bottom:40},
      tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:['待处理触发','阻塞']},
      yAxis:{type:'value',minInterval:1,allowDecimals:false},
      series:[{
        type:'bar',barWidth:48,
        data:[
          {value:summary.pendingTriggerCount,name:'待处理触发',itemStyle:{color:'#2563eb'}},
          {value:summary.blockerCount,name:'阻塞',itemStyle:{color:'#b3261e'}},
        ],
        label:{show:true,position:'top'},
      }],
    });
    const observer=new ResizeObserver(()=>chart.resize());
    observer.observe(element);
    return()=>{
      observer.disconnect();
      chart.dispose();
    };
  },[summary]);
  return <figure className="projection-figure">
    <div ref={chartRef} className="projection-chart" aria-hidden="true"/>
    <figcaption>{title}</figcaption>
  </figure>;
}
