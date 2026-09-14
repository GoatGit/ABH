import Link from 'next/link';

export default function NotFound(){
  return <main>
    <header className="page-header">
      <p className="eyebrow">404</p>
      <h1>页面不存在</h1>
      <p className="page-desc">地址可能输入有误，或该对象不属于当前授权范围。</p>
    </header>
    <section className="card">
      <Link href="/">返回总览</Link>
    </section>
  </main>;
}
