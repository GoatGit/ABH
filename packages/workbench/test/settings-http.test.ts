import assert from 'node:assert/strict';
import {test} from 'node:test';
import {currentSettingsAdapter} from '../src/lib/settings-install.ts';
import {createHttpSettingsAdapter} from '../src/lib/settings-http.ts';

const organizationId='00000000-0000-4000-8000-000000000001';
const command={
  key:'rotate-connection',label:'轮换连接',description:'宿主声明的治理命令',
  requiresConfirmation:true,
  inputSchema:{type:'object',required:['connectionId'],additionalProperties:false,
    properties:{connectionId:{type:'string',minLength:1}}},
};
const view={
  asOf:'2026-09-11T00:00:00.000Z',source:'production settings service',
  organization:{organizationId,label:'Example',collaborationBoundary:'same organization'},
  members:[],purposes:[],connections:[],automation:[],commands:[command],
};
const session={
  actorId:'00000000-0000-4000-8000-0000000000a1',
  actingOrganizationId:organizationId,resourceOrganizationId:organizationId,
  purposeOfUse:'abh.governance.manage',authorizationDigest:'auth-1',
  apiHeaders:async()=>({authorization:'Bearer server-only-token'}),
} as never;

function jsonResponse(value:unknown,init:ResponseInit={}):Response{
  return new Response(JSON.stringify(value),{...init,
    headers:{'content-type':'application/json',...init.headers}});
}

test('http settings adapter resolves an authorized bounded snapshot',async()=>{
  const calls:string[]=[];
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls.push(String(input));
    assert.equal(init?.method,'POST');
    assert.equal(init?.credentials,'omit');
    assert.equal(init?.redirect,'error');
    const headers=new Headers(init?.headers);
    assert.equal(headers.get('authorization'),'Bearer server-only-token');
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
    assert.equal(body.actorId,'00000000-0000-4000-8000-0000000000a1');
    assert.equal(body.actingOrganizationId,organizationId);
    assert.equal(body.authorizationDigest,'auth-1');
    return jsonResponse(view);
  };
  const adapter=createHttpSettingsAdapter({
    endpoint:'https://settings.example/workbench/settings/',fetch:fetcher,maxResponseBytes:262_144,
  });
  const resolved=await adapter.resolve({session});
  assert.equal(resolved?.source,'production settings service');
  assert.equal(calls[0],'https://settings.example/workbench/settings/resolve');
});

test('http settings commands reauthorize and bind an idempotency key',async()=>{
  const requestBodies:unknown[]=[];const idempotencyKeys:string[]=[];
  const adapter=createHttpSettingsAdapter({endpoint:'https://settings.example/governance',
    maxResponseBytes:262_144,
    fetch:async(input,init)=>{
      const headers=new Headers(init?.headers);
      requestBodies.push(JSON.parse(String(init?.body)));
      if(String(input).endsWith('/resolve'))return jsonResponse(view);
      idempotencyKeys.push(headers.get('idempotency-key')??'');
      return jsonResponse({success:true});
    }});
  await adapter.execute({session,commandKey:'rotate-connection',
    requestId:'request-0001',input:{connectionId:'connection-1'}});
  assert.equal(requestBodies.length,2);
  assert.deepEqual(requestBodies[1],{requestId:'request-0001',
    input:{connectionId:'connection-1'}});
  assert.deepEqual(idempotencyKeys,['request-0001']);
});

test('http settings adapter denies unregistered commands and non-json responses',async()=>{
  let resolves=0;
  const adapter=createHttpSettingsAdapter({endpoint:'https://settings.example',
    maxResponseBytes:262_144,
    fetch:async(input)=>{
      if(String(input).endsWith('/resolve')){
        resolves+=1;
        return resolves===1?jsonResponse(view):new Response('ok',
          {headers:{'content-type':'text/plain'}});
      }
      return jsonResponse({success:true});
    }});
  await assert.rejects(adapter.execute({session,commandKey:'unknown-command',
    requestId:'request-0001',input:{}}),/^SettingsHttpError: Settings request failed\.$/);
  await assert.rejects(adapter.resolve({session}),/^SettingsHttpError: Settings request failed\.$/);
});

test('http settings responses are bounded and production install denies without URL',async()=>{
  const bounded=createHttpSettingsAdapter({endpoint:'https://settings.example',
    maxResponseBytes:64,
    fetch:async()=>new Response('x'.repeat(65),{headers:{'content-type':'application/json'}})});
  await assert.rejects(bounded.resolve({session}));
  delete process.env.WORKBENCH_SETTINGS_URL;
  const adapter=currentSettingsAdapter();
  assert.equal(await adapter.resolve({session}),null);
  await assert.rejects(adapter.execute({session,commandKey:'rotate-connection',
    requestId:'request-0001',input:{}}),/^Error: FORBIDDEN$/);
});
