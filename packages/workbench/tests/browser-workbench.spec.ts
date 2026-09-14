import {test,expect,type Page} from '@playwright/test';
import {AxeBuilder} from '@axe-core/playwright';

type Metrics={lcp:number;cls:number;inp:number};
let completedRunUrl='';
const unknownRunId='00000000-0000-4000-8000-000000000000';
const runningRunId='00000000-0000-4000-8000-0000000000c2';
const missionId='00000000-0000-4000-8000-000000000011';
const lcpBudget=process.env.E2E_DEV==='1'?10_000:2_500;

async function installMetrics(page:Page):Promise<void>{
  await page.addInitScript(()=>{
    const target=window as Window & {__abhMetrics?:Metrics};
    target.__abhMetrics={lcp:0,cls:0,inp:0};
    new PerformanceObserver(list=>{
      const entries=list.getEntries();
      target.__abhMetrics!.lcp=entries.at(-1)?.startTime??target.__abhMetrics!.lcp;
    }).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        const layout=entry as PerformanceEntry & {value:number;hadRecentInput:boolean};
        if(!layout.hadRecentInput)target.__abhMetrics!.cls+=layout.value;
      }
    }).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        const interaction=entry as PerformanceEntry & {interactionId:number};
        if(interaction.interactionId>0)target.__abhMetrics!.inp=
          Math.max(target.__abhMetrics!.inp,interaction.duration);
      }
    }).observe({type:'event',buffered:true,durationThreshold:16} as PerformanceObserverInit
      & {durationThreshold:number});
  });
}

async function metrics(page:Page):Promise<Metrics>{
  await page.waitForTimeout(750);
  return await page.evaluate(()=>(window as Window & {__abhMetrics?:Metrics}).__abhMetrics!);
}

async function accessibility(page:Page):Promise<void>{
  const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
}

