import assert from 'node:assert/strict';
import {test} from 'node:test';
import {denyAllSettingsAdapter} from '../src/lib/settings.ts';
import {validateSettingsInput,validateSettingsView} from '../src/lib/settings-validation.ts';

test('settings snapshots and commands remain bounded and deny by default',async()=>{
  const organizationId='00000000-0000-4000-8000-000000000001';
  const command={
    key:'rotate-connection',label:'轮换连接',description:'宿主声明的治理命令',
    requiresConfirmation:true,
    inputSchema:{type:'object',properties:{connectionId:{type:'string',minLength:1}},
      required:['connectionId'],additionalProperties:false},
    initialData:{connectionId:'connection-1'},
  };
  const view={
    asOf:'2026-09-11T00:00:00.000Z',source:'host settings adapter',
    organization:{organizationId,label:'Example',collaborationBoundary:'same organization'},
    members:[],purposes:[],connections:[],automation:[],commands:[command],
  };
  assert.equal(validateSettingsView(view),true);
  assert.equal(validateSettingsView({...view,
    organization:{...view.organization,organizationId:'not-a-uuid'}}),false);
  assert.equal(validateSettingsView({...view,
    commands:[{...command,inputSchema:{type:'object'}}]}),true);
  assert.equal(await denyAllSettingsAdapter.resolve({session:{} as never}),null);
  await assert.rejects(denyAllSettingsAdapter.execute({
    session:{} as never,commandKey:'rotate-connection',requestId:'request-1',
    input:{connectionId:'connection-1'}}),/^Error: FORBIDDEN$/);
  assert.equal(validateSettingsInput(command.inputSchema,{connectionId:'connection-2'}).success,true);
  assert.equal(validateSettingsInput(command.inputSchema,{}).success,false);
});
