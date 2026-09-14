import {chromium} from '@playwright/test';

const routes=[
  ['overview','/'],
  ['inbox','/inbox'],
  ['actions','/actions'],
  ['action-detail','/actions/00000000-0000-4000-8000-000000000021'],
  ['action-failed','/actions/00000000-0000-4000-8000-000000000024'],
  ['decision','/decisions/00000000-0000-4000-8000-0000000000d2'],
  ['decision-approved','/decisions/00000000-0000-4000-8000-0000000000d9'],
  ['mission-active','/missions/00000000-0000-4000-8000-000000000011'],
  ['mission-blocked','/missions/00000000-0000-4000-8000-000000000013'],
  ['mission-draft','/missions/00000000-0000-4000-8000-000000000014'],
  ['run-waiting','/runs/00000000-0000-4000-8000-000000000074'],
  ['learning','/learning'],
  ['settings','/settings'],
];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`${page.url()} :: ${message.text()}`);});
for(const [name,path] of routes){
  await page.goto(`http://127.0.0.1:3100${path}`,{waitUntil:'networkidle',timeout:60000})
    .catch(error=>errors.push(`${path} :: goto ${error.message}`));
  await page.waitForTimeout(1200);
  await page.screenshot({path:`/tmp/shots/${name}.png`,fullPage:false});
  console.log('shot',name);
}
console.log('console errors:',errors.length);
for(const error of errors.slice(0,10))console.log('ERR:',error.slice(0,200));
await browser.close();
