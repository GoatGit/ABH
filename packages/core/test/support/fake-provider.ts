import {randomUUID} from 'node:crypto';
import type {CapabilityRef,DispatchPermitRecord} from '@abh/contracts';
import type {ConnectorTransport} from '../../src/execution/transport.ts';

interface ExternalRecord {externalId:string;providerKey:string;payload:Uint8Array;version:number;visibleAt:number}
/** Stateful external fixture: actual call count and remote records are independent of local Operation status. */
export class FakeProvider implements ConnectorTransport {
  readonly capabilityRef:CapabilityRef;
  readonly records:ExternalRecord[]=[];
  calls=0;
  mode:'Success'|'ResponseLost'|'DelayVisibility'|'Duplicate'|'Rejected'='Success';
  now=0;
  constructor(capability:CapabilityRef){this.capabilityRef=structuredClone(capability);}
  async send({permit,payload,signal}:{permit:DispatchPermitRecord;payload:Uint8Array;signal:AbortSignal}):Promise<Uint8Array>{
    signal.throwIfAborted();this.calls++;
    if(this.mode==='Rejected')return new TextEncoder().encode(JSON.stringify({rejected:true,providerKey:permit.providerIdempotencyKey}));
    const previous=this.records.find(row=>row.providerKey===permit.providerIdempotencyKey);
    const record=previous??{externalId:randomUUID(),providerKey:permit.providerIdempotencyKey,payload:new Uint8Array(payload),version:1,visibleAt:this.mode==='DelayVisibility'?this.now+5000:this.now};
    if(!previous)this.records.push(record);
    if(this.mode==='Duplicate'&&!previous)this.records.push({...record,externalId:randomUUID()});
    if(this.mode==='ResponseLost')throw new Error('fake response lost after commit');
    return new TextEncoder().encode(JSON.stringify({externalId:record.externalId,version:record.version,providerKey:record.providerKey}));
  }
  query(providerKey:string):ExternalRecord[]{return this.records.filter(row=>row.providerKey===providerKey&&row.visibleAt<=this.now).map(row=>({...row,payload:new Uint8Array(row.payload)}));}
}
