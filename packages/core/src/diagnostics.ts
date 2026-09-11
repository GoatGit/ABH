import type {DatabaseDiagnosticResult,ProjectionHealthResult} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import postgres from 'postgres';
import {DatabaseReadinessError,verifyDatabase} from './data/readiness.ts';

/** A live, read-only catalog check. No tenant queries, DDL or automatic repair. */
export interface DatabaseDiagnosticOptions {
 connectionString:string;
 signal:AbortSignal;
 timeoutMs?:number;
}
/** No SQL text, driver messages, connection credentials or catalog object names. */
export type {DatabaseDiagnosticResult} from '@abh/contracts';
export async function inspectDatabaseReadiness(options:DatabaseDiagnosticOptions):Promise<DatabaseDiagnosticResult>{
 const result=(errorCode:DatabaseDiagnosticResult['errorCode'],violationCount=0):DatabaseDiagnosticResult=>({checkId:'data.security-manifest',status:errorCode?'Failed':'Passed',errorCode,violationCount});
 const timeout=options.timeoutMs??10000;
 if(!Number.isInteger(timeout)||timeout<100||timeout>30000)return result('INVALID_ARGUMENT');
 let url:URL,host:string,database:string,user:string,password:string,ssl:false|'require'|'verify-full';
 try{
  url=new URL(options.connectionString);
  if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.hostname.includes(',')||!url.username||url.hash||url.pathname.length<2) return result('INVALID_ARGUMENT');
  if([...url.searchParams.keys()].some(key=>key!=='sslmode')||url.searchParams.getAll('sslmode').length>1)return result('INVALID_ARGUMENT');
  const mode=url.searchParams.get('sslmode')??'disable';
  if(!['disable','require','verify-full'].includes(mode))return result('INVALID_ARGUMENT');
  ssl=mode==='disable'?false:mode as 'require'|'verify-full';
  const port=Number(url.port||5432);if(!Number.isInteger(port)||port<1||port>65535)return result('INVALID_ARGUMENT');
  host=url.hostname.replace(/^\[|\]$/g,'');database=decodeURIComponent(url.pathname.slice(1));user=decodeURIComponent(url.username);password=decodeURIComponent(url.password);
 }catch{return result('INVALID_ARGUMENT');}
 if(options.signal.aborted)return result('DEPENDENCY_TIMEOUT');
 // Pin driver defaults explicitly: ambient PG* variables and URL session options
 // cannot redirect the diagnostic or disable its read-only connection setting.
 const settings={host:[host],port:[Number(url.port||5432)],database,user,password:()=>password,ssl,max:1,
  connect_timeout:Math.min(5,timeout/1000),idle_timeout:1,max_lifetime:60,max_pipeline:100,backoff:()=>0,keep_alive:30,
  prepare:true,debug:false,fetch_types:true,publications:'alltables',sslnegotiation:null,target_session_attrs:'read-only' as const,
  onnotice:()=>{},connection:{application_name:'abh-doctor-data',statement_timeout:Math.min(timeout,5000),default_transaction_read_only:true}};
 // postgres 3.4.9 accepts host/port arrays (ParsedOptions/BaseOptions), but its
 // public Options declaration narrows them to scalars. Arrays preserve IPv6.
 const pool=postgres(settings as unknown as postgres.Options<{}>);
 const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
 let abort=()=>{},pending:Promise<void>|undefined;
 try{
  const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new Error('stopped'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  pending=verifyDatabase(pool);
  await Promise.race([pending,stopped]);
  return signal.aborted?result('DEPENDENCY_TIMEOUT'):result(null);
 }catch(error){
  if(signal.aborted)return result('DEPENDENCY_TIMEOUT');
  if(error instanceof DatabaseReadinessError)return result('PRECONDITION_FAILED',error.violations.length);
  if(error instanceof postgres.PostgresError&&error.code==='57014')return result('DEPENDENCY_TIMEOUT');
  if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))return result('FORBIDDEN');
  return result('DEPENDENCY_UNAVAILABLE');
 }finally{
  signal.removeEventListener('abort',abort);
  await pool.end({timeout:0});
  if(pending)await Promise.allSettled([pending]);
 }
}

