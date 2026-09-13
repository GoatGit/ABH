import {currentSession} from '@/lib/session';
import {currentSettingsAdapter} from '@/lib/settings-install';
import {validateSettingsView} from '@/lib/settings-validation';
import {SessionRequired} from '@/components/ui';
import {Card, Message, PageHeader} from '@/components/primitives';
import {errorText} from '@/lib/errors';
import {SettingsCommandSection} from '@/components/SettingsCommandSection';
import {formatDateTime} from '@/lib/format';

export const dynamic='force-dynamic';

function List<T>({items,render}:{items:readonly T[];render:(item:T)=>React.ReactNode}){
  if(items.length===0)return <Message kind="empty">当前无可见记录。</Message>;
  return <ul>{items.map((item,index)=><li key={index}>{render(item)}</li>)}</ul>;
}

export default async function SettingsPage(){
  const session=await currentSession();
  if(!session)return <SessionRequired/>;
  try{
    const view=await currentSettingsAdapter().resolve({session});
    if(!view||!validateSettingsView(view))
      return <main><h1>组织设置</h1><Message kind="empty">当前会话未开放治理快照。</Message></main>;
    return <main>
      <PageHeader eyebrow="治理" title="组织设置" description={<>数据时点：{formatDateTime(view.asOf)}；来源：{view.source}。</>}/>
      <div className="grid">
        <Card title="协作边界">
          <dl><dt>组织</dt><dd><code>{view.organization.organizationId}</code></dd>
            <dt>Workspace</dt><dd>{view.organization.workspaceId?<code>{view.organization.workspaceId}</code>:'—'}</dd>
            <dt>名称</dt><dd>{view.organization.label}</dd>
            <dt>边界</dt><dd>{view.organization.collaborationBoundary}</dd></dl>
        </Card>
        <Card title={`成员（${view.members.length}）`}>
          <List items={view.members} render={item=>`${item.label} · ${item.role} · ${item.status}`}/>
        </Card>
        <Card title={`用途（${view.purposes.length}）`}>
          <List items={view.purposes} render={item=>`${item.label} · ${item.name} · ${item.enabled?'启用':'停用'}`}/>
        </Card>
        <Card title={`连接（${view.connections.length}）`}>
          <List items={view.connections} render={item=>`${item.label} · ${item.kind} · ${item.status} · ${item.scopeNames.join(', ')||'无作用域'}`}/>
        </Card>
        <Card title={`自动化（${view.automation.length}）`}>
          <List items={view.automation} render={item=>`${item.label} · ${item.level} · ${item.enabled?'启用':'停用'}`}/>
        </Card>
      </div>
      <h2>治理命令</h2>
      {view.commands.length===0?<Message kind="empty">当前会话没有开放治理命令。</Message>:(
        <div className="grid">{view.commands.map(command=>(
          <Card key={command.key} title={command.label}>
            <SettingsCommandSection command={command}/>
          </Card>))}</div>)}
      <p>快照和命令都由宿主适配器授权；Workbench 不保存凭据，也不推断治理语义。</p>
    </main>;
  }catch(error){return <main><h1>组织设置</h1><Message kind="error">{errorText(error)}</Message></main>;}
}
