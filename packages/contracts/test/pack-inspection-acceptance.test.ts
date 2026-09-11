import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const ref=(type:string,version=1)=>({type,id:randomUUID(),version});
test('inspection acceptance binds immutable source, exact Job version and delivery identity',async()=>{
 const record={deliveryRef:ref('abh.pack-inspection-delivery'),resourceOrganizationId:randomUUID(),jobRef:ref('abh.pack-inspection-job',3),eventRef:ref('abh.event'),eventDigest:'sha256:'+'a'.repeat(64),sourceCommandRef:ref('abh.command'),acceptedAt:'2026-09-09T00:00:00Z',digest:'sha256:'+'0'.repeat(64)};
 assert.equal(validateContract('PackInspectionDeliveryRecord',record).success,true);
 for(const patch of [{deliveryRef:{...record.deliveryRef,version:2}},{eventRef:{...record.eventRef,version:2}},{jobRef:ref('abh.installed-pack')},{status:'Succeeded'}])assert.equal(validateContract('PackInspectionDeliveryRecord',{...record,...patch}).success,false);
 const digest=await digestContract('PackInspectionDeliveryRecord',record);
 for(const patch of [{jobRef:{...record.jobRef,version:5}},{eventDigest:'sha256:'+'b'.repeat(64)},{sourceCommandRef:ref('abh.command')},{acceptedAt:'2026-09-09T00:00:01Z'}])assert.notEqual(await digestContract('PackInspectionDeliveryRecord',{...record,...patch}),digest);
 const command={type:'abh.pack-inspection-jobs.accept-delivery',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:record.jobRef.id},payload:{jobRef:record.jobRef,eventRef:record.eventRef,eventDigest:record.eventDigest}};
 assert.equal(validateContract('AcceptPackInspectionDeliveryCommand',command).success,true);
 assert.equal(validateContract('AcceptPackInspectionDeliveryCommand',{...command,target:{...command.target,id:randomUUID()}}).success,false);
});
