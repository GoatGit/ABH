import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standalone from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
import { compile } from 'json-schema-to-typescript';
import YAML from 'yaml';
import { buildProtocol, contractShape, lintProtocol, lintSemanticMetadata } from './protocol.mjs';
import { buildCatalogActions, buildConfiguration, buildPorts, buildStateDocumentation, lintCatalog, lintPorts } from './foundation.mjs';

export const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const identifier = /^[A-Za-z][A-Za-z0-9]*$/;
const guardIdentifier = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
const unique = values => new Set(values).size === values.length;
function assert(condition, message) { if (!condition) throw new Error(message); }

export function lintRegistries(states, errors, version) {
  assert(states.version === version && errors.version === version, 'Registry version mismatch');
  assert(Array.isArray(states.owners) && unique(states.owners), 'Duplicate or missing owners');
  assert(errors.owner === 'ContractMaintainer', 'Unknown Error Registry owner');
  const referencedGuards = new Set();
  for (const [name, machine] of Object.entries(states.machines)) {
    assert(identifier.test(name), `Invalid machine ID: ${name}`);
    assert(states.owners.includes(machine.owner), `Unknown owner: ${name}`);
    assert(machine.states.length > 0 && unique(machine.states) && machine.states.every(s => identifier.test(s)), `Invalid enum: ${name}`);
    assert(unique(machine.terminal) && machine.terminal.every(s => machine.states.includes(s)), `Invalid terminal states: ${name}`);
    const pairs = new Set();
    for (const transition of machine.transitions) {
      const label = `${name}:${transition.from}->${transition.to}`;
      assert(machine.states.includes(transition.from) && machine.states.includes(transition.to), `Unknown transition state: ${label}`);
      assert(!machine.terminal.includes(transition.from), `Terminal state cannot reopen: ${label}`);
      assert(!pairs.has(label), `Duplicate transition: ${label}`); pairs.add(label);
      assert(transition.guardIds.length > 0 && unique(transition.guardIds), `Missing guard: ${label}`);
      for (const id of transition.guardIds) {
        const guard = states.guards[id];
        assert(guardIdentifier.test(id) && guard?.owner === machine.owner && guard.description?.length > 0 && guard.implementation === 'OwnerRequired', `Invalid or unknown guard: ${id}`);
        referencedGuards.add(id);
      }
      assert(/^abh\.[a-z-]+\.[a-z-]+$/.test(transition.event), `Invalid event: ${label}`);
      assert(JSON.stringify(transition.effects) === JSON.stringify(['OwnerCAS','Audit','Outbox']), `Missing atomic effects: ${label}`);
    }
    for (const state of machine.states) {
      assert(machine.terminal.includes(state) || machine.transitions.some(t => t.from === state), `Nonterminal state has no exit: ${name}.${state}`);
    }
    if (machine.combinations) {
      assert(unique(machine.outcomes), `Duplicate outcome: ${name}`);
      assert(Object.keys(machine.combinations).length === machine.states.length, `Incomplete combinations: ${name}`);
      for (const state of machine.states) {
        const values = machine.combinations[state];
        assert(values?.length > 0 && unique(values) && values.every(v => machine.outcomes.includes(v)), `Invalid combination: ${name}.${state}`);
      }
    }
  }
  assert(Object.keys(states.guards).every(id => referencedGuards.has(id)), 'Unused guard definition');
  const categories = {Validation:[400],Authentication:[401],Authorization:[403],NotFound:[404],Conflict:[409],Precondition:[409],Capacity:[429],Dependency:[503,504],Internal:[500]};
  assert(unique(errors.entries.map(e => e.code)), 'Duplicate error code');
  for (const entry of errors.entries) {
    assert(/^[A-Z][A-Z_]+$/.test(entry.code) && entry.code !== 'UNKNOWN', `Invalid error code: ${entry.code}`);
    assert(categories[entry.category]?.includes(entry.httpStatus), `Missing error HTTP mapping: ${entry.code}`);
    assert(entry.toolCategory === entry.category && typeof entry.retryable === 'boolean', `Missing error Tool mapping: ${entry.code}`);
    assert(!entry.retryable || ['Capacity','Dependency'].includes(entry.category), `Unsafe retry classification: ${entry.code}`);
  }
}

