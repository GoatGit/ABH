// Thin registry adaptation: schema validation and type generation remain upstream-owned.
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
const namePattern = /^[a-z][a-z0-9-]*(?:[.][a-z][a-z0-9-]*)+$/;
const object = (properties, required = Object.keys(properties)) => ({type:'object',properties,required,additionalProperties:false});
const ref = name => ({$ref:`#/$defs/${name}`});

export function lintProtocol(registry, definitions, states, errors, version) {
  assert(registry.version === version && registry.owner === 'ContractMaintainer' && registry.status === 'ContractOnly', 'Invalid protocol version/owner/status');
  const explicitEvents = registry.events ?? [];
  const transitionEvents = new Set(Object.values(states.machines).flatMap(machine=>machine.transitions.map(t=>t.event)));
  assert(unique(explicitEvents.map(event=>event.type)), 'Duplicate explicit event');
  for (const event of explicitEvents) {
    assert(namePattern.test(event.type) && namePattern.test(event.aggregateType) && states.owners.includes(event.owner), `Invalid explicit event: ${event.type}`);
    assert(!transitionEvents.has(event.type), `Explicit event collides with state event: ${event.type}`);
  }
  assert(unique(registry.commands.map(c=>c.type)) && unique(registry.queries.map(q=>q.type)), 'Duplicate protocol type');
  assert(unique([...registry.commands,...registry.queries].map(c=>c.name)), 'Duplicate protocol name');
  const errorCodes = new Set(errors.entries.map(e=>e.code));
  assert(registry.commonErrors?.length > 0 && unique(registry.commonErrors) && registry.commonErrors.every(e=>errorCodes.has(e)), 'Invalid common protocol errors');
  for (const entry of [...registry.commands,...registry.queries]) {
    assert(namePattern.test(entry.type) && /^[A-Z][A-Za-z0-9]*$/.test(entry.name), `Invalid protocol ID: ${entry.type}`);
    assert(states.owners.includes(entry.owner), `Unknown protocol owner: ${entry.type}`);
    assert(Array.isArray(entry.errors) && unique(entry.errors) && entry.errors.every(e=>errorCodes.has(e)), `Unregistered protocol error: ${entry.type}`);
    if (entry.visibility !== 'Internal') {
      assert(definitions[entry.response] && namePattern.test(entry.permission), `Missing response/permission: ${entry.type}`);
    }
    if (entry.visibility !== 'Internal') {
      assert(entry.purposeNames === undefined || Array.isArray(entry.purposeNames) && entry.purposeNames.length > 0 && unique(entry.purposeNames) && entry.purposeNames.every(value=>namePattern.test(value)), `Invalid command purpose registration: ${entry.type}`);
    }
  }
  for (const command of registry.commands) {
    assert(['Public','Internal'].includes(command.visibility) && ['Create','Update'].includes(command.mode), `Invalid command visibility/mode: ${command.type}`);
    assert(namePattern.test(command.targetType) && definitions[command.payload], `Invalid command target/payload: ${command.type}`);
    assert(command.visibility === 'Internal' || [200,201,202].includes(command.status), `Invalid command status: ${command.type}`);
    assert(command.visibility !== 'Internal' || (!command.response && !command.permission && !command.status), `Internal command declares HTTP metadata: ${command.type}`);
  }
  assert(unique(registry.queries.map(q=>q.path)), 'Duplicate query path');
  const filters = new Set(['kind','capabilityId','version','versionRange','id','missionId','type','lifecycle','outcome','status','missionStatus','expiry','cursor','limit','consistency','workspaceId','domainType','fieldSet']);
  for (const query of registry.queries) {
    assert(Array.isArray(query.targetTypes) && query.targetTypes.length > 0 && unique(query.targetTypes) && query.targetTypes.every(value=>namePattern.test(value)) && Array.isArray(query.purposeNames) && query.purposeNames.length > 0 && unique(query.purposeNames) && query.purposeNames.every(value=>namePattern.test(value)), `Missing query target/purpose registration: ${query.type}`);
    assert(/^\/v1\/(?:[a-z0-9./-]+)(?:\{id\})?$/.test(query.path), `Invalid query path: ${query.type}`);
    assert(unique(query.filters) && query.filters.every(f=>filters.has(f)) && (query.requiredFilters ?? []).every(f=>query.filters.includes(f)), `Unregistered query filter: ${query.type}`);
  }
}

