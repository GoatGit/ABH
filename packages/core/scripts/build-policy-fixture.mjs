import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const executable=process.env.ABH_OPA_PATH;
if(!executable)throw new Error('Set ABH_OPA_PATH to the verified OPA 1.20.2 executable.');
const version=execFileSync(executable,['version'],{encoding:'utf8'});
if(!version.includes('Version: 1.20.2\n')||!version.includes('Build Commit: b2c26708e9d55645d7f837db495031f7e4152594\n'))throw new Error('OPA build version differs from the reviewed fixture compiler.');
const directory=fileURLToPath(new URL('../test/fixtures/',import.meta.url)),source=join(directory,'policy.rego');
const work=mkdtempSync(join(tmpdir(),'abh-opa-fixture-'));
const entrypoints=['decision','empty_behavior','malformed','undefined_decision','host_time','slow','action_decision','scope_decision'].map(name=>`abh_fixture/${name}`);
try{
  const bundle=join(work,'bundle.tar.gz');
  execFileSync(executable,['build','-t','wasm',...entrypoints.flatMap(name=>['-e',name]),'-o',bundle,source]);
  const bytes=execFileSync('tar',['-xzOf',bundle,'/policy.wasm'],{maxBuffer:4_194_304});
  const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  writeFileSync(join(directory,'policy.wasm'),bytes);
  writeFileSync(join(directory,'policy-provenance.json'),JSON.stringify({compiler:'OPA',version:'1.20.2',commit:'b2c26708e9d55645d7f837db495031f7e4152594',sourceDigest:hash(readFileSync(source)),wasmDigest:hash(bytes),entrypoints},null,2)+'\n');
}finally{rmSync(work,{recursive:true,force:true});}