export async function readSources() {
  const paths = ['schemas/public.schema.json','schemas/tenant-context.schema.json','states/registry.yaml','errors/registry.yaml','manifests/contract-version.json','package.json','scripts/generate.mjs','schemas/workflow.schema.json','protocol/registry.yaml','scripts/protocol.mjs','schemas/adapters.schema.json','schemas/catalog.schema.json','catalog/core.json','ports/registry.yaml','states/documentation.json','scripts/foundation.mjs','schemas/facts.schema.json'];
  const raw = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(join(packageRoot, path), 'utf8')])));
  const stateDoc = await readFile(join(repositoryRoot,'docs/V1/10-ABH详细设计/02-状态与执行契约规范.md'),'utf8');
  raw['../../docs/V1/10-ABH详细设计/02-状态与执行契约规范.md'] = stateDoc;
  return { raw, publicSchema: JSON.parse(raw[paths[0]]), internalSchema: JSON.parse(raw[paths[1]]), states: YAML.parse(raw[paths[2]]), errors: YAML.parse(raw[paths[3]]), manifest: JSON.parse(raw[paths[4]]), workflowSchema: JSON.parse(raw[paths[7]]), protocol: YAML.parse(raw[paths[8]]), adapterSchema: JSON.parse(raw[paths[10]]), catalogSchema: JSON.parse(raw[paths[11]]), catalog: JSON.parse(raw[paths[12]]), ports: YAML.parse(raw[paths[13]]), stateMapping: JSON.parse(raw[paths[14]]), stateDoc, factsSchema:JSON.parse(raw[paths[16]]) };
}

function stateSchema(registry, base) {
  const definitions = {};
  for (const [name, machine] of Object.entries(registry.machines)) {
    definitions[`${name}State`] = {title:`${name}State`,type:'string',enum:machine.states};
    if (machine.combinations) {
      definitions[`${name}Outcome`] = {title:`${name}Outcome`,type:'string',enum:machine.outcomes};
      definitions[`${name}Position`] = {title:`${name}Position`,oneOf:Object.entries(machine.combinations).map(([state,outcomes]) => ({type:'object',properties:{lifecycle:{const:state},outcome:{enum:outcomes}},required:['lifecycle','outcome'],additionalProperties:false}))};
    }
  }
  return {$schema:'https://json-schema.org/draft/2020-12/schema',$id:`${base}:states`,$defs:definitions};
}

function errorSchema(registry, base) {
  return {$schema:'https://json-schema.org/draft/2020-12/schema',$id:`${base}:errors`,$defs:{ErrorResponse:{title:'ErrorResponse',type:'object',properties:{success:{const:false},error:{oneOf:registry.entries.map(entry => ({type:'object',properties:{code:{const:entry.code},category:{const:entry.category},message:{type:'string',minLength:1,maxLength:500},retryable:entry.retryable?{type:'boolean'}:{const:false},correlationId:{$ref:`${base}:public#/$defs/UUID`}},required:['code','category','message','retryable','correlationId'],additionalProperties:false}))}},required:['success','error'],additionalProperties:false}}};
}

// Every reference is resolved from the finite, checked-in registry. No HTTP loader.
function transformRefs(value, ids, prefix) {
  if (Array.isArray(value)) return value.map(v => transformRefs(v,ids,prefix));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,v]) => {
    if (key === '$ref') {
      if (prefix === '#/components/schemas/' && v.startsWith(prefix)) return [key,v];
      const [id,fragment] = v.split('#');
      assert((!id || ids.includes(id)) && fragment?.startsWith('/$defs/'), `Unregistered reference: ${v}`);
      return [key,`${prefix}${fragment.slice('/$defs/'.length)}`];
    }
    return [key,transformRefs(v,ids,prefix)];
  }));
  return value;
}

async function bundleValidators(ajv, references) {
  const source = standalone(ajv,references);
  const result = await build({stdin:{contents:source,resolveDir:packageRoot,sourcefile:'validators.js'},absWorkingDir:repositoryRoot,bundle:true,platform:'browser',format:'esm',target:'es2023',write:false,minify:true,legalComments:'none',logLevel:'silent'});
  return `// Generated from the checked-in JSON Schema registry. Do not edit.\n${result.outputFiles[0].text}`;
}

