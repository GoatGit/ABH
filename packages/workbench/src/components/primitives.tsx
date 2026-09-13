import {statusTone} from '@/lib/status';

/** Presentational primitives shared by server and client components.
 *  This file must not import server-only modules (next/headers, session). */

export function Message({kind,children}:{kind:'empty'|'error'|'stale';children:React.ReactNode}){
  return <p className={`message ${kind}`} role={kind==='error'?'alert':'status'}>{children}</p>;
}

export function Card({title,children,aside}:{title:string;children:React.ReactNode;aside?:React.ReactNode}){
  return <section className="card">
    <div className="page-header-row">
      <h2>{title}</h2>
      {aside?<div className="page-actions">{aside}</div>:null}
    </div>
    {children}
  </section>;
}

export function PageHeader({eyebrow,title,description,aside,children}:{eyebrow?:string;title:string;description?:React.ReactNode;aside?:React.ReactNode;children?:React.ReactNode}){
  return <header className="page-header">
    {eyebrow?<p className="eyebrow">{eyebrow}</p>:null}
    <div className="page-header-row">
      <div>
        <h1>{title}</h1>
        {description?<p className="page-desc">{description}</p>:null}
      </div>
      {(aside??children)?<div className="page-actions">{aside}{children}</div>:null}
    </div>
  </header>;
}

/** Renders a flat status pill; wraps the exact same text so accessible names are unchanged. */
export function Badge({status,children}:{status?:string;children?:React.ReactNode}){
  return <span className={`badge tone-${statusTone(status??textOf(children))}`}>{children??status}</span>;
}

function textOf(node:React.ReactNode):string{
  return typeof node==='string'?node:typeof node==='number'?String(node):'';
}
