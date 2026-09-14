'use client';

import {errorText} from '@/lib/errors';

/** Route-segment error boundary: keeps the shell intact and offers an explicit retry. */
export default function RouteError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <main>
    <header className="page-header">
      <p className="eyebrow">出错了</p>
      <h1>页面无法完成加载</h1>
      <p className="page-desc">{errorText(error)}</p>
    </header>
    <section className="card">
      <p>可以是网络或授权状态发生了变化；重试会重新发起同权限的读取。</p>
      <div className="form-row">
        <button type="button" onClick={reset}>重试</button>
        <a className="nav-item" href="/">返回总览</a>
      </div>
    </section>
  </main>;
}