export async function buildArtifacts() {
  const {raw,publicSchema,internalSchema,states,errors,manifest,workflowSchema,protocol,adapterSchema,catalogSchema,catalog,ports,stateMapping,stateDoc,factsSchema} = await readSources();
  lintRegistries(states,errors,manifest.version);
  assert(manifest.previousRelease === null, 'A published baseline requires an explicit compatibility comparison; refusing an initial-release report');
  const base = `urn:abh:contracts:${manifest.version}`;
  assert(publicSchema.$id === `${base}:public` && internalSchema.$id === `${base}:tenant-context`, 'Schema version mismatch');
  const state = stateSchema(states,base);
  const error = errorSchema(errors,base);
  assert(workflowSchema.$id === `${base}:workflow`, 'Workflow schema version mismatch');
  assert(JSON.stringify(manifest.publicSchemas) === JSON.stringify(['public.schema.json','workflow.schema.json','adapters.schema.json','catalog.schema.json','facts.schema.json']), 'Public schema manifest mismatch');
  lintProtocol(protocol,{...publicSchema.$defs,...workflowSchema.$defs,...factsSchema.$defs},states,errors,manifest.version);
  const transport = buildProtocol(protocol,states,errors,base,Object.keys(factsSchema.$defs));
  const configuration = buildConfiguration(publicSchema.$defs.DevelopmentConfig,manifest.version);
  const configSchema = {$schema:publicSchema.$schema,$id:`${base}:config`,$defs:{ResolvedDevelopmentConfig:configuration.resolved}};
  assert(factsSchema.$id === `${base}:facts`, 'Facts schema version mismatch');
  const initialSchemas = [publicSchema,workflowSchema,adapterSchema,catalogSchema,factsSchema,configSchema,transport.schema,state,error];
  const initialDefinitions = Object.assign({},...initialSchemas.map(schema=>schema.$defs));
  lintPorts(ports,initialDefinitions,catalog.owners,errors,manifest.version,catalog);
  const portArtifacts = buildPorts(ports,Object.fromEntries(initialSchemas.flatMap(schema=>Object.keys(schema.$defs).map(name=>[name,{id:schema.$id}]))),base);
  const publicSchemas = [...initialSchemas,portArtifacts.schema];
  assert(adapterSchema.$id === `${base}:adapters` && catalogSchema.$id === `${base}:catalog`, 'Foundation schema version mismatch');
  const definitions = Object.assign({},...publicSchemas.map(s => s.$defs));
  lintCatalog(catalog,definitions,states,protocol,manifest.version);
  assert(Object.keys(definitions).length === publicSchemas.reduce((n,s)=>n+Object.keys(s.$defs).length,0), 'Duplicate schema definition');
  assert(Object.keys(definitions).every(k=>identifier.test(k)), 'Invalid schema definition name');
  const ids = publicSchemas.map(s=>s.$id);
  const bundledDefinitions = transformRefs(definitions,ids,'#/$defs/');
  lintSemanticMetadata(definitions);
  const ajv = new Ajv2020({strict:true,allErrors:true,ownProperties:true,coerceTypes:false,useDefaults:false,removeAdditional:false,code:{source:true,esm:true}});
  ajv.addKeyword({keyword:'x-abh-set',schemaType:'boolean',valid:true});
  ajv.addKeyword({keyword:'x-abh-digest-fields',schemaType:'array',valid:true});
  ajv.addKeyword({keyword:'x-abh-config',schemaType:'object',valid:true});
  addFormats(ajv);
  for (const schema of [...publicSchemas,internalSchema]) ajv.addSchema(schema);
  for (const [path,field] of Object.entries(configuration.fields)) {
    const validate = ajv.compile(field.schema);
    assert(validate(field.example) && (field.defaultPolicy !== 'Value' || validate(field.default)), `Invalid configuration default/example: ${path}`);
    assert(field.source.startsWith('docs/V1/') && !field.source.includes('..'), `Invalid configuration source: ${path}`);
    await readFile(join(repositoryRoot,field.source),'utf8');
  }
  const references = {};
  for (const schema of publicSchemas) {
    for (const name of Object.keys(schema.$defs)) {
      const id = `${schema.$id}#/$defs/${name}`;
      assert(ajv.getSchema(id), `Cannot compile schema ${id}`);
      references[`validate${name}`] = id;
    }
  }
  assert(ajv.getSchema(internalSchema.$id), 'Cannot compile TenantContext');
  const outputs = {};
  for (const [name,schema] of Object.entries({public:publicSchema,workflow:workflowSchema,adapters:adapterSchema,catalog:catalogSchema,facts:factsSchema,config:configSchema,ports:portArtifacts.schema,protocol:transport.schema,states:state,errors:error})) outputs[`schemas/${name}.schema.json`] = json(schema);
  const typesOptions = {bannerComment:'/* Generated from JSON Schema 2020-12. Do not edit. */',unreachableDefinitions:true,ignoreMinAndMaxItems:true,format:true};
  outputs['types.ts'] = await compile({title:'PublicContract',...publicSchema,$defs:bundledDefinitions,anyOf:Object.keys(definitions).map(name=>({$ref:`#/$defs/${name}`}))},'PublicContract',typesOptions);
  const tenantBundle = {...transformRefs(internalSchema,ids,'#/$defs/'),$defs:bundledDefinitions};
  outputs['internal/types.ts'] = await compile(tenantBundle,'TenantContext',{...typesOptions,unreachableDefinitions:false});
  outputs['validators.js'] = await bundleValidators(ajv,references);
  outputs['internal/tenant-validator.js'] = await bundleValidators(ajv,{validateTenantContext:internalSchema.$id});
  outputs['internal/tenant-context.schema.json'] = json(internalSchema);
  outputs['state-tables.ts'] = `/* Generated. Guard IDs describe obligations; this table never grants permission. */\nexport const stateRegistry = ${JSON.stringify(states,null,2)} as const;\n`;
  outputs['error-registry.ts'] = `/* Generated. Retryability never permits repeating an uncertain external effect. */\nexport const errorRegistry = ${JSON.stringify(Object.fromEntries(errors.entries.map(e=>[e.code,e])),null,2)} as const;\n`;
  outputs['schema-ids.ts'] = `/* Generated. Identifiers resolve locally; they are not network locations. */\nexport const schemaIds = ${JSON.stringify(Object.fromEntries(Object.entries(references).map(([name,id])=>[name.slice('validate'.length),id])),null,2)} as const;\n`;
  outputs['schema-types.ts'] = `/* Generated. */\nimport type * as Types from './types.ts';\nexport interface SchemaTypes {\n${Object.keys(definitions).map(name=>`  ${name}: Types.${name};`).join('\n')}\n}\n`;
  outputs['contract-shapes.ts'] = `/* Generated structural navigation; no runtime compilation. */\nexport const contractShapes = ${JSON.stringify(Object.fromEntries(Object.entries(definitions).map(([name,schema])=>[name,contractShape(schema)])),null,2)} as const;\n`;
  outputs['digest-policies.ts'] = `/* Generated semantic payload field selection. */\nexport const digestPolicies = ${JSON.stringify(Object.fromEntries(Object.entries(definitions).filter(([,s])=>s['x-abh-digest-fields']).map(([n,s])=>[n,s['x-abh-digest-fields']])),null,2)} as const;\n`;
  outputs['protocol-registry.ts'] = `/* Generated HTTP contracts. No server implementation or authorization. */\nexport const protocolRegistry = ${JSON.stringify(protocol,null,2)} as const;\n`;
  outputs['config-metadata.ts'] = `/* Generated from DevelopmentConfig leaf annotations. */\nexport const configurationMetadata = ${JSON.stringify(configuration.fields,null,2)} as const;\n`;
  outputs['catalog.ts'] = `/* Generated registration data; installation never grants authority. */\nexport const coreCatalog = ${JSON.stringify({...catalog,actions:buildCatalogActions(protocol,ports,catalog.actions)},null,2)} as const;\n`;
  outputs['ports.ts'] = portArtifacts.types;
  outputs['port-registry.ts'] = `/* Generated method metadata, not Adapter implementations. */\nexport const portMethods = ${JSON.stringify(portArtifacts.methods,null,2)} as const;\nexport const portCommonErrors = ${JSON.stringify(ports.commonErrors)} as const;\n`;
  outputs['state-reference.md'] = buildStateDocumentation(stateMapping,states,stateDoc);
  const sqlLiteral = value => `'${value.replaceAll("'","''")}'`;
  for (const [name,machine] of Object.entries(states.machines)) {
    const column = machine.combinations ? 'lifecycle' : 'status';
    const conditions = machine.combinations
      ? `lifecycle IS NOT NULL AND outcome IS NOT NULL AND (${Object.entries(machine.combinations).map(([state,outcomes])=>`(lifecycle = ${sqlLiteral(state)} AND outcome IN (${outcomes.map(sqlLiteral).join(', ')}))`).join(' OR ')})`
      : `${column} IS NOT NULL AND ${column} IN (${machine.states.map(sqlLiteral).join(', ')})`;
    const snake = name.replace(/[A-Z]/g,(c,i)=>(i?'_':'')+c.toLowerCase());
    outputs[`sql/${snake}.check.sql`] = `-- Generated constraint fragment for the ${name} Owner migration; not a migration.\nCONSTRAINT ${snake}_state_check CHECK (${conditions})\n`;
  }
  outputs['openapi.json'] = json({openapi:'3.1.0',jsonSchemaDialect:publicSchema.$schema,info:{title:'ABH Preview HTTP Contracts',version:manifest.version,description:'M0-A contract specification. All operations are unavailable until their runtime implementation passes the required gates.'},'x-abh-runtime-available':false,paths:transformRefs(transport.paths,ids,'#/components/schemas/'),components:{securitySchemes:{session:{type:'http',scheme:'bearer',description:'Verified ingress identity; the credential never becomes execution authority.'}},schemas:transformRefs(definitions,ids,'#/components/schemas/')}});
  outputs['compatibility.json'] = json({version:manifest.version,comparedAgainst:null,status:'InitialPreview',note:'No earlier contract release exists. This is not a backward-compatibility certification.'});
  outputs['manifest.json'] = json({version:manifest.version,stability:manifest.stability,inputs:Object.fromEntries(Object.entries(raw).map(([name,value])=>[name,hash(value)])),outputs:Object.fromEntries(Object.entries(outputs).sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,value])=>[name,hash(value)]))});
  return outputs;
}

