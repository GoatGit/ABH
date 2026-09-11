import type {WorkbenchSession} from './identity.ts';
import type {WorkbenchCompensationAdapter,WorkbenchCompensationRequest,
  WorkbenchCompensationTemplate} from './compensation.ts';
import {validateCompensationTemplate} from './compensation-validation.ts';

export class CompensationHttpError extends Error{
  readonly code:string;
  constructor(code:string){
    super('Compensation request failed.');
    this.name='CompensationHttpError';
    this.code=code;
  }
}

export interface HttpCompensationAdapterOptions{
  endpoint:string;
  fetch?:typeof globalThis.fetch;
  timeoutMs?:number;
  maxResponseBytes?:number;
}

const minTimeout=100,maxTimeout=30_000,minBytes=1,maxBytes=1_048_576;

function endpointUrl(value:string):URL{
  let endpoint:URL;
  try{endpoint=new URL(value);}catch{throw new CompensationHttpError('INVALID_ARGUMENT');}
  if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password
    ||endpoint.search||endpoint.hash)throw new CompensationHttpError('INVALID_ARGUMENT');
  if(!endpoint.pathname.endsWith('/'))endpoint.pathname+='/';
  return endpoint;
}

async function boundedJson(response:Response,maxBytes:number):Promise<unknown>{
  const contentType=response.headers.get('content-type')??'';
  if(!/^application\/json(?:\s*;|$)/i.test(contentType)){
    void response.body?.cancel().catch(()=>{});
    throw new CompensationHttpError('PROTOCOL_ERROR');
  }
  const reader=response.body?.getReader();
  if(!reader)throw new CompensationHttpError('PROTOCOL_ERROR');
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>maxBytes){void reader.cancel().catch(()=>{});throw new CompensationHttpError('PAYLOAD_TOO_LARGE');}
      chunks.push(chunk.value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new CompensationHttpError('PROTOCOL_ERROR');}
}

export function createHttpCompensationAdapter(options:HttpCompensationAdapterOptions){
  const endpoint=endpointUrl(options.endpoint);
  const fetcher=options.fetch??globalThis.fetch.bind(globalThis);
  const timeoutMs=options.timeoutMs??10_000;
  const maxResponseBytes=options.maxResponseBytes??262_144;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<minTimeout||timeoutMs>maxTimeout
    ||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<minBytes||maxResponseBytes>maxBytes)
    throw new CompensationHttpError('INVALID_ARGUMENT');
  return {
    async resolve(session:WorkbenchSession,request:WorkbenchCompensationRequest):
      Promise<WorkbenchCompensationTemplate|null>{
    const stop=new AbortController();
    const timer=setTimeout(()=>stop.abort(),timeoutMs);
    try{
      const upstreamHeaders=new Headers(await session.apiHeaders(stop.signal));
      upstreamHeaders.set('accept','application/json');
      upstreamHeaders.set('content-type','application/json');
      const response=await fetcher(new URL('resolve',endpoint),{
        method:'POST',headers:upstreamHeaders,body:JSON.stringify({
          actorId:session.actorId,
          actingOrganizationId:session.actingOrganizationId,
          resourceOrganizationId:session.resourceOrganizationId,
          workspaceId:session.workspaceId,purposeOfUse:session.purposeOfUse,
          authorizationDigest:session.authorizationDigest,
          actionId:request.action.actionRef.id,actionVersion:request.action.actionRef.version,
        }),
        signal:stop.signal,cache:'no-store',credentials:'omit',redirect:'error',
      });
      if(response.redirected)throw new CompensationHttpError('PROTOCOL_ERROR');
      if(response.status===401||response.status===403||response.status===404){
        void response.body?.cancel().catch(()=>{});
        throw new CompensationHttpError('FORBIDDEN');
      }
      if(response.status!==200){
        void response.body?.cancel().catch(()=>{});
        throw new CompensationHttpError('UNAVAILABLE');
      }
      const value=await boundedJson(response,maxResponseBytes);
      return validateCompensationTemplate(value)?value:null;
    }catch(error){
      if(error instanceof CompensationHttpError)throw error;
      if(stop.signal.aborted)throw new CompensationHttpError('TIMEOUT');
      throw new CompensationHttpError('UNAVAILABLE');
    }finally{clearTimeout(timer);}
    },
  } satisfies WorkbenchCompensationAdapter;
}
