export function formatDateTime(value:string):string{
  const time=Date.parse(value);
  return Number.isFinite(time)?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',
    timeZone:'Asia/Shanghai'}).format(time):value;
}

export function formatImpact(impact:{scopeRefs:unknown[];resourceRequirements:unknown[];
  maxMoney:{amount:string;currency:string}[];description:string}):string{
  const money=impact.maxMoney.map(item=>`${item.amount} ${item.currency}`).join('、');
  return [impact.description,money&&`上限：${money}`,`影响范围数：${impact.scopeRefs.length}`]
    .filter(Boolean).join('；');
}
