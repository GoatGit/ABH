'use client';

import {JsonForms} from '@jsonforms/react';
import type {UISchemaElement} from '@jsonforms/core';
import Ajv2020 from 'ajv/dist/2020.js';
import {vanillaCells,vanillaRenderers} from '@jsonforms/vanilla-renderers';
import {useActionState,useMemo,useState} from 'react';
import type {WorkbenchDecisionFormTemplate} from '@/lib/decision-forms';
import {submitDecisionAction,type ActionState} from '@/lib/actions';
import {jsonFormsZhI18n} from '@/lib/form-i18n';

const initialState:ActionState={status:'idle'};

function DecisionForm({decisionId,decisionVersion,packageDigest,form}:{
  decisionId:string;decisionVersion:number;packageDigest:string;
  form:WorkbenchDecisionFormTemplate;
}){
  const [state,formAction,pending]=useActionState(submitDecisionAction,initialState);
  const [data,setData]=useState<Record<string,unknown>>(form.initialData??{});
  const [errors,setErrors]=useState<readonly {message?:string}[]>([]);
  const ajv=useMemo(()=>new Ajv2020({allErrors:true,strict:false}),[]);
  return <form action={formAction} className="action-form">
    <input type="hidden" name="decisionId" value={decisionId}/>
    <input type="hidden" name="version" value={decisionVersion}/>
    <input type="hidden" name="packageDigest" value={packageDigest}/>
    <input type="hidden" name="formKey" value={form.key}/>
    <input type="hidden" name="response" value={form.response}/>
    <input type="hidden" name="input" value={JSON.stringify(data)}/>
    <p>{form.description}</p>
    <JsonForms
      schema={form.inputSchema}
      uischema={form.uiSchema as UISchemaElement|undefined}
      data={data} ajv={ajv} renderers={vanillaRenderers}
      cells={vanillaCells} i18n={jsonFormsZhI18n}
      onChange={({data:newData,errors:newErrors})=>{
        setData((newData??{}) as Record<string,unknown>);
        setErrors(newErrors??[]);
      }}
    />
    {errors.length>0?<p className="message error" role="alert">表单未通过注册责任 Schema 校验。</p>:null}
    <button type="submit" disabled={pending||errors.length>0}
      onClick={event=>{
        if(form.requiresConfirmation&&!window.confirm(`确认提交“${form.label}”？批准不等于外部效果已生效。`))
          event.preventDefault();
      }}>{pending?'提交中':form.label}</button>
    {state.status==='success'?<p role="status">{state.message}</p>:null}
    {state.status==='error'?<p role="alert">{state.message}</p>:null}
  </form>;
}

export function DecisionForms({decisionId,decisionVersion,packageDigest,forms}:{decisionId:string;
  decisionVersion:number;packageDigest:string;forms:readonly WorkbenchDecisionFormTemplate[];}){
  return <>{forms.map(form=>(
    <section key={form.key} aria-label={form.label}>
      <DecisionForm decisionId={decisionId} decisionVersion={decisionVersion}
        packageDigest={packageDigest} form={form}/>
    </section>
  ))}</>;
}