export interface ProjectionDiagnosticOptions {
  connectionString:string;
  organizationId:string;
  subjectId:string;
  workspaceId?:string;
  actorId?:string;
  signal:AbortSignal;
  timeoutMs?:number;
}
export interface ProjectionDiagnosticOutcome {
  checkId:'projection.mission-summary';
  projectionType:'abh.projection.mission-summary';
  subjectId:string;
  status:'Passed'|'Failed';
  errorCode:DatabaseDiagnosticResult['errorCode'];
  violationCount:number;
  health:ProjectionHealthResult;
}
const health=(subjectId:string,values:Partial<ProjectionHealthResult>={}):ProjectionHealthResult=>({
  checkId:'projection.mission-summary',projectionType:'abh.projection.mission-summary',subjectId,
  present:false,sourceVersion:1,goalRevision:1,stopEpoch:0,stale:false,watermarkEventId:null,
  watermarkAt:null,latestEventId:null,latestEventAt:null,lagMs:0,gapCount:0,
  safeRebuildCommand:'abh.projections.refresh-mission-summary',...values});
/** Read-only tenant health for one MissionSummary subject. Never returns projection data payloads. */
export async function inspectProjectionHealth(options:ProjectionDiagnosticOptions):
  Promise<ProjectionDiagnosticOutcome>{
  const safeSubjectId=validateContract('UUID',options.subjectId).success?options.subjectId:'00000000-0000-4000-8000-000000000000';
  const metadata={checkId:'projection.mission-summary',projectionType:'abh.projection.mission-summary',
    subjectId:safeSubjectId} as const;
  const fail=(errorCode:ProjectionDiagnosticOutcome['errorCode'],healthOverride?:ProjectionHealthResult):
    ProjectionDiagnosticOutcome=>({...metadata,status:'Failed',errorCode,violationCount:0,
      health:healthOverride??health(safeSubjectId)});
  for(const value of [options.organizationId,options.subjectId,...(options.workspaceId?[options.workspaceId]:[]),
    ...(options.actorId?[options.actorId]:[])])
    if(!validateContract('UUID',value).success)return fail('INVALID_ARGUMENT');
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000)return fail('INVALID_ARGUMENT');
  let url:URL;
  try{
    url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||
      url.hostname.includes(',')||!url.username||url.hash||url.pathname.length<2)return fail('INVALID_ARGUMENT');
    if([...url.searchParams.keys()].some(key=>key!=='sslmode')||url.searchParams.getAll('sslmode').length>1)
      return fail('INVALID_ARGUMENT');
    if(!['disable','require','verify-full'].includes(url.searchParams.get('sslmode')??'disable'))
      return fail('INVALID_ARGUMENT');
  }catch{return fail('INVALID_ARGUMENT');}
  if(options.signal.aborted)return fail('DEPENDENCY_TIMEOUT');
  const mode=url.searchParams.get('sslmode')??'disable';
  const pool=postgres({host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),
    database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),
    password:()=>decodeURIComponent(url.password),ssl:mode==='disable'?false:mode as 'require'|'verify-full',
    max:1,connect_timeout:Math.min(5,timeout/1000),idle_timeout:1,max_lifetime:60,backoff:()=>0,
    prepare:true,fetch_types:true,onnotice:()=>{},target_session_attrs:'read-only' as const,
    connection:{application_name:'abh-doctor-projection',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id',$1,true),
        set_config('abh.acting_organization_id',$1,true),
        set_config('abh.workspace_id',$2,true),set_config('abh.actor_id',$3,true),
        set_config('abh.purpose_of_use','abh.mission.manage',true)`,
        [options.organizationId,options.workspaceId??'',options.actorId??'']);
      return (await tx.unsafe(`
        WITH latest AS (
          SELECT id,created_at FROM data.outbox
          WHERE resource_organization_id=$1 AND deleted_at IS NULL AND aggregate_type='abh.mission'
            AND aggregate_id=$3 AND record->>'type' IN
              ('abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
               'abh.mission.resolve','abh.mission.block','abh.mission.complete',
               'abh.mission.projection-refresh-requested')
          ORDER BY created_at,id DESC LIMIT 1
        ), gaps AS (
          SELECT count(*)::bigint AS gap_count FROM data.outbox event
          LEFT JOIN read.projection_consumer_watermarks watermark
            ON watermark.resource_organization_id=event.resource_organization_id
             AND watermark.consumer_id='abh.projection-consumer.mission-summary'
             AND watermark.projection_type='abh.projection.mission-summary'
          WHERE event.resource_organization_id=$1 AND event.deleted_at IS NULL
            AND event.aggregate_type='abh.mission' AND event.aggregate_id=$3 AND event.record->>'type' IN
              ('abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
               'abh.mission.resolve','abh.mission.block','abh.mission.complete',
               'abh.mission.projection-refresh-requested')
            AND (watermark.id IS NULL OR (event.created_at,event.id)<=(watermark.last_event_created_at,watermark.last_event_id))
            AND NOT EXISTS(SELECT 1 FROM runtime.inbox inbox
              WHERE inbox.resource_organization_id=event.resource_organization_id
                AND inbox.consumer_id='abh.projection-consumer.mission-summary' AND inbox.event_id=event.id)
        ) SELECT mission.version AS source_version,mission.goal_revision,mission.stop_epoch,
          projection.id IS NOT NULL AS present,
          COALESCE(NULLIF(projection.record->'subjectRef'->>'version','')::bigint,1) AS projection_source_version,
          projection.stale,watermark.last_event_id AS watermark_event_id,
          watermark.last_event_created_at AS watermark_at,latest.id AS latest_event_id,
          latest.created_at AS latest_event_at,gaps.gap_count,
          GREATEST(0,CEIL(EXTRACT(EPOCH FROM(latest.created_at-COALESCE(watermark.last_event_created_at,latest.created_at)))*1000))::bigint AS lag_ms
        FROM core.missions mission
        LEFT JOIN read.projections projection
          ON projection.resource_organization_id=mission.resource_organization_id
         AND projection.projection_type='abh.projection.mission-summary' AND projection.subject_id=$3
        LEFT JOIN read.projection_consumer_watermarks watermark
          ON watermark.resource_organization_id=mission.resource_organization_id
         AND watermark.consumer_id='abh.projection-consumer.mission-summary'
         AND watermark.projection_type='abh.projection.mission-summary'
        CROSS JOIN latest CROSS JOIN gaps
        WHERE mission.resource_organization_id=$1 AND mission.id=$3 AND mission.deleted_at IS NULL
          AND (mission.workspace_id IS NULL OR mission.workspace_id=$2::uuid) LIMIT 1`,
        [options.organizationId,options.workspaceId??null,options.subjectId]))?.at(0);
    });
    const row=await Promise.race([pending,stopped]);
    const projectionSource=Number(row?.projection_source_version??1);
    const sourceVersion=Math.max(Number(row?.source_version??1),Number.isFinite(projectionSource)&&projectionSource>0?projectionSource:1);
    const result=health(safeSubjectId,{present:Boolean(row?.present),sourceVersion,
      goalRevision:Number(row?.goal_revision??1),stopEpoch:Number(row?.stop_epoch??0),
      stale:Boolean(row?.stale),watermarkEventId:row?.watermark_event_id??null,
      watermarkAt:row?.watermark_at?new Date(row.watermark_at).toISOString():null,
      latestEventId:row?.latest_event_id??null,
      latestEventAt:row?.latest_event_at?new Date(row.latest_event_at).toISOString():null,
      lagMs:Number(row?.lag_ms??0),gapCount:Number(row?.gap_count??0)});
    let violations=0;
    if(!result.present)violations++;
    if(result.stale)violations++;
    if(result.gapCount>0)violations++;
    if(result.lagMs>5_000)violations++;
    return violations?{...metadata,status:'Failed',errorCode:'PRECONDITION_FAILED',violationCount:violations,health:result}:
      {...metadata,status:'Passed',errorCode:null,violationCount:0,health:result};
  }catch(error){
    if(signal.aborted)return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))return fail('FORBIDDEN');
    return fail('DEPENDENCY_UNAVAILABLE');
  }finally{
    signal.removeEventListener('abort',abort);
    await pool.end({timeout:0});
  }
}
