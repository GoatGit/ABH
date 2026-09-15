import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:375,height:812}});
const routes=[['/decisions_','/decisions/00000000-0000-4000-8000-000000000011'],['/learning','/learning'],['/settings','/settings']];
for(const [name,path] of routes){
  try{
    await page.goto(`http://127.0.0.1:3100${path}`,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(2500);
    const m=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    if(m.sw>m.cw+2)problems_narrow.push(`${path}: ${m.sw}>${m.cw}`);
    await page.screenshot({path:`/tmp/shots-narrow/n${name.replace(/\//g,'_')}.png`});
    console.log('shot',name,'sw='+m.sw);
  }catch(error){problems_narrow.push(`${path}: ${error.message.slice(0,50)}`);}
}
await browser.close();
