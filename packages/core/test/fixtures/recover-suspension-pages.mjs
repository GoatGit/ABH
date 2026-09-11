import {discoverPackSuspensions} from '../../src/extensions/discover-pack-suspensions.ts';
import {Database} from '../../src/data/uow.ts';
import {deriveVerifiedContext} from '../../src/internal/context.ts';
import {queryStoredSuspensionPages} from '../../src/extensions/query-stored-suspension-pages.ts';
import {readSuspensionPage} from '../../src/extensions/read-suspension-page.ts';
import {assertCurrentGrants} from '../../src/control/grants.ts';
// Test-only administrative identity fixture, never a production identity ingress.
const input=JSON.parse(process.env.ABH_SUSPENSION_RECOVERY);
const database=await Database.connect(input.runtimeUrl,{max:1});
try{
 const context=deriveVerifiedContext(input.request),keys=new Set();
 const scope={type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1};
 const admit=async tx=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},input.grants);};
 const admission={discoveryFences:async()=>input.grants,fenceRefs:async()=>input.grants,discover:admit,artifact:admit};
 const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
 const management=deriveVerifiedContext(input.managementRequest);
 let eventCursor;
 do{
 const events=await discoverPackSuspensions(database,management,options(),{limit:1,...(eventCursor?{cursor:eventCursor}:{})},input.managementGrants,{fenceRefs:async()=>[],discover:async()=>{},source:{fenceRefs:async()=>[],current:async()=>{}}});
 for(const suspension of events.suspensions){
 let cursor;
 do{
  const batch=await queryStoredSuspensionPages(database,context,options(),{eventRef:suspension.eventRef,capability:input.capability,limit:1,...(cursor?{cursor}:{})},admission);
  for(const candidate of batch.pages){
   const stored=await readSuspensionPage(database,context,options(),candidate,admission);
   for(const target of stored.page.targets)keys.add(target.notificationKey);
  }
  cursor=batch.cursor;
 }while(cursor);
 }
 eventCursor=events.cursor;
 }while(eventCursor);
 process.stdout.write(JSON.stringify([...keys].sort()));
}finally{await database.close();}
