'use client';

import {useActionState} from 'react';
import type {ActionState} from '@/lib/actions';

type ServerAction=(previous:ActionState,formData:FormData)=>Promise<ActionState>;

export function ActionForm({action,children,confirm}:{
  action:ServerAction;children:React.ReactNode;confirm?:string;
}){
  const [state,formAction,pending]=useActionState(action,{status:'idle'} as ActionState);
  return (
    <form action={formAction} className="action-form">
      {children}
      <button type="submit" disabled={pending} onClick={event=>{
        if(confirm&&!window.confirm(confirm))event.preventDefault();
      }}>{pending?'提交中':'确认提交'}</button>
      {state.status==='success'?<p role="status">{state.message}</p>:null}
      {state.status==='error'?<p role="alert">{state.message}</p>:null}
    </form>
  );
}
