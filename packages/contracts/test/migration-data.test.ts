import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const digest='sha256:'+'a'.repeat(64);
const report={binding:{kind:'DataInvariants',organizationId:'11111111-1111-4111-8111-111111111111',packId:'org.example.pack',packVersion:'1.0.0',packageDigest:digest,planDigest:digest,expectedDigest:digest},environmentDigest:digest,deploymentVersion:1,issuedAt:'2026-09-08T00:00:00.123456Z',expiresAt:'2026-09-08T00:00:00.123457Z'};
test('data report closes shape and preserves microsecond lifetime order',()=>{
 assert.equal(validateContract('PackMigrationDataReport',report).success,true);
 for(const expiresAt of [report.issuedAt,'2026-09-08T00:00:00.123455Z'])assert.equal(validateContract('PackMigrationDataReport',{...report,expiresAt}).success,false);
 for(const patch of [{extra:true},{deploymentVersion:0},{deploymentVersion:1.5},{deploymentVersion:9007199254740992},{environmentDigest:'abc'},{issuedAt:'bad'},{binding:{...report.binding,packVersion:'latest'}},{binding:{...report.binding,extra:true}}])assert.equal(validateContract('PackMigrationDataReport',{...report,...patch}).success,false);
 for(const field of Object.keys(report)) {const value:Record<string,unknown>={...report};delete value[field];assert.equal(validateContract('PackMigrationDataReport',value).success,false);}
 for(const field of Object.keys(report.binding)){const binding:Record<string,unknown>={...report.binding};delete binding[field];assert.equal(validateContract('PackMigrationDataReport',{...report,binding}).success,false);}
});
test('data report digest binds every identity, scope and deployment field',async()=>{
 const original=await digestContract('PackMigrationDataReport',report);
 for(const [key,value] of Object.entries({organizationId:'22222222-2222-4222-8222-222222222222',packId:'org.other.pack',packVersion:'2.0.0',packageDigest:'sha256:'+'b'.repeat(64),planDigest:'sha256:'+'b'.repeat(64),expectedDigest:'sha256:'+'b'.repeat(64)}))assert.notEqual(await digestContract('PackMigrationDataReport',{...report,binding:{...report.binding,[key]:value}}),original);
 for(const patch of [{environmentDigest:'sha256:'+'b'.repeat(64)},{deploymentVersion:2},{issuedAt:'2026-09-08T00:00:00Z'},{expiresAt:'2026-09-08T00:01:00Z'}])assert.notEqual(await digestContract('PackMigrationDataReport',{...report,...patch}),original);
});

test('data report requires its own invariant kind and rejects structural substitution',()=>{
 for(const kind of ['Structure','',null])assert.equal(validateContract('PackMigrationDataReport',{...report,binding:{...report.binding,kind}}).success,false);
 assert.equal(validateContract('PackMigrationStructureReport',report).success,false);
});