test('reviewer completes overview, mission and decision journey',async({page})=>{
  await installMetrics(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'业务总览'})).toBeVisible();
  await expect(page.getByRole('link',{name:/demo\.project/})).toBeVisible();
  await page.request.get('http://127.0.0.1:18777/v1/testing/inbox-consume',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await expect(page.getByRole('link',{name:'Publish the approved customer brief?'}))
    .toBeHidden({timeout:8_000});
  await accessibility(page);
  expect((await metrics(page)).lcp).toBeLessThanOrEqual(lcpBudget);

  await page.getByRole('link',{name:/demo\.project/}).click();
  await expect(page.getByRole('heading',{name:'demo.project'})).toBeVisible();
  await expect(page.getByText('待处理触发').first()).toBeVisible();
  await expect(page.getByText('待处理触发与阻塞数量')).toBeVisible();
  await expect(page.getByText('订阅状态：实时')).toBeVisible();
  const runHistory=page.getByLabel('Mission Run 历史');
  await expect(runHistory).toContainText('demo.trigger · 版本 2');
  await expect(runHistory).toContainText('Completed · Production');
  await expect(runHistory).toContainText('cancel.trigger · 版本 1');
  await expect(runHistory).toContainText('Running · Production');
  await expect(runHistory).toContainText('Queued · Shadow');
  await runHistory.getByRole('link',{name:'cancel.trigger · 版本 1'}).click();
  await expect(page.getByRole('heading',{name:'cancel.trigger'})).toBeVisible();
  await expect(page.getByText('订阅状态：实时')).toBeVisible();
  await expect(page.getByText('任务（1）')).toBeVisible();
  await expect(page.getByLabel('Run 任务列表')).toContainText('demo.execute · DomainCommand · Running');
  const cancelRunForm=page.locator('form').filter({has:page.getByLabel('Run 取消理由')});
  await cancelRunForm.getByLabel('Run 取消理由').fill('Superseded before downstream delivery.');
  page.once('dialog',dialog=>void dialog.accept());
  await cancelRunForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByText('Run 取消已受理')).toBeVisible();
  await page.reload();
  await expect(page.getByText('当前强读 Run v2')).toBeVisible({timeout:15_000});
  await expect(page.getByLabel('Run 任务列表')).toContainText('demo.execute · DomainCommand · Cancelled');
  await page.goto(`/missions/${missionId}`);
  await expect(page.getByRole('heading',{name:'demo.project'})).toBeVisible();
  const runHistoryForCompleted=page.getByLabel('Mission Run 历史');
  await expect(runHistoryForCompleted).toContainText('Cancelled · Production');
  await runHistory.getByRole('link',{name:'demo.trigger · 版本 2'}).click();
  await expect(page.getByRole('heading',{name:'demo.trigger'})).toBeVisible();
  await expect(page.getByText('强读 Run v2')).toBeVisible();
  await expect(page.getByText('任务（2）')).toBeVisible();
  await expect(page.getByLabel('Run 任务列表')).toContainText('demo.publish · DomainCommand · Succeeded');
  await expect(page.getByLabel('Run 任务列表')).toContainText('demo.audit · Wait · Skipped');
  completedRunUrl=page.url();
  await page.goto(`/runs/${unknownRunId}`);
  await expect(page.getByText('RESOURCE_NOT_FOUND')).toBeVisible();
  await page.goto(completedRunUrl);
  await expect(page.getByText('强读 Run v2')).toBeVisible();
  await page.goto(`/missions/${missionId}`);
  await page.waitForTimeout(250);
  await page.request.get('http://127.0.0.1:18777/v1/testing/projection-update',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await page.request.get('http://127.0.0.1:18777/v1/testing/sse-disconnect',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await expect.poll(async()=>{
    const response=await page.request.get('http://127.0.0.1:18777/v1/testing/sse-state',{
      headers:{authorization:'Bearer browser-e2e'},
    });
    return /^mission-/.test((await response.json() as {lastEventId?:string}).lastEventId??'');
  },{timeout:8_000}).toBe(true);
  const summary=page.getByLabel('项目投影摘要');
  await expect(summary.locator('dd').nth(2)).toHaveText('4',{timeout:8_000});
  await expect(summary.locator('dd').nth(3)).toHaveText('2',{timeout:8_000});
  await expect(page.getByText('订阅状态：实时')).toBeVisible();
  await accessibility(page);
  const missionMetrics=await metrics(page);
  expect(missionMetrics.cls).toBeLessThanOrEqual(0.1);

  await page.goto('/decisions/00000000-0000-4000-8000-000000000011');
  await expect(page.getByRole('heading',{name:'Publish the approved customer brief?'})).toBeVisible();
  const approval=page.locator('section[aria-label="批准"]');
  await approval.getByLabel('审批理由').fill('Compliance check passed.');
  await approval.getByLabel('审批理由').press(' ');
  page.once('dialog',dialog=>void dialog.accept());
  await approval.getByRole('button',{name:'批准'}).click();
  await expect(page.getByText('当前状态 Approved')).toBeVisible();
  await expect(page.getByText('Approved').first()).toBeVisible();
  await accessibility(page);
  const decisionMetrics=await metrics(page);
  expect(decisionMetrics.lcp).toBeLessThanOrEqual(2_500);
  expect(decisionMetrics.cls).toBeLessThanOrEqual(0.1);
  expect(decisionMetrics.inp).toBeLessThanOrEqual(200);

  await page.goto('/');
  await expect(page.getByRole('heading',{name:'业务总览'})).toBeVisible();
  await expect(page.getByText('当前没有待处理责任。')).toBeVisible();
});

