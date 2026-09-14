import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {parseRunOptions,runServer} from '../src/run.mjs';

const config={schema:'DevelopmentConfig',value:{
  deployment:{profile:'Development'},identity:{provider:'Fake'},
  database:{runtimeUrlRef:'env:ABH_TEST_RUNTIME',queueUrlRef:'env:ABH_TEST_QUEUE'},
  runtime:{businessEntry:'./business-fixture.mjs',mode:'ActionOnly'},web:{enabled:false}}};

test('abh run parses strict options and help without importing runtime dependencies',()=>{
  assert.equal(parseRunOptions(['--help']).flags['--help'],true);
  assert.equal(parseRunOptions(['--config','a','--config','b']).error,'INVALID_ARGUMENT');
  assert.equal(parseRunOptions(['--unknown','x']).error,'INVALID_ARGUMENT');
  assert.equal(parseRunOptions(['--port']).error,'INVALID_ARGUMENT');
});

test('abh run requires valid config and protected environment references',async t=>{
  const root=await mkdtemp(join(tmpdir(),'abh-run-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'abh.config.json'),io={stdout:{write(){}},stderr:{write(){}},signal:AbortSignal.abort()};
  const help={...io,env:{}};
  assert.equal(await runServer(['--help'],help),0);
  await writeFile(path,JSON.stringify({schema:'Other',value:{}}));
  assert.equal(await runServer(['--config',path],io),6);
  await writeFile(path,JSON.stringify(config));
  assert.equal(await runServer(['--config',path],io),6);
  const env={ABH_TEST_RUNTIME:'postgresql://runtime',ABH_TEST_QUEUE:'postgresql://queue'};
  assert.equal(await runServer(['--config',path,'--port','70000'],{...io,env}),6);
  await writeFile(join(root,'missing.mjs'),'export const x=1');
  assert.equal(await runServer(['--config',path],{...io,env}),6);
});

test('abh run invokes explicit deployment installation without defaults',async t=>{
  const root=await mkdtemp(join(tmpdir(),'abh-run-live-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'abh.config.json'),business=join(root,'business-fixture.mjs');
  await writeFile(path,JSON.stringify(config));
  const calls=[];
  await writeFile(business,`export async function createAbhServiceInstallation(input){
    globalThis.__abhRunInstallerInput=input;return {
      identity:{provider:{verify:async()=>({status:'Rejected'})},issuer:'https://idp.example',audience:'abh'},
      credentials:async()=>({credentialRef:{type:'abh.credential',id:'00000000-0000-4000-8000-000000000000',version:1},organizationId:'00000000-0000-4000-8000-000000000000',purpose:'abh.runtime.deliver'}),
      mission:{grants:async()=>[]},
      runtime:{queue:{drain:async()=>({status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}}),close:async()=>calls.push('queue')},drainRequest:async()=>({}),recordDrain:async()=>calls.push('drain')}
    };
  }`);
  const server=async()=>({Database:{connect:async()=>{calls.push('database');return {close:async()=>{}};}},
    IdentityIngress:class{constructor(){calls.push('identity');}},
    assembleAbhService:()=>({app:{}}),runHttpService:async input=>{calls.push('service');return input;}});
  const code=await runServer(['--config',path,'--host','127.0.0.1','--port','0'],{
    env:{ABH_TEST_RUNTIME:'postgresql://runtime',ABH_TEST_QUEUE:'postgresql://queue'},
    stdout:{write(){}},stderr:{write(value){calls.push(value);}},signal:AbortSignal.abort()},
    {business:()=>import(business),server,signals:{signal:AbortSignal.abort()}});
  assert.equal(code,0);
  assert.equal(globalThis.__abhRunInstallerInput.credentials.runtimeDatabaseUrl,'postgresql://runtime');
  assert.deepEqual(calls.filter(value=>typeof value==='string'),['database','identity','service']);
});

test('abh run resolves businessEntry relative to the config file directory',async t=>{
  const root=await mkdtemp(join(tmpdir(),'abh-run-cwd-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'abh.config.json');
  await writeFile(path,JSON.stringify(config));
  await writeFile(join(root,'business-fixture.mjs'),
    'export async function createAbhServiceInstallation(){throw new Error(\'INSTALLER_MARKER\');}');
  const stderr=[];
  const code=await runServer(['--config',path],{
    env:{ABH_TEST_RUNTIME:'postgresql://runtime',ABH_TEST_QUEUE:'postgresql://queue'},
    stdout:{write(){}},stderr:{write(value){stderr.push(String(value));}},signal:AbortSignal.abort()});
  assert.equal(code,6);
  // The business module must load (installation failure, not module-unavailable)
  // even when the process cwd differs from the config file's directory.
  assert.ok(stderr.join('').includes('BUSINESS_INSTALLATION_FAILED'),stderr.join(''));
});

test('the real @abh/core/server module exposes every symbol abh run composes',async()=>{
  const server=await import('@abh/core/server');
  for(const symbol of ['Database','IdentityIngress','assembleAbhService','runHttpService'])
    assert.equal(typeof server[symbol],'function',`missing export: ${symbol}`);
});
