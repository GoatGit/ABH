'use client';

import {JsonForms} from '@jsonforms/react';
import type {UISchemaElement} from '@jsonforms/core';
import Ajv2020 from 'ajv/dist/2020.js';
import {vanillaCells,vanillaRenderers} from '@jsonforms/vanilla-renderers';
import {useActionState,useMemo,useState} from 'react';
import type {WorkbenchCompensationTemplate} from '@/lib/compensation';
import {submitCompensationAction,type ActionState} from '@/lib/actions';

const initialState:ActionState={status:'idle'};

export function CompensationForm({actionId,actionVersion,template}:{
  actionId:string;actionVersion:number;template:WorkbenchCompensationTemplate;
}){
  const [state,formAction,pending]=useActionState(submitCompensationAction,initialState);
  const [data,setData]=useState<Record<string,unknown>>(template.initialData??{});
  const [errors,setErrors]=useState<readonly {message?:string}[]>([]);
  const ajv=useMemo(()=>new Ajv2020({allErrors:true,strict:false}),[]);
  return <form action={formAction} className="action-form">
    <input type="hidden" name="actionId" value={actionId}/>
    <input type="hidden" name="version" value={actionVersion}/>
    <input type="hidden" name="templateKey" value={template.key}/>
    <input type="hidden" name="input" value={JSON.stringify(data)}/>
    <p>{template.description}</p>
    <JsonForms
      schema={template.inputSchema as Record<string,unknown>}
      uischema={template.uiSchema as UISchemaElement|undefined}
      data={data}
      ajv={ajv}
      renderers={vanillaRenderers}
      cells={vanillaCells}
      onChange={({data:newData,errors:newErrors})=>{
        setData((newData??{}) as Record<string,unknown>);
        setErrors(newErrors??[]);
      }}
    />
    {errors.length>0?<p className="message error" role="alert">表单未通过注册 Schema 校验。</p>:null}
    <button type="submit" disabled={pending||errors.length>0}>提交补偿提案</button>
    {state.status==='success'?<p role="status">{state.message}</p>:null}
    {state.status==='error'?<p role="alert">{state.message}</p>:null}
    <p>补偿是新的明确 Action；提交后只显示受理，不会自动标为已生效。</p>
  </form>;
}
