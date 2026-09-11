const assert = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const registeredName = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export function buildConfiguration(schema, version) {
  const fields = {};
  const resolve = (value, path = '') => {
    if (value.properties) {
      assert(value.type === 'object' && value.additionalProperties === false, `Configuration group must be closed: ${path}`);
      return {...value,properties:Object.fromEntries(Object.entries(value.properties).map(([k,v])=>[k,resolve(v,`${path}/${k}`)])),required:Object.keys(value.properties)};
    }
    const meta = value['x-abh-config'];
    assert(meta?.version === version && JSON.stringify(meta.profiles) === '["Development"]', `Missing configuration metadata/version: ${path}`);
    assert(['Public','Reference'].includes(meta.sensitivity) && meta.apply === 'Restart' && meta.description?.length > 0 && typeof meta.source === 'string', `Invalid configuration metadata: ${path}`);
    assert(['string','integer','boolean'].includes(value.type) && Object.hasOwn(meta,'example'), `Missing configuration type/example: ${path}`);
    if (value.type === 'integer') assert(Number.isSafeInteger(value.minimum) && Number.isSafeInteger(value.maximum) && value.minimum <= value.maximum, `Unbounded configuration: ${path}`);
    const hasDefault = Object.hasOwn(value,'default');
    assert(meta.sensitivity !== 'Reference' || (!hasDefault && value.type === 'string' && value.pattern?.startsWith('^env:ABH_')), `Secret reference cannot have an implicit default: ${path}`);
    fields[path] = {...meta,schema:value,defaultPolicy:hasDefault?'Value':'Required',...(hasDefault?{default:value.default}:{})};
    return structuredClone(value);
  };
  const resolved = resolve(schema);
  resolved.title = 'ResolvedDevelopmentConfig';
  return {fields,resolved};
}

export function lintCatalog(catalog, definitions, states, protocol, version) {
  assert(catalog.version === version && catalog.namespace === 'abh' && catalog.owner === 'ContractMaintainer', 'Invalid Core catalog version/namespace/owner');
  assert(unique(catalog.owners) && states.owners.every(owner=>catalog.owners.includes(owner)), 'Missing or duplicate catalog Owner');
  assert(unique(catalog.objectTypes.map(entry=>entry.name)) && unique(catalog.purposes.map(entry=>entry.name)), 'Duplicate catalog registration');
  const types = new Set(catalog.objectTypes.map(entry=>entry.name));
  assert(unique((catalog.actions??[]).map(entry=>entry.name)), 'Duplicate internal action registration');
  for(const action of catalog.actions??[]){
    const command=protocol.commands.find(command=>command.type===action.name&&command.visibility==='Internal');
    assert(command&&action.description?.length>0&&Array.isArray(action.targetTypes)&&action.targetTypes.length===1&&action.targetTypes[0]===command.targetType
      &&Array.isArray(action.purposeNames)&&action.purposeNames.length>0&&unique(action.purposeNames)&&action.purposeNames.every(name=>catalog.purposes.some(purpose=>purpose.name===name)), `Invalid internal action registration: ${action.name}`);
  }
  for (const entry of [...catalog.objectTypes,...catalog.purposes]) assert(registeredName.test(entry.name) && entry.name.startsWith('abh.') && entry.description?.length > 0, `Invalid Core registration: ${entry.name}`);
  for (const entry of catalog.objectTypes) assert(catalog.owners.includes(entry.owner) && ['None','Organization','Workspace','Object'].includes(entry.scopeKind), `Invalid object Owner/scope kind: ${entry.name}`);
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    const type = value.properties?.type?.const;
    if (value.properties?.id && type) assert(types.has(type), `Unregistered entity type: ${type}`);
    for (const child of Object.values(value)) walk(child);
  };
  walk(definitions);
  for(const query of protocol.queries){
    assert(query.targetTypes.every(type=>types.has(type)) && query.purposeNames.every(name=>catalog.purposes.some(purpose=>purpose.name===name)), `Unregistered query target/purpose: ${query.type}`);
    const action=(catalog.actions??[]).find(action=>action.name===query.permission);
    assert(!action || query.targetTypes.every(type=>action.targetTypes.includes(type)) && query.purposeNames.every(name=>action.purposeNames.includes(name)), `Query broadens existing action: ${query.type}`);
  }
  for (const command of protocol.commands) assert(types.has(command.targetType), `Unregistered command target: ${command.type}`);
  for (const event of protocol.events ?? []) {
    const aggregate = catalog.objectTypes.find(type=>type.name===event.aggregateType);
    assert(aggregate?.owner === event.owner, `Unregistered event aggregate or mismatched Owner: ${event.type}`);
  }
}

