import type {Metadata,Viewport} from 'next';
import {AppShell} from '@/components/ui';
import {QueryProviders} from './providers';
import {workbenchConfig} from '@/lib/config';
import './globals.css';

export const metadata:Metadata={title:{default:'ABH Workbench',template:'%s · ABH Workbench'},description:'ABH 责任待办与项目进展'};
export const viewport:Viewport={width:'device-width',initialScale:1};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="zh-CN"><body>
    <AppShell>
      <QueryProviders staleSeconds={workbenchConfig.queryStaleSeconds}>{children}</QueryProviders>
    </AppShell>
  </body></html>;
}