test('late response is rejected and organization context stays isolated',async({page})=>{
  await page.request.get('http://127.0.0.1:18777/v1/testing/reset-state',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  const decisionId='00000000-0000-4000-8000-000000000011';
  const actionId='00000000-0000-4000-8000-000000000021';
  const missionId='00000000-0000-4000-8000-000000000011';
  await page.goto('/inbox');
  await expect(page.getByRole('heading',{
    name:'Publish the approved customer brief?'})).toBeVisible();
  await expect(page.locator('p[role="status"]').filter({hasText:'刷新状态：实时'})).toBeVisible();
  await accessibility(page);
  await page.request.get('http://127.0.0.1:18777/v1/testing/inbox-consume',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await expect(page.getByText('无待办；可创建目标或等待新责任。')).toBeVisible({timeout:8_000});

  await page.goto('/actions');
  await expect(page.getByRole('heading',{name:/demo\.publish/})).toBeVisible();
  await expect(page.locator('p[role="status"]').filter({hasText:'刷新状态：实时'})).toBeVisible();
  await expect(page.getByText('对账中 · 结果待确认')).toBeVisible();
  await accessibility(page);

  await page.goto('/learning');
  await expect(page.getByRole('heading',{name:'Learning 治理'})).toBeVisible();
  await expect(page.getByText('model · model.prompt')).toBeVisible();
  await expect(page.getByText('Candidate').first()).toBeVisible();
  await expect(page.getByText('Queued · v1')).toBeVisible();
  await expect(page.getByText('Inconclusive · v1')).toBeVisible();
  await expect(page.getByRole('region',{name:'Learning Gates'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Learning Gate 00000000-0000-4000-8000-00000000003b'}))
    .toBeVisible();
  await expect(page.getByText('demo.accuracy 0.91–0.97')).toBeVisible();
  await expect(page.getByText('数据时点').first()).toBeVisible();
  await expect(page.getByRole('region',{name:'Assignments'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Paused · v1'})).toBeVisible();
  await expect(page.getByText('Superseded by the reviewed candidate; kept for rollback evidence.'))
    .toBeVisible();
  await accessibility(page);

  const retryForm=page.locator('section', {has:page.getByRole('heading',{name:'Inconclusive · v1'})})
    .locator('form.action-form');
  await retryForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByText('评测重试已受理')).toBeVisible();

  const releaseForm=page.getByLabel('Learning Gate 00000000-0000-4000-8000-00000000003b')
    .locator('form.action-form');
  await releaseForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByText('Learning Release 已受理')).toBeVisible();
  const assignmentSection=page.locator('section[aria-label^="Assignment "]',
    {has:page.getByRole('heading',{name:'Active · v1'})})
    .filter({has:page.getByLabel('暂停原因')});
  await expect(assignmentSection).toBeVisible();
  const pauseForm=assignmentSection.locator('form')
    .filter({has:page.getByLabel('暂停原因')});
  await pauseForm.getByLabel('暂停原因').fill('Release validation paused pending operations review.');
  page.once('dialog',dialog=>void dialog.accept());
  await pauseForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByRole('heading',{name:'Paused · v2'})).toBeVisible();
  await expect(page.getByText('可选择').first()).toBeVisible();
  await expect(page.getByText('Release validation paused pending operations review.')).toBeVisible();

  await releaseForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByRole('heading',{name:'Active · v1'})).toBeVisible();
  const rollbackForm=page.locator('form.action-form',
    {has:page.getByLabel('前继 Release')});
  await expect(rollbackForm).toBeVisible();
  await rollbackForm.getByLabel('回滚原因').fill('Canary regression; restore previous release.');
  page.once('dialog',dialog=>void dialog.accept());
  await rollbackForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByRole('heading',{name:'Active · v1'})).toBeVisible();
  await expect(page.getByText('回滚自 Release')).toBeVisible();

  const evaluationRequestForm=page.locator('form.action-form')
    .filter({has:page.getByLabel('Baseline Artifact ID')});
  await evaluationRequestForm.getByLabel('Baseline Artifact ID').fill(
    '00000000-0000-4000-8000-000000000037');
  await evaluationRequestForm.getByLabel('Baseline Version').fill('1');
  await evaluationRequestForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByText('评测请求已受理')).toBeVisible();
  await expect(page.getByRole('region',{name:'Evaluation Run 00000000-0000-4000-8000-000000000039'}))
    .toBeVisible();

  await page.goto(`/decisions/${decisionId}`);
  await expect(page.getByRole('heading',{
    name:'Publish the approved customer brief?'})).toBeVisible();
  await expect(page.getByText('当前状态 Pending')).toBeVisible();

  const approval=page.locator('section[aria-label="批准"]');
  await approval.getByLabel('审批理由').fill('Compliance check passed.');
  await page.request.get('http://127.0.0.1:18777/v1/testing/arm-late-response',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  page.once('dialog',dialog=>void dialog.accept());
  await approval.getByRole('button',{name:'批准'}).click();
  await expect(page.getByText('VERSION_CONFLICT')).toBeVisible();

  await page.reload();
  await expect(page.getByText('当前状态 Approved')).toBeVisible();
  await expect(page.getByRole('button',{name:'批准'})).toBeHidden();

  await page.goto(`/actions/${actionId}`);
  await expect(page.getByRole('heading',{name:'demo.publish'})).toBeVisible();
  await expect(page.getByText('订阅状态：实时')).toBeVisible();
  await expect(page.getByText('Reconciling').first()).toBeVisible();
  await accessibility(page);
  await page.request.get('http://127.0.0.1:18777/v1/testing/sse-disconnect',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await page.request.get('http://127.0.0.1:18777/v1/testing/action-update',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await expect(page.getByText('订阅状态：实时')).toBeVisible({timeout:8_000});
  await expect(page.getByText('Closed').first()).toBeVisible({timeout:8_000});
  await expect(page.getByText('Succeeded').first()).toBeVisible();
  await expect(page.getByText('服务端状态已变更')).toBeVisible();

  await page.request.get('http://127.0.0.1:18777/v1/testing/action-update-failed',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await page.reload();
  const compensationForm=page.locator('form.action-form');
  await expect(compensationForm.getByRole('button',{name:'提交补偿提案'})).toBeVisible();
  await compensationForm.getByLabel('Publication Id', {exact:false}).fill('publication-1');
  await compensationForm.getByRole('button',{name:'提交补偿提案'}).click();
  await expect(page.getByText('补偿提案已受理')).toBeVisible();

  await page.goto(`/missions/${missionId}`);
  const cancelMissionForm=page.locator('form')
    .filter({has:page.getByLabel('取消理由')});
  await cancelMissionForm.getByLabel('取消理由').fill('Publication failed; stop this mission.');
  page.once('dialog',dialog=>void dialog.accept());
  await cancelMissionForm.getByRole('button',{name:'确认提交'}).click();
  await expect(page.getByText('取消请求已受理')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'确认提交'})).toBeHidden();
  await accessibility(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading',{name:'组织设置'})).toBeVisible();
  await expect(page.getByText('审批自动化 · assistive · 停用')).toBeVisible();
  await expect(page.getByText('停用')).toBeVisible();
  const automationForm=page.getByRole('button',{name:'提交治理命令'}).locator('xpath=ancestor::form');
  await automationForm.getByLabel('命令输入 JSON').fill('{"automationKey":"demo.agent","enabled":true}');
  page.once('dialog',dialog=>void dialog.accept());
  await automationForm.getByRole('button',{name:'提交治理命令'}).click();
  await expect(page.getByText('治理命令已提交')).toBeVisible();
  await expect(page.getByText('审批自动化 · assistive · 启用')).toBeVisible();
  await page.reload();
  await expect(page.getByText('审批自动化 · assistive · 启用')).toBeVisible();
  await accessibility(page);

  await page.getByLabel('切换组织上下文').selectOption({label:'Organization B'});
  await page.getByRole('button',{name:'切换'}).click();
  await expect(page.getByRole('heading',{name:'业务总览'})).toBeVisible();
  await expect(page.getByText('暂无目标项目。')).toBeVisible();
  await expect(page.getByText('当前没有待处理责任。')).toBeVisible();
  await expect(page.getByText('Organization A')).toBeHidden();

  await page.goto(`/decisions/${decisionId}`);
  await expect(page.getByText('FORBIDDEN')).toBeVisible();
  await expect(page.getByRole('heading',{
    name:'Publish the approved customer brief?'})).toBeHidden();
  await page.goto(completedRunUrl);
  await expect(page.getByText('FORBIDDEN')).toBeVisible();
  await expect(page.getByRole('heading',{name:'demo.trigger'})).toBeHidden();

  await page.goto('/settings');
  await expect(page.getByText('FORBIDDEN')).toBeVisible();
});

test('Run status follows an authorized same-origin SSE change',async({page})=>{
  await page.request.get('http://127.0.0.1:18777/v1/testing/reset-state',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await page.goto(`/runs/${runningRunId}`);
  await expect(page.getByRole('heading',{name:'cancel.trigger'})).toBeVisible();
  await expect(page.getByText('Running · 版本 1')).toBeVisible();
  await expect(page.getByText('订阅状态：实时')).toBeVisible();

  const trigger=await page.request.get(
    'http://127.0.0.1:18777/v1/testing/run-complete',{
      headers:{authorization:'Bearer browser-e2e'},
    });
  expect(trigger.ok()).toBeTruthy();

  await expect(page.getByText('Completed · 版本 2')).toBeVisible({timeout:8_000});
  await expect(page.getByText('Run 已变更')).toBeVisible();
});

test('Action list follows an authorized organization SSE change',async({page})=>{
  const actionId='00000000-0000-4000-8000-000000000021';
  await page.request.get('http://127.0.0.1:18777/v1/testing/reset-state',{
    headers:{authorization:'Bearer browser-e2e'},
  });
  await page.goto('/actions');
  await expect(page.getByRole('heading',{name:/demo\.publish/})).toBeVisible();
  await expect(page.locator('p[role="status"]').filter({hasText:'刷新状态：实时'})).toBeVisible();
  await expect(page.getByText('对账中 · 结果待确认')).toBeVisible();

  const trigger=await page.request.get(
    'http://127.0.0.1:18777/v1/testing/organization-action-update',{
      headers:{authorization:'Bearer browser-e2e'},
    });
  expect(trigger.ok()).toBeTruthy();
  await expect(page.getByText('已关闭 · 成功')).toBeVisible({timeout:8_000});
});
