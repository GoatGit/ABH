import assert from 'node:assert/strict';
import {test} from 'node:test';
import {currentCompensationAdapter} from '../src/lib/compensation-install.ts';
import {createHttpCompensationAdapter} from '../src/lib/compensation-http.ts';

const organizationId='00000000-0000-4000-8000-000000000001';
const actionId='00000000-0000-4000-8000-000000000021';
const ref=(type:string,id:string)=>({type,id,version:1});
const template={
  key:'demo.compensate',label:'撤销发布',description:'Revoke the failed publication.',
  actionType:'demo.retract-publication',
  targetRefs:[ref('abh.artifact','00000000-0000-4000-8000-000000000031')],
  sourceVersionRefs:[ref('abh.action',actionId)],
  artifact:{ownerRef:ref('abh.organization',organizationId),dataClass:'publication.record',
    purposeNames:['abh.runtime.deliver'],sourceRefs:[ref('abh.action',actionId)],
    region:'global',retentionPolicyRef:ref('abh.retention-policy','00000000-0000-4000-8000-000000000041')},
  inputSchema:{type:'object',required:['publicationId'],additionalProperties:false,
    properties:{publicationId:{type:'string',minLength:1}}},
  uiSchema:{type:'VerticalLayout',elements:[]},
  initialData:{publicationId:'publication-1'},
};
const action={actionRef:{type:'abh.action',id:actionId,version:4}} as never;
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

test('http compensation adapter resolves an authorized action-bound template',async()=>{
  const calls:string[]=[];
  const adapter=createHttpCompensationAdapter({
    endpoint:'https://compensation.example/workbench/',fetch:async(input,init)=>{
      calls.push(String(input));
      assert.equal(init?.method,'POST');
      assert.equal(init?.credentials,'omit');
      assert.equal(init?.redirect,'error');
      const headers=new Headers(init?.headers);
      assert.equal(headers.get('authorization'),'Bearer server-only-token');
      const body=JSON.parse(String(init?.body));
      assert.equal(body.actionId,actionId);
      assert.equal(body.actionVersion,4);
      assert.equal('action' in body,false);
      assert.equal('apiHeaders' in body,false);
      return jsonResponse(template);
    }});
  const resolved=await adapter.resolve(session,{action});
  assert.equal(resolved?.key,'demo.compensate');
  assert.equal(calls[0],'https://compensation.example/workbench/resolve');
});

test('invalid compensation templates are rejected without host trust',async()=>{
  const adapter=createHttpCompensationAdapter({endpoint:'https://compensation.example',
    fetch:async()=>jsonResponse({...template,key:'invalid key'})});
  assert.equal(await adapter.resolve(session,{action}),null);
});

test('http compensation responses are bounded and production install denies without URL',async()=>{
  const bounded=createHttpCompensationAdapter({endpoint:'https://compensation.example',
    maxResponseBytes:64,fetch:async()=>new Response('x'.repeat(65),
      {headers:{'content-type':'application/json'}})});
  await assert.rejects(bounded.resolve(session,{action}));
  const protocol=createHttpCompensationAdapter({endpoint:'https://compensation.example',
    fetch:async()=>new Response('ok',{headers:{'content-type':'text/plain'}})});
  await assert.rejects(protocol.resolve(session,{action}));
  const forbidden=createHttpCompensationAdapter({endpoint:'https://compensation.example',
    fetch:async()=>new Response(null,{status:404})});
  await assert.rejects(forbidden.resolve(session,{action}));
  delete process.env.WORKBENCH_COMPENSATION_URL;
  assert.equal(await currentCompensationAdapter().resolve(session,{action}),null);
});
