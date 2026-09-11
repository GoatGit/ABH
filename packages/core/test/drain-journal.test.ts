import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir,readFile,writeFile,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {DrainReport} from '@abh/contracts';
import {LocalDrainJournal} from '../src/durable/drain-journal.ts';

test('local drain evidence survives reopening and concurrent replay without overwrite',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'abh-drain-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const options={directory,resourceOrganizationId:randomUUID(),instanceId:randomUUID()},journal=new LocalDrainJournal(options);
  const report:DrainReport={drained:false,remainingRefs:[{type:'abh.job',id:randomUUID(),version:1}],completedAt:new Date().toISOString()};
  const [a,b]=await Promise.all([journal.save(report),journal.save(report)]);assert.equal(a,b);
  assert.deepEqual(await new LocalDrainJournal(options).read(a),report);
  const folder=join(directory,options.resourceOrganizationId,options.instanceId),files=await readdir(folder);
  assert.deepEqual(files,[`${a.slice(7)}.json`]);assert.equal((await stat(join(folder,files[0]!))).mode&0o777,0o600);
  const path=join(folder,files[0]!),original=await readFile(path,'utf8');await writeFile(path,original.replace('false','true'));
  await assert.rejects(journal.read(a),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(journal.save(report),{code:'IDEMPOTENCY_CONFLICT'});
  assert.equal(await readFile(path,'utf8'),original.replace('false','true'),'existing evidence must never be overwritten');
  assert.deepEqual(await readdir(folder),files,'failed saves remove staging files');
  await assert.rejects(new LocalDrainJournal({...options,resourceOrganizationId:randomUUID()}).read(a),{code:'ENOENT'});
  await assert.rejects(journal.save({...report,drained:true}),{code:'INVALID_ARGUMENT'});
});

test('journal rejects symlink destination and never follows report links',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'abh-drain-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const options={directory,resourceOrganizationId:randomUUID(),instanceId:randomUUID()},journal=new LocalDrainJournal(options);
  const report:DrainReport={drained:true,remainingRefs:[],completedAt:new Date().toISOString()},digest=await journal.save(report);
  const path=join(directory,options.resourceOrganizationId,options.instanceId,`${digest.slice(7)}.json`),outside=join(directory,'outside');
  await writeFile(outside,'unchanged');await rm(path);await symlink(outside,path);
  await assert.rejects(journal.read(digest));await assert.rejects(journal.save(report));assert.equal(await readFile(outside,'utf8'),'unchanged');
  const alias=join(directory,'alias');await symlink(directory,alias);
  await assert.rejects(new LocalDrainJournal({...options,directory:alias}).save(report),{code:'INVALID_ARGUMENT'});
});
