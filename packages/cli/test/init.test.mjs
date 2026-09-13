import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,stat,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {resolveDevelopmentConfig} from '@abh/contracts/config';
import {runInit} from '../src/init.mjs';

async function invoke(args){let stdout='',stderr='';const code=await runInit(args,{stdout:{write:value=>{stdout+=value;}},stderr:{write:value=>{stderr+=value;}}});return {code,stdout,stderr};}
async function temporary(){const root=await mkdtemp(join(tmpdir(),'abh-init-'));return {root,cleanup:()=>rm(root,{recursive:true,force:true})};}

test('abh init validates input and creates a contract-valid development project',async t=>{
  for(const args of [[],['--template','unknown'],['--template','action-only','--unknown','x'],
    ['--template','action-only','--directory','x','--directory','y'],['--template','action-only','--format','yaml'],
    ['--template','action-only','--force','--force'],['--template','action-only','--force','extra']]){
    const out=await invoke(args);assert.equal(out.code,2);assert.equal(out.stdout,'');
  }
  const {root,cleanup}=await temporary();t.after(cleanup);const directory=join(root,'project');
  const result=await invoke(['--template','action-only','--directory',directory,'--format','json']);
  assert.equal(result.code,0);const record=JSON.parse(result.stdout);assert.equal(record.status,'Created');
  assert.deepEqual(record.files.map(item=>item.path).sort(),['.env.example','README.md','abh.config.json','business.ts','package.json','tsconfig.json']);
  const config=JSON.parse(await readFile(join(directory,'abh.config.json'),'utf8'));
  assert.equal(resolveDevelopmentConfig(config.value).success,true);
  assert.deepEqual(record.environmentReferences,['ABH_DATABASE_RUNTIME_URL','ABH_DATABASE_QUEUE_URL']);
  assert.equal((await stat(join(directory,'business.ts'))).mode&0o777,0o600);
});

test('abh init creates a contract-valid hello-business SDK project',async t=>{
  const root=await mkdtemp(join(process.cwd(),'.tmp-hello-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'hello');
  const result=await invoke(['--template','hello-business','--directory',directory,'--format','json']);
  assert.equal(result.code,0);const record=JSON.parse(result.stdout);assert.equal(record.status,'Created');
  assert.deepEqual(record.files.map(item=>item.path).sort(),['.env.example','README.md','abh.config.json','business.mjs','compile-pack.mjs','example.mjs','package.json'].sort());
  const config=JSON.parse(await readFile(join(directory,'abh.config.json'),'utf8'));
  assert.equal(resolveDevelopmentConfig(config.value).success,true);assert.equal(config.value.runtime.businessEntry,'./business.mjs');
  const business=await import(pathToFileURL(join(directory,'business.mjs')));
  assert.match(business.business.digest,/^sha256:[0-9a-f]{64}$/);
  const core=await import('@abh/core');
  assert.deepEqual(core.validateBusinessInput(business.business,'hello.publish',{message:'approved'}),{message:'approved'});
  const stdout=[];const originalWrite=console.log;console.log=value=>stdout.push(value);
  try{await import(pathToFileURL(join(directory,'compile-pack.mjs')));}finally{console.log=originalWrite;}
  const build=JSON.parse(stdout.at(-1));
  assert.equal(build.packId,'hello.business');assert.match(build.packageDigest,/^sha256:[0-9a-f]{64}$/);assert.equal(build.ctkStatus,'NotRun');
  const manifest=JSON.parse(await readFile(join(directory,'pack/manifest.json'),'utf8'));
  const ctk=JSON.parse(await readFile(join(directory,'pack/ctk-plan.json'),'utf8'));
  const contracts=await import('@abh/contracts/schema');
  assert.equal(contracts.validateContract('PackManifest',manifest).success,true);
  assert.equal(ctk.status,'NotRun');assert.deepEqual(ctk.claimedCapabilities,manifest.capabilities.provides);
});

test('abh init refuses non-empty directories unless force shows bounded template diffs',async t=>{
  const {root,cleanup}=await temporary();t.after(cleanup);const directory=join(root,'project');
  await mkdir(directory);await writeFile(join(directory,'user.json'),'keep\n');
  const denied=await invoke(['--template','action-only','--directory',directory]);assert.equal(denied.code,4);
  assert.equal(denied.stderr,'abh init: TARGET_NOT_EMPTY\n');assert.deepEqual(await readdir(directory),['user.json']);
  await writeFile(join(directory,'README.md'),'custom\n');
  const forced=await invoke(['--template','action-only','--directory',directory,'--force']);
  assert.equal(forced.code,0);assert.match(forced.stdout,/--- a\/README.md/);assert.match(forced.stdout,/\+# ABH Action-only project/);
  assert.equal(await readFile(join(directory,'user.json'),'utf8'),'keep\n');
  assert.equal(await readFile(join(directory,'README.md'),'utf8').then(value=>value.startsWith('# ABH Action-only project')),true);
});

test('abh init never follows a non-regular template target',async t=>{
  const {root,cleanup}=await temporary();t.after(cleanup);const directory=join(root,'project'),outside=join(root,'outside');
  await mkdir(directory);await mkdir(outside);await writeFile(join(outside,'secret'),'secret');await symlink(join(outside,'secret'),join(directory,'README.md'));
  const forced=await invoke(['--template','action-only','--directory',directory,'--force']);
  assert.equal(forced.code,2);assert.equal(await readFile(join(outside,'secret'),'utf8'),'secret');
});

test('abh init keeps JSON machine output valid while force previews remain text-only',async t=>{
  const {root,cleanup}=await temporary();t.after(cleanup);const directory=join(root,'project');
  await mkdir(directory);await writeFile(join(directory,'README.md'),'custom\n');
  const result=await invoke(['--template','action-only','--directory',directory,'--force','--format','json']);
  assert.equal(result.code,0);const record=JSON.parse(result.stdout);
  assert.equal(record.status,'Updated');assert.equal(record.commandRef,null);assert.deepEqual(record.evidenceRefs,[]);
  assert.ok(!result.stdout.includes('custom\n'));
});
