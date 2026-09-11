'use client';

import dynamic from 'next/dynamic';
import type {WorkbenchDecisionFormTemplate} from '@/lib/decision-forms';

const DecisionForms=dynamic(()=>import('./DecisionForms').then(module=>module.DecisionForms),{
  ssr:false,
  loading:()=><p className="message stale">正在加载注册责任表单…</p>,
});

export function DecisionFormsSection({decisionId,decisionVersion,packageDigest,forms}:{
  decisionId:string;decisionVersion:number;packageDigest:string;
  forms:readonly WorkbenchDecisionFormTemplate[];
}){
  return <DecisionForms decisionId={decisionId} decisionVersion={decisionVersion}
    packageDigest={packageDigest} forms={forms}/>;
}
