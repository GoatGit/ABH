'use client';

import {useActionState,useState} from 'react';
import type {WorkbenchSettingsCommand} from '@/lib/settings';
import {executeSettingsAction,type ActionState} from '@/lib/actions';

const initialState:ActionState={status:'idle'};

export function SettingsCommandForm({command}:{command:WorkbenchSettingsCommand}){
  const [state,formAction,pending]=useActionState(executeSettingsAction,initialState);
  const initialInput=JSON.stringify(command.initialData??{},null,2);
  const [inputText,setInputText]=useState(initialInput);
  let inputValid=true;
  try{JSON.parse(inputText);}catch{inputValid=false;}
  return <form action={formAction} className="action-form">
    <input type="hidden" name="commandKey" value={command.key}/>
    <p>{command.description}</p>
    <label htmlFor={`${command.key}-request-id`}>请求 ID</label>
    <input id={`${command.key}-request-id`} name="requestId" required minLength={8}
      maxLength={128} defaultValue={crypto.randomUUID()}/>
    <label htmlFor={`${command.key}-input`}>命令输入 JSON</label>
    <textarea id={`${command.key}-input`} name="input" rows={8} value={inputText}
      onChange={event=>setInputText(event.target.value)} spellCheck={false}/>
    {inputValid?null:<p className="message error" role="alert">JSON 格式无效。</p>}
    <button type="submit" disabled={pending||!inputValid}
      onClick={event=>{
        if(command.requiresConfirmation&&!window.confirm('该治理命令需要明确确认，是否继续？'))
          event.preventDefault();
      }}>{pending?'提交中':'提交治理命令'}</button>
    {state.status==='success'?<p role="status">{state.message}</p>:null}
    {state.status==='error'?<p role="alert">{state.message}</p>:null}
  </form>;
}
