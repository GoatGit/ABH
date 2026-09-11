import {runInspectionDoctor} from './inspection.mjs';
import {validateContract} from '@abh/contracts/schema';
import {inspectDatabaseReadiness,inspectProjectionHealth} from '@abh/core/diagnostics';

const remediation={
 INVALID_ARGUMENT:'Use abh doctor data [--format text|json] [--timeout-ms 100..30000] and set ABH_DATABASE_RUNTIME_URL.',
 FORBIDDEN:'Check the restricted runtime credentials and catalog read permissions.',
 PRECONDITION_FAILED:'Restore the registered database schema, ownership and isolation through the maintenance workflow, then rerun doctor.',
 DEPENDENCY_TIMEOUT:'Check database availability and the diagnostic deadline, then rerun doctor.',
 DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration, then rerun doctor.',
};
const isUuid=value=>validateContract('UUID',value).success;
/** CLI owns formatting only; the Core diagnostic owns catalog access and cleanup. */
export async function runDoctor(args,{env,stdout,stderr,signal}){
 if(args[0]==='doctor'&&args[1]==='inspection')return runInspectionDoctor(args,{env,stdout,stderr,signal});
 if(args[0]==='doctor'&&args[1]==='projection'){
  let format='text',timeoutMs=10000,valid=true;
  const values={organizationId:'',subjectId:'',workspaceId:undefined,actorId:undefined};
  const seen=new Set();
  for(let i=2;i<args.length;i++){
   const flag=args[i],value=args[++i];
   if(!['--organization-id','--subject-id','--workspace-id','--actor-id','--format','--timeout-ms'].includes(flag)||value===undefined){valid=false;continue;}
   const key=flag.slice(2).replaceAll(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
   if(seen.has(flag)){valid=false;continue;}
   seen.add(flag);
   if(flag==='--format'){if(['text','json'].includes(value))format=value;else valid=false;}
   else if(flag==='--timeout-ms'){if(/^[0-9]+$/.test(value)&&Number(value)>=100&&Number(value)<=30000)timeoutMs=Number(value);else valid=false;}
   else values[key]=value;
  }
  valid=valid&&isUuid(values.organizationId)&&isUuid(values.subjectId)&&
   (values.workspaceId===undefined||isUuid(values.workspaceId))&&
   (values.actorId===undefined||isUuid(values.actorId))&&
   typeof env.ABH_DATABASE_RUNTIME_URL==='string';
  let outcome={checkId:'projection.mission-summary',projectionType:'abh.projection.mission-summary',
   subjectId:'00000000-0000-4000-8000-000000000000',status:'Failed',errorCode:'INVALID_ARGUMENT',
   violationCount:0,health:{
   checkId:'projection.mission-summary',projectionType:'abh.projection.mission-summary',
   subjectId:'00000000-0000-4000-8000-000000000000',present:false,sourceVersion:1,goalRevision:1,stopEpoch:0,
   stale:false,watermarkEventId:null,watermarkAt:null,latestEventId:null,latestEventAt:null,lagMs:0,gapCount:0,
   safeRebuildCommand:'abh.projections.refresh-mission-summary'}};
  if(valid){
   try{outcome=await inspectProjectionHealth({connectionString:env.ABH_DATABASE_RUNTIME_URL,signal,timeoutMs,...values});}
   catch{outcome={...outcome,errorCode:'DEPENDENCY_UNAVAILABLE'};}
  }
  const remediation=outcome.errorCode===null?null:{
   INVALID_ARGUMENT:'Use abh doctor projection --organization-id UUID --subject-id UUID.',
   FORBIDDEN:'Check restricted runtime credentials and organization scope.',
   PRECONDITION_FAILED:'Query current source, then submit abh.projections.refresh-mission-summary.',
   DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
   DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[outcome.errorCode];
  const output={...outcome,commandRef:null,evidenceRefs:[],remediation};
  if(!validateContract('CliDoctorProjectionResult',output).success)throw new Error('DEPENDENCY_UNAVAILABLE');
  if(format==='json')stdout.write(JSON.stringify(output)+'\n');
  else stdout.write(`${output.checkId}: ${output.status}${output.errorCode?' ('+output.errorCode+')':''}\npresent=${output.health.present} stale=${output.health.stale} lagMs=${output.health.lagMs} gaps=${output.health.gapCount}\n${output.remediation??'Projection is current and safe asynchronous rebuild is available.'}\n`);
  if(output.errorCode)stderr.write(`abh doctor projection: ${output.errorCode}\n`);
  return output.errorCode===null?0:output.errorCode==='INVALID_ARGUMENT'?2:output.errorCode==='FORBIDDEN'?3:output.errorCode==='PRECONDITION_FAILED'?4:6;
 }
 let format='text',timeoutMs=10000,valid=args[0]==='doctor'&&args[1]==='data';
 const seen=new Set();
 for(let i=2;i<args.length;i++){
  const flag=args[i],value=args[++i];
  if(seen.has(flag)||!['--format','--timeout-ms'].includes(flag)||value===undefined){valid=false;continue;}
  seen.add(flag);
  if(flag==='--format'){if(['text','json'].includes(value))format=value;else valid=false;}
  else if(!/^[0-9]+$/.test(value)||Number(value)<100||Number(value)>30000)valid=false;
  else timeoutMs=Number(value);
 }
 let result={checkId:'data.security-manifest',status:'Failed',errorCode:'INVALID_ARGUMENT',violationCount:0};
 if(valid&&typeof env.ABH_DATABASE_RUNTIME_URL==='string'){
  try{result=await inspectDatabaseReadiness({connectionString:env.ABH_DATABASE_RUNTIME_URL,signal,timeoutMs});}
  catch{result={...result,errorCode:'DEPENDENCY_UNAVAILABLE'};}
 }
 // Read-only diagnostics do not mint a Command receipt or persistent evidence.
 const output={commandRef:null,status:result.status,errorCode:result.errorCode,evidenceRefs:[],checkId:result.checkId,violationCount:result.violationCount,remediation:result.errorCode?remediation[result.errorCode]:null};
 if(!validateContract('CliDoctorDataResult',output).success)throw new Error('DEPENDENCY_UNAVAILABLE');
 if(format==='json')stdout.write(JSON.stringify(output)+'\n');
 else stdout.write(`${output.checkId}: ${output.status}${output.errorCode?' ('+output.errorCode+')':''}\n${output.remediation??'Database matches the registered security manifest.'}\n`);
 if(output.errorCode)stderr.write(`abh doctor data: ${output.errorCode}\n`);
 return output.errorCode===null?0:output.errorCode==='INVALID_ARGUMENT'?2:output.errorCode==='FORBIDDEN'?3:output.errorCode==='PRECONDITION_FAILED'?4:6;
}
