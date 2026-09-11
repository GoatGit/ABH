'use client';

import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';

export function QueryProviders({staleSeconds,children}:{staleSeconds:number;children:React.ReactNode}){
  const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{
    staleTime:staleSeconds*1000,retry:false,refetchOnWindowFocus:false,
  }}}));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