async function writeTree(dir, outputs) {
  for (const [path,data] of Object.entries(outputs)) {
    await mkdir(dirname(join(dir,path)),{recursive:true});
    await writeFile(join(dir,path),data);
  }
}
async function listFiles(dir) {
  const entries = await readdir(dir,{withFileTypes:true}).catch(error => {if(error.code==='ENOENT') return []; throw error;});
  const files = [];
  for (const entry of entries) {
    const path = join(dir,entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path)); else files.push(path);
  }
  return files;
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === '--check'),'Usage: generate.mjs [--check]');
  const outputs = await buildArtifacts();
  const generated = join(packageRoot,'generated');
  if (args[0] === '--check') {
    const temp = await mkdtemp(join(tmpdir(),'abh-contracts-'));
    try {
      await writeTree(temp,outputs);
      const expected = Object.keys(outputs).sort();
      const actual = (await listFiles(generated)).map(p=>relative(generated,p).replaceAll('\\','/')).sort();
      assert(JSON.stringify(actual) === JSON.stringify(expected),'Generated file set differs; run pnpm contracts:generate and review the diff');
      for (const path of expected) {
        const [a,b] = await Promise.all([readFile(join(generated,path)),readFile(join(temp,path))]);
        assert(a.equals(b),`Generated artifact drift: ${path}; run pnpm contracts:generate and review the diff`);
      }
    } finally { await rm(temp,{recursive:true,force:true}); }
    console.log(`Contract artifacts match (${Object.keys(outputs).length} files).`);
  } else {
    await mkdir(generated,{recursive:true});
    // Remove only obsolete generator-owned artifacts inside this fixed directory.
    for (const file of await listFiles(generated)) if (!(relative(generated,file).replaceAll('\\','/') in outputs)) await rm(file);
    await writeTree(generated,outputs);
    console.log(`Generated ${Object.keys(outputs).length} contract artifacts.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
