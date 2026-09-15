import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:375,height:812}});
const routes=['/','/inbox','/actions','/missions/00000000-0000-4000-8000-000000000011','/runs/00000000-0000-4000-8000-000000000011','/decisions/00000000-0000-4000-8000-000000000011','/learning','/settings'];
const problems=[];
for(const path of routes){
  try{
    await page.goto(`http://127.0.0.1:3100${path}`,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(2000);
    const metrics=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    if(metrics.sw>metrics.cw+2)problems.push(`${path}: scroll ${metrics.sw} > client ${metrics.cw}`);
    const name=path==='/'?'root':path.replace(/\//g,'_').slice(0,30);
    await page.screenshot({path:`/tmp/shots-narrow/${name}.png`});
    console.log('shot',name,`sw=${metrics.sw}`);
  }catch(error){problems.push(`${path}: ${error.message.slice(0,60)}`);}
}
console.log('problems:',problems.length?problems:'none');
await browser.close();
