import Link from 'next/link';
import {currentSession} from '@/lib/session';
import {switchOrganizationAction} from '@/lib/actions';
import {Message} from './primitives';
import {NavLinks,type NavItem} from './nav-links';

const NAV_ITEMS:readonly NavItem[]=[
  {href:'/',label:'总览',icon:<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>},
  {href:'/inbox',label:'待办与审批',icon:<path d="M3 13h5l2 3h4l2-3h5M3 13l2.5-8h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>},
  {href:'/actions',label:'执行',icon:<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>},
  {href:'/learning',label:'Learning',icon:<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>},
  {href:'/settings',label:'设置',icon:<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>},
];

function OrganizationSwitcher({session}:{session:Awaited<ReturnType<typeof currentSession>>}){
  if(!session)return null;
  return <form action={switchOrganizationAction} className="organization-switcher">
    <span id="organization-context-label" className="meta">当前 acting/resource</span>
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
  </form>;
}

function Brand(){
  return <div className="brand"><span className="brand-mark" aria-hidden="true">A</span>ABH Workbench</div>;
}

/** Application shell: persistent sidebar on wide screens, sticky top bar on narrow ones. */
export async function AppShell({children}:{children:React.ReactNode}){
  const session=await currentSession();
  return <div className="app-shell">
    <a className="skip-link" href="#app-content">跳到内容</a>
    <aside className="sidebar">
      <Brand/>
      <nav aria-label="主导航"><NavLinks items={NAV_ITEMS}/></nav>
      <div className="sidebar-footer">
        <p className="meta">组织上下文</p>
        <p className="meta">在页面顶部切换 acting/resource。</p>
      </div>
    </aside>
    <div className="app-content" id="app-content">
      <header className="appbar">
        <Brand/>
        <nav aria-label="主导航"><NavLinks items={NAV_ITEMS}/></nav>
      </header>
      <div className="content-topbar"><OrganizationSwitcher session={session}/></div>
      {children}
    </div>
  </div>;
}

export function SessionRequired(){
  return <main><h1>ABH Workbench</h1><Message kind="error">未登录或身份适配器未安装。</Message></main>;
}
