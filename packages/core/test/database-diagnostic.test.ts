import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createDatabaseFixture} from './database-fixture.ts';
import {inspectDatabaseReadiness} from '../src/diagnostics.ts';
const execute=promisify(execFile);
test('doctor data CLI checks actual restricted storage, classifies drift and closes connections',{timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const run=async(url=f.runtimeUrl)=>{
  try{const result=await execute(process.execPath,[new URL('../../cli/bin/abh.mjs',import.meta.url).pathname,'doctor','data','--format','json'],{env:{...process.env,ABH_DATABASE_RUNTIME_URL:url,PGHOST:'invalid.example',PGPORT:'1',PGDATABASE:'wrong-database',PGUSERNAME:'wrong-user',PGPASSWORD:'ambient-secret',PGSSL:'require',PGDEBUG:'true',PGTARGETSESSIONATTRS:'invalid-setting'},timeout:15000});return {...result,code:0};}
  catch(error){const value=error as {code:number;stdout:string;stderr:string};assert.equal(typeof value.code,'number');return value;}
 };
 const passed=await run();assert.equal(passed.code,0);assert.equal(passed.stderr,'');assert.deepEqual(JSON.parse(passed.stdout),{commandRef:null,status:'Passed',errorCode:null,evidenceRefs:[],checkId:'data.security-manifest',violationCount:0,remediation:null});
 await f.admin`GRANT SELECT ON data.artifacts TO abh_queue`;
 try{const failed=await run();assert.equal(failed.code,4);assert.equal(JSON.parse(failed.stdout).errorCode,'PRECONDITION_FAILED');assert.ok(JSON.parse(failed.stdout).violationCount>0);assert.ok(!failed.stdout.includes(f.runtimeUrl));assert.ok(!failed.stdout.includes('data.artifacts'));}
 finally{await f.admin`REVOKE SELECT ON data.artifacts FROM abh_queue`;}
 const wrong=new URL(f.runtimeUrl);wrong.password='secret-diagnostic-wrong-password';const denied=await run(wrong.href);assert.equal(denied.code,3);assert.ok(!JSON.stringify(denied).includes(wrong.password));
 const signal=new AbortController().signal;
 const inspect=()=>inspectDatabaseReadiness({connectionString:f.runtimeUrl,signal,timeoutMs:200});
 await f.admin.begin(async sql=>{await sql`LOCK TABLE extension.schema_ownership IN ACCESS EXCLUSIVE MODE`;const timed=await inspect();assert.equal(timed.errorCode,'DEPENDENCY_TIMEOUT');});
 assert.equal((await inspectDatabaseReadiness({connectionString:f.runtimeUrl,signal,timeoutMs:10000})).status,'Passed');
 await f.admin.begin(async sql=>{
  await sql`LOCK TABLE extension.schema_ownership IN ACCESS EXCLUSIVE MODE`;
  const child=spawn(process.execPath,[new URL('../../cli/bin/abh.mjs',import.meta.url).pathname,'doctor','data','--format','json'],{env:{...process.env,ABH_DATABASE_RUNTIME_URL:f.runtimeUrl},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{
   let waiting=false;
   for(let i=0;i<100;i++){
    await sql`SELECT pg_stat_clear_snapshot()`;
    const rows=await sql`SELECT 1 FROM pg_stat_activity WHERE application_name='abh-doctor-data' AND wait_event_type='Lock'`;
    if(rows.length){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.equal(waiting,true,'cancel an actual blocked diagnostic process');
   child.kill('SIGTERM');assert.deepEqual(await exited,{code:6,signal:null});assert.equal(JSON.parse(stdout).errorCode,'DEPENDENCY_TIMEOUT');assert.equal(stderr,'abh doctor data: DEPENDENCY_TIMEOUT\n');
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill('SIGKILL');await exited;}
 });
 const active=await f.admin`SELECT 1 FROM pg_stat_activity WHERE application_name='abh-doctor-data'`;assert.equal(active.length,0);
 await f.database.verify();
});
test('database diagnostics reject malformed configuration and pre-cancelled calls',async()=>{
 const signal=new AbortController().signal;
 for(const connectionString of ['not a URL','https://secret@example.com','postgres:///db','postgres://runtime@localhost/db?default_transaction_read_only=off','postgres://runtime@localhost/db?sslmode=disable&sslmode=require','postgres://runtime@localhost/db?unknown=secret'])assert.equal((await inspectDatabaseReadiness({connectionString,signal})).errorCode,'INVALID_ARGUMENT');
 assert.equal((await inspectDatabaseReadiness({connectionString:'postgres://runtime:secret@localhost/db',signal:AbortSignal.abort()})).errorCode,'DEPENDENCY_TIMEOUT');
});