export function buildProtocol(registry, states, errors, base, factsNames = []) {
  const definitions = {};
  const publicRef = name => ({$ref:`${base}:public#/$defs/${name}`});
  const workflowRef = name => ({$ref:`${base}:workflow#/$defs/${name}`});
  const stateRef = name => ({$ref:`${base}:states#/$defs/${name}`});
  const selector = type => object({type:{const:type},id:publicRef('UUID')});
  const paths = {};
  const schemaRef = name => ({$ref:`#/components/schemas/${name}`});
  const errorResponses = entry => Object.fromEntries([...new Set([...registry.commonErrors,...entry.errors].map(code=>errors.entries.find(e=>e.code===code).httpStatus))].sort().map(status=>[status,{description:'Registered, sanitized error',content:{'application/json':{schema:schemaRef('ErrorResponse')}}}]));
  const headers = status => ({ETag:{description:'Strong quoted aggregate version',schema:{type:'string',pattern:'^"[1-9][0-9]*"$'}},...(status===202?{Location:{description:'Persistent tracking resource URI',schema:{type:'string',format:'uri-reference'}}}:{})});
  const metadata = entry => ({operationId:entry.name,'x-abh-implementation':'Unavailable','x-abh-owner':entry.owner,'x-abh-permission':entry.permission,'x-abh-errors':[...new Set([...registry.commonErrors,...entry.errors])],security:[{session:[]}]});
  for (const command of registry.commands) {
    const properties = {target:selector(command.targetType),payload:factsNames.includes(command.payload)?{$ref:`${base}:facts#/$defs/${command.payload}`}:workflowRef(command.payload)};
    const identity = {type:{const:command.type},schemaVersion:{const:registry.version},commandId:publicRef('UUID'),idempotencyKey:workflowRef('IdempotencyKey')};
    if (command.mode === 'Update') properties.expectedVersion = publicRef('Version');
    definitions[`${command.name}Command`] = object({...identity,...properties});
    definitions[`${command.name}Command`]['x-abh-digest-fields'] = ['type','target','payload',...(command.mode==='Update'?['expectedVersion']:[])];
    if (command.visibility === 'Internal') continue;
    // Optional duplicate fields permit explicit equality checks, never precedence guessing.
    definitions[`${command.name}HttpRequest`] = object({...properties,idempotencyKey:workflowRef('IdempotencyKey')},['target','payload']);
    paths[`/v1/commands/${command.type}`] = {post:{...metadata(command),parameters:[
      {in:'header',name:'Idempotency-Key',required:true,schema:schemaRef('IdempotencyKey')},
      ...(command.mode==='Update'?[{in:'header',name:'If-Match',required:true,schema:{type:'string',pattern:'^"[1-9][0-9]*"$'}}]:[]),
    ],requestBody:{required:true,content:{'application/json':{schema:schemaRef(`${command.name}HttpRequest`)}}},responses:{
      ...errorResponses(command),[command.status]:{description:command.status===202?'Persisted acceptance; external effects may still be pending':'Committed internal fact',headers:headers(command.status),content:{'application/json':{schema:schemaRef(command.response)}}},
    }}};
  }
  definitions.CommandEnvelope = {oneOf:registry.commands.map(c=>ref(`${c.name}Command`))};
  for (const query of registry.queries) {
    assert(Array.isArray(query.targetTypes) && query.targetTypes.length > 0 && unique(query.targetTypes) && query.targetTypes.every(value=>namePattern.test(value)) && Array.isArray(query.purposeNames) && query.purposeNames.length > 0 && unique(query.purposeNames) && query.purposeNames.every(value=>namePattern.test(value)), `Missing query target/purpose registration: ${query.type}`);
    const filterSchemas = {kind:publicRef('RegisteredName'),capabilityId:publicRef('RegisteredName'),version:publicRef('ExactVersion'),versionRange:{type:'string',minLength:1,maxLength:256},id:publicRef('UUID'),missionId:publicRef('UUID'),type:publicRef('RegisteredName'),lifecycle:stateRef('ActionState'),outcome:stateRef('ActionOutcome'),status:stateRef('DecisionState'),missionStatus:stateRef('MissionState'),expiry:publicRef('Time'),cursor:{type:'string',minLength:1,maxLength:2048},limit:{type:'integer',minimum:1,maximum:100,default:25},consistency:{enum:['Strong','Projection'],default:'Strong'},workspaceId:publicRef('UUID'),domainType:publicRef('RegisteredName'),fieldSet:{type:'string',minLength:1,maxLength:1024}};
    definitions[`${query.name}Query`] = object(Object.fromEntries(query.filters.map(f=>[f,filterSchemas[f]])),query.requiredFilters??[]);
    paths[query.path] = {get:{...metadata(query),parameters:[...(query.path.includes('{id}')?[{in:'path',name:'id',required:true,schema:schemaRef('UUID')}]:[]),...query.filters.map(f=>({in:'query',name:f,required:(query.requiredFilters??[]).includes(f),schema:filterSchemas[f]}))],responses:{...errorResponses(query),200:{description:'Permission-filtered query result; Strong describes internal facts',content:{'application/json':{schema:schemaRef(query.response)}}}}}};
  }
  const events = {};
  for (const event of registry.events ?? []) {
    assert(!events[event.type] && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(event.type) && states.owners.includes(event.owner), `Invalid explicit event registration: ${event.type}`);
    events[event.type] = event.aggregateType;
  }
  for (const machine of Object.values(states.machines)) for (const transition of machine.transitions) {
    const type = transition.event;
    const aggregateType = type.slice(0,type.lastIndexOf('.'));
    events[type] = aggregateType;
  }
  definitions.EventEnvelope = {oneOf:Object.entries(events).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([type,aggregateType])=>object({
    eventId:publicRef('UUID'),type:{const:type},schemaVersion:{const:registry.version},aggregateRef:object({type:{const:aggregateType},id:publicRef('UUID'),version:publicRef('Version')}),aggregateVersion:publicRef('Version'),eventOrdinal:{type:'integer',minimum:0,maximum:1000},occurredAt:publicRef('Time'),correlationId:publicRef('UUID'),causationId:publicRef('UUID'),actorRef:publicRef('Actor'),actingOrganizationId:publicRef('UUID'),resourceOrganizationId:publicRef('UUID'),workspaceId:publicRef('UUID'),payload:workflowRef('EventChangeSummary'),
  },['eventId','type','schemaVersion','aggregateRef','aggregateVersion','eventOrdinal','occurredAt','correlationId','causationId','actorRef','actingOrganizationId','resourceOrganizationId','payload']))};
  for (const [name,definition] of Object.entries(definitions)) definition.title = name;
  return {schema:{$schema:'https://json-schema.org/draft/2020-12/schema',$id:`${base}:protocol`,$defs:definitions},paths,events};
}

