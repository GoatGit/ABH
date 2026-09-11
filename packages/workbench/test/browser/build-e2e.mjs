import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import process from 'node:process';

const install='src/lib/identity-install.ts';
process.env.WORKBENCH_E2E='1';
process.env.WEB_SSE_ENABLED='true';
let original;

try{
  original=await readFile(install,'utf8');
  const fixture=await readFile('test/browser/fixture-identity-install.ts','utf8');
  await writeFile(install,fixture);
  await new Promise((resolve,reject)=>{
    const child=spawn('pnpm',['exec','next','build'],{stdio:'inherit'});
    child.on('exit',code=>code===0?resolve(undefined):reject(new Error(`next build exited ${code}`)));
  });
}finally{
  await writeFile(install,original);
}
