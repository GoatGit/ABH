'use client';

import dynamic from 'next/dynamic';
import type {WorkbenchSettingsCommand} from '@/lib/settings';

const SettingsCommandForm=dynamic(()=>
  import('./SettingsCommandForm').then(module=>module.SettingsCommandForm),{
  ssr:false,
  loading:()=><p className="message stale">正在加载治理表单…</p>,
});

export function SettingsCommandSection({command}:{command:WorkbenchSettingsCommand}){
  return <SettingsCommandForm command={command}/>;
}
