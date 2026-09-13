import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import process from 'node:process';

const install='src/lib/identity-install.ts';
const original=await readFile(install,'utf8');
let child;
try{
  await writeFile(install,await readFile('test/browser/fixture-identity-install.ts','utf8'));
  child=spawn('./node_modules/.bin/next',['start','-p','18778'],{
    stdio:'inherit',env:process.env,
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  await new Promise((resolve,reject)=>{
    child.on('exit',code=>code===0?resolve(undefined):reject(
      new Error(`next start exited ${code}`)));
    child.on('error',reject);
  });
}finally{
  await writeFile(install,original);
  child?.removeAllListeners();
}