export function lintPorts(registry, definitions, owners, errors, version, catalog) {
  assert(registry.version === version && registry.status === 'ContractOnly', 'Invalid Port registry version/status');
  const codes = new Set(errors.entries.map(entry=>entry.code));
  assert(registry.commonErrors?.length > 0 && unique(registry.commonErrors) && registry.commonErrors.every(code=>codes.has(code)), 'Invalid common Port errors');
  for (const [name, port] of Object.entries(registry.ports)) {
    assert(/^[A-Z][A-Za-z]*Port$/.test(name) && owners.includes(port.owner), `Invalid Port/Owner: ${name}`);
    assert(port.caller && port.implementer && port.source && Object.keys(port.methods).length, `Incomplete Port: ${name}`);
    for (const [method, entry] of Object.entries(port.methods)) {
      const label = `${name}.${method}`;
      assert(/^[a-z][A-Za-z]*$/.test(method) && definitions[entry.request] && definitions[entry.response], `Missing Port schema: ${label}`);
      assert(['Read','DurableWrite'].includes(entry.effect) && ['PreAuthentication','Request','Authorized'].includes(entry.context), `Missing Port effect/context: ${label}`);
      assert(Array.isArray(entry.errors) && unique(entry.errors) && entry.errors.every(code=>codes.has(code)), `Missing Port error mapping: ${label}`);
      const properties = definitions[entry.request].properties;
      const required = definitions[entry.request].required ?? [];
      if (entry.context === 'PreAuthentication') {
        assert(name === 'IdentityProviderPort' && ['callId','deadline','credentialRef'].every(key=>required.includes(key)) && properties.callId && properties.deadline && !properties.context && properties.credentialRef, `Invalid pre-authentication Port: ${label}`);
      } else {
        assert(properties.context?.$ref?.endsWith('/PortCallContext') && required.includes('context'), `Missing current Port context: ${label}`);
        assert(registeredName.test(entry.permission) && registeredName.test(entry.purpose) && entry.targetTypes?.length > 0 && unique(entry.targetTypes), `Missing Port permission registration: ${label}`);
        if (catalog) assert(entry.targetTypes.every(type=>catalog.objectTypes.some(e=>e.name===type)) && catalog.purposes.some(e=>e.name===entry.purpose), `Unregistered Port target/purpose: ${label}`);
        if (entry.context === 'Authorized') assert(properties.authorizedContextRef && required.includes('authorizedContextRef'), `Missing authorized context: ${label}`);
      }
      assert(entry.effect !== 'DurableWrite' || (entry.tracking && definitions[entry.tracking]), `Uncertain writes require a tracking Ref: ${label}`);
      assert(!entry.tracking || definitions[entry.tracking], `Unknown tracking schema: ${label}`);
      assert(!entry.inputStream || (name === 'ObjectStorePort' && method === 'put'), `Unexpected input stream: ${label}`);
      assert(!entry.outputStream || (name === 'ObjectStorePort' && method === 'read'), `Unexpected output stream: ${label}`);
    }
  }
  const context = definitions.PortCallContext;
  assert(['callId','requestContextRef','target','deadline'].every(key=>context?.properties?.[key] && context.required?.includes(key)), 'Incomplete common Port context');
}

export function buildCatalogActions(protocol, ports, internalActions = []) {
  const actions = new Map();
  const add = (name, targets, purposes, description) => {
    const existing = actions.get(name);
    actions.set(name,{name,targetTypes:[...new Set([...(existing?.targetTypes??[]),...targets])].sort(),purposeNames:[...new Set([...(existing?.purposeNames??[]),...purposes])].sort(),description:existing?.description??description});
  };
  for (const command of protocol.commands) if (command.visibility === 'Public') add(command.permission,[command.targetType],command.purposeNames ?? [command.owner==='HumanGateway'?'abh.decision.review':'abh.action.prepare'],command.name);
  for (const query of protocol.queries) add(query.permission,query.targetTypes,query.purposeNames,query.name);
  for (const [name,port] of Object.entries(ports.ports)) for (const [method,entry] of Object.entries(port.methods)) if (entry.permission) add(entry.permission,entry.targetTypes,[entry.purpose],`${name}.${method}`);
  for (const action of internalActions) add(action.name,action.targetTypes,action.purposeNames,action.description);
  return [...actions.values()].sort((a,b)=>a.name<b.name?-1:1);
}

