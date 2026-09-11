import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {ConnectionRecord,EntityRef,OperationPlanNode,PurposeRecord} from '@abh/contracts';
import {createContractCatalog} from '@abh/contracts/catalog';
import {PurposeOwner} from '../src/control/purposes.ts';
import {ConnectionOwner} from '../src/identity/connections.ts';
import {lockFences} from '../src/control/fences.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {Database,type TenantTransaction} from '../src/data/uow.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('Purpose and Connection directories enforce current binding and revocation',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl);t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org),purposes=new PurposeOwner(),connections=new ConnectionOwner();
  const exec=deriveVerifiedContext({...c.request,purposeOfUse:'abh.action.execute'}),catalog=createContractCatalog();assert.ok(catalog.success);
  await db.transaction(c,options(),tx=>tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`);
  const run=async(cmd:CommandIdentity,work:(tx:TenantTransaction)=>Promise<EntityRef>)=>db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>work(tx)));
  const purpose:PurposeRecord={purposeRef:ref('abh.purpose'),resourceOrganizationId:org,name:'abh.action.execute',status:'Active',evidenceRefs:[scope]},purposeCmd=await command('abh.purposes.configure',purpose);
  await run(purposeCmd,async tx=>(await purposes.configure(tx,purposeCmd,purpose,catalog.data,async()=>{})).purposeRef);
  const connector={kind:'Connector' as const,id:'hello.connector',version:'0.1.0',digest:'sha256:'+'a'.repeat(64)};
  const connection:ConnectionRecord={connectionRef:ref('abh.connection'),resourceOrganizationId:org,providerName:'hello.fake',providerTenantId:'fixture-only',accountRefs:[ref('hello.account')],scopeRefs:[scope],connectorRefs:[connector],secretRef:ref('abh.secret'),evidenceRefs:[scope],purposeNames:['abh.action.prepare','abh.action.execute'],status:'Active'},connectionCmd=await command('abh.connections.configure',connection);
  await run(connectionCmd,async tx=>(await connections.configure(tx,connectionCmd,connection,async()=>{})).connectionRef);
  const node:OperationPlanNode={nodeKey:'write',connectionRef:connection.connectionRef,accountRef:connection.accountRefs[0]!,resourceKey:'hello.brief',operationType:'hello.publish',payloadRef:ref('abh.artifact'),payloadDigest:'sha256:'+'b'.repeat(64),connectorRef:connector,scopeRefs:[scope],completionPolicyRef:ref('hello.completion-policy'),resourceRequirements:[],dependsOn:[],inputBindings:[]};
  await t.test('registered purpose and exact connection are available under execution purpose',async()=>{
    assert.deepEqual(await db.transaction(exec,options(),tx=>purposes.requireCurrent(tx,[purpose.purposeRef])),purpose);
    assert.deepEqual(await db.transaction(exec,options(),tx=>connections.assertNode(tx,node)),connection);
  });
  await t.test('unknown purpose and governance rejection cannot configure',async()=>{
    const bad={...purpose,purposeRef:ref('abh.purpose'),name:'hello.unknown'},cmd=await command('abh.purposes.configure',bad);
    await assert.rejects(run(cmd,async tx=>(await purposes.configure(tx,cmd,bad,catalog.data,async()=>{})).purposeRef),{code:'PURPOSE_DENIED'});
    await assert.rejects(run(cmd,async tx=>(await connections.configure(tx,cmd,{...connection,connectionRef:ref('abh.connection')},async()=>{throw new CoreError('AUTHORITY_REQUIRED');})).connectionRef),{code:'AUTHORITY_REQUIRED'});
  });
  await t.test('wrong account, connector version and scope cannot borrow a valid connection',async()=>{
    for(const patch of [{accountRef:ref('hello.account')},{connectorRef:{...connector,version:'0.2.0'}},{scopeRefs:[ref('abh.organization')]}])
      await assert.rejects(db.transaction(exec,options(),tx=>connections.assertNode(tx,{...node,...patch})),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
    await assert.rejects(db.transaction(context(),options(),tx=>connections.get(tx,connection.connectionRef)),{code:'RESOURCE_NOT_FOUND'});
    const wrong=deriveVerifiedContext({...c.request,purposeOfUse:'abh.operation.reconcile'});
    await assert.rejects(db.transaction(wrong,options(),tx=>connections.get(tx,connection.connectionRef)),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(wrong,options(),tx=>purposes.requireCurrent(tx,[purpose.purposeRef])),{code:'PURPOSE_DENIED'});
  });
  await t.test('purpose revocation updates formal state and fence, preserving historical records',async()=>{
    const cmd=await command('abh.purposes.revoke',purpose.purposeRef);await run(cmd,async tx=>(await purposes.revoke(tx,cmd,purpose.purposeRef,[scope],async()=>{})).purposeRef);
    await assert.rejects(db.transaction(exec,options(),tx=>purposes.requireCurrent(tx,[purpose.purposeRef])),{code:'PURPOSE_DENIED'});
    const fences=await db.transaction(exec,options(),tx=>lockFences(tx,[purpose.purposeRef]));assert.equal(fences[0]!.stopFlag,true);assert.equal(fences[0]!.epoch,2);
  });
  await t.test('connection revocation fences new work and retains binding evidence',async()=>{
    const cmd=await command('abh.connections.revoke',connection.connectionRef);let revoked:ConnectionRecord;
    await run(cmd,async tx=>{revoked=await connections.revoke(tx,cmd,connection.connectionRef,[scope],async()=>{});return revoked.connectionRef;});
    await assert.rejects(db.transaction(exec,options(),tx=>connections.assertNode(tx,node)),{code:'VERSION_CONFLICT'});
    assert.equal((await db.transaction(exec,options(),tx=>connections.get(tx,revoked!.connectionRef))).status,'Revoked');
    assert.equal((await db.transaction(exec,options(),tx=>lockFences(tx,[connection.connectionRef])))[0]!.stopFlag,true);
  });
});
