import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('public validation bundle executes without Node, network, or runtime schema compilation', async () => {
  const result = await build({entryPoints:[fileURLToPath(new URL('../src/schema.ts', import.meta.url))],bundle:true,platform:'browser',format:'iife',globalName:'Contracts',write:false,metafile:true});
  const context: Record<string, any> = {};
  runInNewContext(result.outputFiles![0]!.text, context, { timeout: 3000 });
  assert.equal(context.Contracts.validateContract('Money', { amount: '123.450000000001', currency: 'USD' }).success, true);
  assert.equal(context.Contracts.validateContract('Money', { amount: 123.45, currency: 'USD' }).success, false);
  assert.equal(context.Contracts.validateContract('OperationPosition', { lifecycle: 'Closed', outcome: 'Unknown' }).success, false);
  for (const input of Object.keys(result.metafile!.inputs)) {
    assert.ok(!input.includes('node_modules/'), `Runtime package dependency: ${input}`);
    assert.ok(!input.includes('internal/'), `Internal TenantContext leaked: ${input}`);
  }
});

test('HTTP and JCS exports run in a browser sandbox using Web Crypto', async () => {
  const result = await build({stdin:{contents:"export * from './src/http.ts'; export * from './src/digest.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'browser',format:'iife',globalName:'Contracts',write:false,metafile:true});
  const context = { TextEncoder, crypto: globalThis.crypto };
  const promise = runInNewContext(`${result.outputFiles![0]!.text}\n(async () => ({ digest: await Contracts.digestBytes(new TextEncoder().encode('abc')), parsed: Contracts.parseHttpQuery('abh.actions.list', {limit:'25'}), canonical: Contracts.canonicalJson({z:1,a:2}) }))()`, context, { timeout: 3000 });
  const value = await promise;
  assert.equal(value.digest, 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(value.parsed.success, true);
  assert.equal(value.parsed.data.limit, 25);
  assert.equal(value.canonical, '{"a":2,"z":1}');
  for (const input of Object.keys(result.metafile!.inputs)) {
    assert.ok(!input.includes('internal/'));
    assert.ok(!input.includes('node_modules/') || input.includes('/canonicalize/'), `Unexpected client dependency: ${input}`);
  }
});

test('configuration, catalog and Port helpers remain independent of Node and Adapter SDKs', async () => {
  const result = await build({stdin:{contents:"export * from './src/config.ts'; export * from './src/catalog.ts'; export * from './src/ports.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'browser',format:'iife',globalName:'Contracts',write:false,metafile:true});
  const context: Record<string, any> = { TextEncoder, structuredClone };
  runInNewContext(result.outputFiles![0]!.text, context, { timeout: 3000 });
  const config = context.Contracts.resolveDevelopmentConfig({deployment:{profile:'Development'},identity:{provider:'Fake'},database:{runtimeUrlRef:'env:ABH_DATABASE_RUNTIME_URL',queueUrlRef:'env:ABH_DATABASE_QUEUE_URL'},runtime:{mode:'ActionOnly',businessEntry:'./business.ts'},web:{enabled:false}});
  assert.equal(config.success, true);
  assert.equal(config.data.runtime.action.maxOperations, 100);
  assert.equal(context.Contracts.createContractCatalog().success, true);
  assert.equal(context.Contracts.validatePortResult('DurableExecutionPort.enqueue', {status:'Tracked'}).success, false);
  for (const input of Object.keys(result.metafile!.inputs)) {
    assert.ok(!input.includes('node_modules/'), `Unexpected browser dependency: ${input}`);
    assert.ok(!input.includes('internal/'), `Private schema leaked: ${input}`);
  }
});
