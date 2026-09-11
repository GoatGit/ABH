import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {createErrorResponse} from '@abh/contracts/errors';
import {validateContract} from '@abh/contracts/schema';
import {runDoctor} from '../src/doctor.mjs';
const id='11111111-1111-4111-8111-111111111111',token='fixture-inspection-token';
const diagnostic={jobRef:{type:'abh.pack-inspection-job',id,version:1},status:'Pending',assessedAt:'2026-09-09T00:00:00Z',nextStep:'AwaitDelivery',evidenceRefs:[],elapsedMs:0,remainingDurationMs:30000,remainingAttempts:3};
async function invoke(env,flags=[],signal=new AbortController().signal){let stdout='',stderr='';const code=await runDoctor(['doctor','inspection','--format','json','--id',id,...flags],{env,signal,stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}}});const value=JSON.parse(stdout);assert.equal(validateContract('CliInspectionDiagnosticResult',value).success,true);assert.ok(!(stdout+stderr).includes(token));return {code,value,stderr};}
test('inspection CLI uses bounded authenticated GET and reports diagnostics without claiming job success',async t=>{
 let mode='success',calls=0,redirected=0;
 const server=createServer((request,response)=>{
  calls++;assert.equal(request.method,'GET');assert.equal(request.headers.authorization,`Bearer ${token}`);
  const url=new URL(request.url,'http://localhost');assert.equal(url.pathname,'/v1/queries/abh.pack-inspection-jobs.inspect');assert.equal(url.searchParams.get('id'),id);assert.equal(url.searchParams.get('consistency'),'Strong');
  if(mode==='hang')return;
  if(mode==='redirect'){response.writeHead(302,{location:'/forbidden'}).end();return;}
  if(request.url==='/forbidden')redirected++;
  response.setHeader('content-type','application/json');
  if(mode==='denied'){response.statusCode=403;response.end(JSON.stringify(createErrorResponse('FORBIDDEN',id)));return;}
  if(mode==='large'){response.end(' '.repeat(70000)+JSON.stringify({success:true,data:diagnostic,meta:{asOf:diagnostic.assessedAt,watermark:'fixture',stale:false}}));return;}
  if(mode==='invalid'){response.end(JSON.stringify({secret:token}));return;}
  const data=structuredClone(diagnostic);if(mode==='wrong-job')data.jobRef.id='22222222-2222-4222-8222-222222222222';
  if(mode==='failed-job'){data.status='Failed';data.nextStep='Terminal';}
  response.end(JSON.stringify({success:true,data,meta:{asOf:mode==='wrong-time'?'2026-09-08T00:00:00Z':data.assessedAt,watermark:'pack-inspection-source/fixture',stale:mode==='stale'}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const env={ABH_API_BASE_URL:`http://127.0.0.1:${server.address().port}`,ABH_API_TOKEN:token};
 const result=await invoke(env);assert.equal(result.code,0);assert.equal(result.value.status,'Reported');assert.equal(result.value.diagnostic.status,'Pending');assert.equal(result.value.commandRef,null);assert.deepEqual(result.value.evidenceRefs,[]);assert.equal(result.stderr,'');
 mode='failed-job';const terminal=await invoke(env);assert.equal(terminal.code,0);assert.equal(terminal.value.status,'Reported');assert.equal(terminal.value.diagnostic.status,'Failed');
 mode='denied';assert.equal((await invoke(env)).code,3);
 for(mode of ['wrong-job','wrong-time','stale','invalid','large','redirect']){const rejected=await invoke(env);assert.equal(rejected.code,6);assert.equal(rejected.value.diagnostic,null);}
 assert.equal(redirected,0);
 mode='hang';const timeout=await invoke(env,['--timeout-ms','100']);assert.equal(timeout.code,6);assert.equal(timeout.value.errorCode,'DEPENDENCY_TIMEOUT');server.closeAllConnections();
 const before=calls;
 for(const flags of [['--unknown','secret'],['--id',id],['--timeout-ms','99'],['--timeout-ms','1e3']])assert.equal((await invoke(env,flags)).code,2);
 for(const invalid of [{...env,ABH_API_TOKEN:'bad\r\nsecret'},{...env,ABH_API_BASE_URL:'http://example.com'},{...env,ABH_API_BASE_URL:'https://user:secret@example.com'},{...env,ABH_API_BASE_URL:'https://example.com/?secret=true'},{...env,ABH_API_TOKEN:undefined}])assert.equal((await invoke(invalid)).code,2);
 assert.equal((await invoke(env,[],AbortSignal.abort())).value.errorCode,'DEPENDENCY_TIMEOUT');assert.equal(calls,before);
});
