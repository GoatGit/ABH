import type {WorkbenchSession} from './identity';
import type {WorkbenchSettingsCommand,WorkbenchSettingsView} from './settings';
import {validateSettingsView} from './settings-validation.ts';

export class SettingsHttpError extends Error{
  readonly code:string;
  constructor(code:string){
    super('Settings request failed.');
    this.name='SettingsHttpError';
    this.code=code;
  }
}

export interface HttpSettingsAdapterOptions{
  endpoint:string;
  fetch?:typeof globalThis.fetch;
  timeoutMs?:number;
  maxResponseBytes?:number;
}

const minTimeout=100,maxTimeout=30_000,minBytes=1,maxBytes=1_048_576;

function endpointUrl(value:string):URL{
  let endpoint:URL;
  try{endpoint=new URL(value);}catch{throw new SettingsHttpError('INVALID_ARGUMENT');}
  if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password
    ||endpoint.search||endpoint.hash)throw new SettingsHttpError('INVALID_ARGUMENT');
  if(!endpoint.pathname.endsWith('/'))endpoint.pathname+='/';
  return endpoint;
}

async function boundedJson(response:Response,maxBytes:number):Promise<unknown>{
  const contentType=response.headers.get('content-type')??'';
  if(!/^application\/json(?:\s*;|$)/i.test(contentType)){
    void response.body?.cancel().catch(()=>{});
    throw new SettingsHttpError('PROTOCOL_ERROR');
  }
  const reader=response.body?.getReader();
  if(!reader)throw new SettingsHttpError('PROTOCOL_ERROR');
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>maxBytes){void reader.cancel().catch(()=>{});throw new SettingsHttpError('PAYLOAD_TOO_LARGE');}
      chunks.push(chunk.value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new SettingsHttpError('PROTOCOL_ERROR');}
}

async function requestJson(session:WorkbenchSession,endpoint:URL,path:string,requestBody:unknown,
  options:Required<Omit<HttpSettingsAdapterOptions,'endpoint'|'fetch'>>,
  fetcher:typeof globalThis.fetch,idempotencyKey?:string):Promise<unknown>{
  const stop=new AbortController();
  const timer=setTimeout(()=>stop.abort(),options.timeoutMs);
  const callerSignal=stop.signal;
  try{
    const upstreamHeaders=new Headers(await session.apiHeaders(callerSignal));
    upstreamHeaders.set('accept','application/json');
    upstreamHeaders.set('content-type','application/json');
    if(idempotencyKey!==undefined)upstreamHeaders.set('idempotency-key',idempotencyKey);
    const response=await fetcher(new URL(path,endpoint),{
      method:'POST',headers:upstreamHeaders,body:JSON.stringify(requestBody),
      signal:callerSignal,cache:'no-store',credentials:'omit',redirect:'error',
    });
    if(response.redirected)throw new SettingsHttpError('PROTOCOL_ERROR');
    if(response.status===401||response.status===403){
      void response.body?.cancel().catch(()=>{});
      throw new SettingsHttpError('FORBIDDEN');
    }
    if(response.status===404){
      void response.body?.cancel().catch(()=>{});
      throw new SettingsHttpError('FORBIDDEN');
    }
    if(response.status!==200){
      void response.body?.cancel().catch(()=>{});
      throw new SettingsHttpError('UNAVAILABLE');
    }
    return await boundedJson(response,options.maxResponseBytes);
  }catch(error){
    if(error instanceof SettingsHttpError)throw error;
    if(callerSignal.aborted)throw new SettingsHttpError('TIMEOUT');
    throw new SettingsHttpError('UNAVAILABLE');
  }finally{clearTimeout(timer);}
}

export function createHttpSettingsAdapter(options:HttpSettingsAdapterOptions){
  const endpoint=endpointUrl(options.endpoint);
  const fetcher=options.fetch??globalThis.fetch.bind(globalThis);
  const timeoutMs=options.timeoutMs??10_000;
  const maxResponseBytes=options.maxResponseBytes??262_144;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<minTimeout||timeoutMs>maxTimeout
    ||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<minBytes||maxResponseBytes>maxBytes)
    throw new SettingsHttpError('INVALID_ARGUMENT');
  const requestOptions={timeoutMs,maxResponseBytes};
  return {
    async resolve({session}:{session:WorkbenchSession}):
      Promise<WorkbenchSettingsView|null>{
      const requestBody={actorId:session.actorId,
        actingOrganizationId:session.actingOrganizationId,
        resourceOrganizationId:session.resourceOrganizationId,
        workspaceId:session.workspaceId,purposeOfUse:session.purposeOfUse,
        authorizationDigest:session.authorizationDigest};
      const value=await requestJson(session,endpoint,'resolve',requestBody,
        requestOptions,fetcher) as WorkbenchSettingsView;
      return validateSettingsView(value)?value:null;
    },
    async execute({session,commandKey,requestId,input}:{
      session:WorkbenchSession;commandKey:string;requestId:string;
      input:Record<string,unknown>;
    }):Promise<void>{
      const view=await this.resolve({session});
      if(!view)throw new SettingsHttpError('FORBIDDEN');
      const command:WorkbenchSettingsCommand|undefined=view.commands
        .find(item=>item.key===commandKey);
      if(!command)throw new SettingsHttpError('FORBIDDEN');
      await requestJson(session,endpoint,
        `commands/${encodeURIComponent(commandKey)}`,{requestId,input},
        requestOptions,fetcher,requestId);
    },
  };
}
