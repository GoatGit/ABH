'use client';

import dynamic from 'next/dynamic';
import type {WorkbenchCompensationTemplate} from '@/lib/compensation';

const CompensationForm=dynamic(()=>import('./CompensationForm').then(module=>module.CompensationForm),{
  ssr:false,
  loading:()=><p className="message stale">正在加载注册补偿表单…</p>,
});

export function CompensationSection({actionId,actionVersion,template}:{
  actionId:string;actionVersion:number;template:WorkbenchCompensationTemplate;
}){
  return <CompensationForm actionId={actionId} actionVersion={actionVersion} template={template}/>;
}
