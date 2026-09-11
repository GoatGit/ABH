import Link from 'next/link';
import {currentSession} from '@/lib/session';
import {switchOrganizationAction} from '@/lib/actions';

export function Message({kind,children}:{kind:'empty'|'error'|'stale';children:React.ReactNode}){
  return <p className={`message ${kind}`} role={kind==='error'?'alert':'status'}>{children}</p>;
}

export function Card({title,children}:{title:string;children:React.ReactNode}){
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

export function SessionRequired(){
  return <main><h1>ABH Workbench</h1><Message kind="error">未登录或身份适配器未安装。</Message></main>;
}

export async function Navigation(){
  const session=await currentSession();
  return <nav aria-label="主导航">
    <div className="nav-links">
      <Link href="/">总览</Link><Link href="/inbox">待办与审批</Link><Link href="/actions">执行</Link>
      <Link href="/settings">设置</Link>
    </div>
    {session?<form action={switchOrganizationAction} className="organization-switcher">
      <span id="organization-context-label">当前 acting/resource</span>
      <span className="organization-context" aria-labelledby="organization-context-label">
        <code>{session.actingOrganizationId}</code> / <code>{session.resourceOrganizationId}</code>
      </span>
      {session.switchableOrganizations.length>0?(
        <>
          <select name="selectionKey" defaultValue={session.organizationSelectionKey}
            aria-label="切换组织上下文">
            {session.switchableOrganizations.map(choice=>(
              <option key={choice.key} value={choice.key}>{choice.label}</option>
            ))}
          </select>
          <button type="submit">切换</button>
        </>
      ):null}
    </form>:null}
  </nav>;
}