export function buildPorts(registry, definitions, base) {
  const defs = {};
  const ref = name => {
    assert(definitions[name]?.id, `Missing Port reference: ${name}`);
    return {$ref:`${definitions[name].id}#/$defs/${name}`};
  };
  const methods = {};
  const interfaces = [];
  for (const [name, port] of Object.entries(registry.ports)) {
    const signatures = [];
    for (const [method, entry] of Object.entries(port.methods)) {
      const resultName = `${name.slice(0,-4)}${method[0].toUpperCase()}${method.slice(1)}Result`;
      defs[resultName] = {title:resultName,oneOf:[
        object({status:{const:'Completed'},data:ref(entry.response)}),
        object({status:{const:'Cancelled'},effect:{const:'None'}}),
        object({status:{const:'Rejected'},error:ref('ErrorResponse')}),
        ...(entry.tracking?[object({status:{const:'Tracked'},trackingRef:ref(entry.tracking)})]:[]),
      ]};
      const key = `${name}.${method}`;
      methods[key] = {...entry,result:resultName,owner:port.owner,caller:port.caller,implementer:port.implementer};
      signatures.push(`  /** ${entry.effect}; ${entry.effect==='DurableWrite'?'uncertain completion returns Tracked, never a retryable rejection.':'cancellation stops waiting only.'} */\n  ${method}(request: Types.${entry.request}, options: PortCallOptions${entry.inputStream?', content: AsyncIterable<Uint8Array>':''}): Promise<${entry.outputStream?`WithContent<Types.${resultName}>`:`Types.${resultName}`}>;`);
    }
    interfaces.push(`/** Preview contract only. Caller: ${port.caller}; implementer: ${port.implementer}. */\nexport interface ${name} {\n${signatures.join('\n')}\n}`);
  }
  const types = `/* Generated Port interfaces; no implementation or provider SDK. */\nimport type * as Types from './types.ts';\nexport interface PortCallOptions { readonly signal: AbortSignal; }\nexport type WithContent<T> = T extends { status: 'Completed'; data: infer D } ? Omit<T, 'data'> & { data: D & { content: AsyncIterable<Uint8Array> } } : T;\n${interfaces.join('\n\n')}\n`;
  return {schema:{$schema:'https://json-schema.org/draft/2020-12/schema',$id:`${base}:ports`,$defs:defs},types,methods};
}

export function buildStateDocumentation(mapping, states, text) {
  assert(mapping.version === states.version && mapping.source === states.source, 'State documentation version/source mismatch');
  assert(JSON.stringify(Object.keys(mapping.machines).sort()) === JSON.stringify(Object.keys(states.machines).sort()), 'State documentation coverage mismatch');
  const rows = [];
  for (const [name, machine] of Object.entries(states.machines)) {
    const heading = mapping.machines[name].section;
    const start = text.indexOf(`${heading}\n`);
    assert(start >= 0, `Missing normative section: ${name}`);
    const end = text.indexOf('\n## ',start+heading.length);
    const section = text.slice(start,end<0?undefined:end);
    for (const state of machine.states) assert(new RegExp(`(?<![A-Za-z])${state}(?![A-Za-z])`).test(section), `State absent from normative section: ${name}.${state}`);
    rows.push(`## ${name}\n\nOwner: ${machine.owner}. Source: ${heading.slice(3)}.\n\n| From | To | Guards | Event | Atomic effects |\n|---|---|---|---|---|\n${machine.transitions.map(t=>`| ${t.from} | ${t.to} | ${t.guardIds.join(', ')} | ${t.event} | ${t.effects.join(', ')} |`).join('\n')}\n`);
  }
  return `# Generated state contract reference\n\nContract ${states.version}. Guard descriptions do not grant permission.\n\n${rows.join('\n')}`;
}