/** Only structural navigation metadata is shipped; this is not a runtime schema compiler. */
export function contractShape(schema) {
  const shape = {};
  if (schema.$ref) shape.ref = schema.$ref.split('/$defs/')[1];
  if (schema.properties) {
    shape.properties = Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,contractShape(v)]));
    const constants = Object.entries(schema.properties).filter(([,v])=>Object.hasOwn(v,'const'));
    if (constants.length) shape.constants = Object.fromEntries(constants.map(([k,v])=>[k,v.const]));
  }
  if (schema.items) shape.items = contractShape(schema.items);
  if (schema['x-abh-set']) shape.set = true;
  const branches = [...(schema.allOf??[]),...(schema.oneOf??[]),...(schema.anyOf??[])];
  if (branches.length) shape.branches = branches.map(contractShape);
  return shape;
}

export function lintSemanticMetadata(definitions) {
  for (const [name,schema] of Object.entries(definitions)) {
    const fields = schema['x-abh-digest-fields'];
    if (fields) assert(fields.length > 0 && unique(fields) && fields.every(f=>schema.properties && Object.hasOwn(schema.properties,f)) && !fields.some(f=>['digest','issuanceDigest','packageDigest'].includes(f)), `Invalid digest fields: ${name}`);
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (value['x-abh-set']) assert(value.type === 'array' && value.uniqueItems === true, `Set must reject duplicates: ${name}`);
      for (const child of Object.values(value)) walk(child);
    };
    walk(schema);
  }
}
