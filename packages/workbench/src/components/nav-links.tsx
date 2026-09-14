'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';

export interface NavItem{
  href:string;label:string;icon:ReactNode;
}

/** Marks the active entry so keyboard and screen-reader users know where they are.
 *  '/' matches exactly; every other entry matches its prefix. */
export function NavLinks({items}:{items:readonly NavItem[]}){
  const pathname=usePathname()??'/';
  return <div className="nav-links">
    {items.map(item=>{
      const active=item.href==='/'?pathname==='/'
        :pathname===item.href||pathname.startsWith(`${item.href}/`);
      return <Link key={item.href} href={item.href} className="nav-item"
        aria-current={active?'page':undefined}>
        <NavIcon path={item.icon}/>{item.label}
      </Link>;
    })}
  </div>;
}

function NavIcon({path}:{path:ReactNode}){
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
