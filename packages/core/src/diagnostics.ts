import type {CliDoctorLearningResult,CliDoctorLedgerResult,CliDoctorOperationResult,CliDoctorPackResult,CliDoctorReleaseResult,LearningCandidateDiagnostic,LedgerDiagnostic,LedgerEntryRecord,OperationDiagnostic,PackInstallDiagnostic,ReleaseDiagnostic,
  DatabaseDiagnosticResult,ProjectionHealthResult} from '@abh/contracts';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import postgres from 'postgres';
import {DatabaseReadinessError,verifyDatabase} from './data/readiness.ts';
import {ledgerRecord} from './resources/ledger.ts';

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

export interface ReleaseDiagnosticOptions {
 connectionString:string;organizationId:string;releaseId:string;workspaceId?:string;
 signal:AbortSignal;timeoutMs?:number;
}

export interface OperationDiagnosticOptions {
  connectionString:string;organizationId:string;operationId:string;workspaceId?:string;
  signal:AbortSignal;timeoutMs?:number;
}

export interface PackDiagnosticOptions {
  connectionString:string;organizationId:string;packId:string;packVersion:string;
  signal:AbortSignal;timeoutMs?:number;
}

export interface LedgerDiagnosticOptions {
  connectionString:string;organizationId:string;ledgerId:string;
  signal:AbortSignal;timeoutMs?:number;
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

export interface LearningDiagnosticOptions {
  connectionString:string;
  organizationId:string;
  candidateId?:string;
  assetKind?:string;
  workspaceId?:string;
  limit?:number;
  signal:AbortSignal;
  timeoutMs?:number;
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
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id',$1::text,true),
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

type LearningDiagnosticRow={
  id:string;record:unknown;status:string;asset_kind:string;risk:string;
  withdrawn_purposes:string[]|null;profile_count:number;profile_refs:unknown[]|null;
  evaluation_run_refs:unknown[]|null;settled_evaluation_count:number;
  gate_id:string|null;gate_ref:unknown|null;release_refs:unknown[]|null;
};

const learningFail=(organizationId:string,errorCode:NonNullable<CliDoctorLearningResult['errorCode']>,
  candidates:LearningCandidateDiagnostic[]=[],truncated=false):
  CliDoctorLearningResult=>({checkId:'learning.candidate-readiness',organizationId,status:'Failed',errorCode,
  violationCount:errorCode==='PRECONDITION_FAILED'?candidates.reduce((total,item)=>total+item.stopReasons.length,0):0,
  truncated,candidates,commandRef:null,evidenceRefs:[],remediation:{
    INVALID_ARGUMENT:'Use abh doctor learning --candidate --organization-id UUID.',
    FORBIDDEN:'Check restricted runtime credentials and organization scope.',
    PRECONDITION_FAILED:'Resolve candidate stop reasons using their registered Learning and Release commands.',
    DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
    DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[errorCode]});

/** Read-only bounded operator diagnosis; no Release, Gate, Candidate or withdrawal is mutated. */
export async function inspectLearningCandidateReadiness(options:LearningDiagnosticOptions):
  Promise<CliDoctorLearningResult>{
  const invalid=(reason?:unknown)=>{void reason;return learningFail(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.organizationId)?options.organizationId:
      '00000000-0000-4000-8000-000000000000','INVALID_ARGUMENT');};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.organizationId))
    return invalid();
  if(options.candidateId!==undefined&&!validateContract('UUID',options.candidateId).success)return invalid();
  if(options.assetKind!==undefined&&!validateContract('RegisteredName',options.assetKind).success)return invalid();
  if(options.workspaceId!==undefined&&!validateContract('UUID',options.workspaceId).success)return invalid();
  if(options.limit!==undefined&&(!Number.isInteger(options.limit)||options.limit<1||options.limit>100))return invalid();
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000)return invalid();
  let url:URL;
  try{
    url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||
      url.hostname.includes(',')||!url.username||url.hash||url.pathname.length<2)return invalid();
    if([...url.searchParams.keys()].some(key=>key!=='sslmode')||url.searchParams.getAll('sslmode').length>1)
      return invalid();
    if(!['disable','require','verify-full'].includes(url.searchParams.get('sslmode')??'disable'))return invalid();
  }catch{return invalid();}
  if(options.signal.aborted)return learningFail(options.organizationId,'DEPENDENCY_TIMEOUT');
  const mode=url.searchParams.get('sslmode')??'disable';
  const pool=postgres({host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),
    database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),
    password:()=>decodeURIComponent(url.password),ssl:mode==='disable'?false:mode as 'require'|'verify-full',
    max:1,connect_timeout:Math.min(5,timeout/1000),idle_timeout:1,max_lifetime:60,backoff:()=>0,
    prepare:true,fetch_types:true,onnotice:()=>{},target_session_attrs:'read-only' as const,
    connection:{application_name:'abh-doctor-learning',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id','${options.organizationId}',true),
        set_config('abh.acting_organization_id','${options.organizationId}',true),
        set_config('abh.workspace_id','${options.workspaceId??''}',true),
        set_config('abh.purpose_of_use','abh.learning.read',true)`);
      return (await tx.unsafe(`
        WITH page AS (
          SELECT id,record,status,asset_kind,record->>'risk' AS risk FROM core.learning_candidates
          WHERE deleted_at IS NULL
            AND ${options.candidateId?`id='${options.candidateId}'`:'id IS NOT NULL'}
            AND ${options.assetKind?`asset_kind='${options.assetKind}'`:'id IS NOT NULL'}
            AND ${options.workspaceId?`(workspace_id='${options.workspaceId}' OR workspace_id IS NULL)`:'id IS NOT NULL'}
          ORDER BY created_at DESC,id DESC LIMIT ${Math.min(Number(options.limit??100),100)+1}
        ), diagnosis AS (
          SELECT page.*,candidate.id AS candidate_id,
            withdrawal.purpose_names AS withdrawn_purposes,
            profile.profile_count,profile.profile_refs,
            evaluation.evaluation_run_refs,evaluation.settled_evaluation_count,
            gate.gate_id,gate.gate_ref,release.release_refs
          FROM page
          JOIN core.learning_candidates candidate ON candidate.id=page.id
            AND candidate.resource_organization_id=current_setting('abh.resource_organization_id',true)::uuid
          LEFT JOIN LATERAL (
            SELECT ARRAY(SELECT purpose_name FROM core.learning_withdrawals
              WHERE resource_organization_id=candidate.resource_organization_id
                AND purpose_name=ANY(ARRAY['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'])) purpose_names
          ) withdrawal ON true
          LEFT JOIN LATERAL (
            SELECT count(*)::integer AS profile_count,
              jsonb_agg(p.record->'profileRef' ORDER BY p.id) AS profile_refs
            FROM core.evaluation_profiles p
            WHERE p.resource_organization_id=candidate.resource_organization_id AND p.deleted_at IS NULL
              AND p.asset_kind=candidate.asset_kind AND p.risk=candidate.record->>'risk'
              AND p.purpose_names @> ARRAY['abh.learning.evaluate']
          ) profile ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(r.record->'runRef' ORDER BY r.created_at,r.id) AS evaluation_run_refs,
              count(*) FILTER(WHERE r.status<>'Queued')::integer AS settled_evaluation_count
            FROM core.evaluation_runs r
            WHERE r.resource_organization_id=candidate.resource_organization_id AND r.deleted_at IS NULL
              AND r.candidate_id=candidate.id
          ) evaluation ON true
          LEFT JOIN LATERAL (
            SELECT g.id AS gate_id,g.record->'gateRef' AS gate_ref FROM core.learning_gates g
            WHERE g.resource_organization_id=candidate.resource_organization_id AND g.deleted_at IS NULL
              AND g.candidate_id=candidate.id
            ORDER BY g.created_at DESC,g.id DESC LIMIT 1
          ) gate ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(rel.record->'releaseRef' ORDER BY rel.id) AS release_refs
            FROM release.releases rel CROSS JOIN LATERAL jsonb_array_elements(rel.record->'gateRefs') gate_element
            WHERE rel.resource_organization_id=candidate.resource_organization_id AND rel.deleted_at IS NULL
              AND gate_element->>'type'='abh.learning-gate' AND gate_element->>'id'=gate.gate_id::text
          ) release ON true
        ) SELECT id,record,status,asset_kind,risk,withdrawn_purposes,profile_count,
          CASE WHEN profile_count=1 THEN profile_refs->0 END AS profile_refs,
          evaluation_run_refs,settled_evaluation_count,gate_id,gate_ref,release_refs FROM diagnosis
        ORDER BY (SELECT created_at FROM core.learning_candidates candidate
          WHERE candidate.resource_organization_id=current_setting('abh.resource_organization_id',true)::uuid
            AND candidate.id=diagnosis.id) DESC,id`,
        [])) as LearningDiagnosticRow[];
    });
    const rows=await Promise.race([pending,stopped]),candidates:LearningCandidateDiagnostic[]=[];
    let violations=0;
    for(const row of rows.slice(0,100)){
      const record=validateContract('LearningCandidateRecord',row.record);
      if(!record.success)throw new Error('diagnostic record drift');
      const profileRefs=validateContract('EntityRef',row.profile_refs).success?row.profile_refs:null;
      const gateRef=validateContract('EntityRef',row.gate_ref).success?row.gate_ref:null;
      const evaluationRunRefs=(row.evaluation_run_refs??[]).filter(ref=>validateContract('EntityRef',ref).success);
      const releaseRefs=(row.release_refs??[]).filter(ref=>validateContract('EntityRef',ref).success);
      const profileCount=Number(row.profile_count??0),settledCount=Number(row.settled_evaluation_count??0);
      const withdrawnPurposes=[...new Set(row.withdrawn_purposes??[])].sort();
      const stopReasons=[
        withdrawnPurposes.length>0&&'PURPOSE_WITHDRAWN',profileCount===0&&'PROFILE_MISSING',
        profileCount>1&&'PROFILE_AMBIGUOUS',evaluationRunRefs.length===0&&'EVALUATION_MISSING',
        evaluationRunRefs.length>settledCount&&'EVALUATION_UNSETTLED',!gateRef&&'GATE_MISSING',
        gateRef&&releaseRefs.length===0&&'RELEASE_NOT_LINKED'].filter(Boolean);
      violations+=stopReasons.length;
      const diagnostic=validateContract('LearningCandidateDiagnostic',{
        candidateRef:record.data.candidateRef,status:'Draft',assetKind:String(row.asset_kind),
        risk:String(row.risk),requiredPurposes:['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'],
        withdrawnPurposes,profileRef:profileRefs,profileCount,
        evaluationRunRefs,settledEvaluationCount:Math.min(settledCount,50),gateRef,releaseRefs,stopReasons});
      if(!diagnostic.success)throw new Error('diagnostic result drift');
      candidates.push(diagnostic.data);
    }
    return violations===0?{checkId:'learning.candidate-readiness',organizationId:options.organizationId,
      status:'Passed',errorCode:null,violationCount:0,truncated:rows.length>100,candidates,
      commandRef:null,evidenceRefs:[],remediation:null}:
      learningFail(options.organizationId,'PRECONDITION_FAILED',candidates,rows.length>100);
  }catch(error){
    if(signal.aborted)return learningFail(options.organizationId,'DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return learningFail(options.organizationId,'DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))
      return learningFail(options.organizationId,'FORBIDDEN');
    return learningFail(options.organizationId,'DEPENDENCY_UNAVAILABLE');
  }finally{
    signal.removeEventListener('abort',abort);
    await pool.end({timeout:0});
  }
}

type ReleaseDiagnosticRow={
  id:string;version:string|number;status:ReleaseDiagnostic['status'];purpose_names:string[];
  workspace_id:string|null;record:import('@abh/contracts').ReleaseRecord;
  assignment_count:string|number;active_assignment_count:string|number;
  execution_allowed_assignment_count:string|number;pin_set_count:string|number;
};

function releaseFail(organizationId:string,errorCode:NonNullable<CliDoctorReleaseResult['errorCode']>,
  releases:ReleaseDiagnostic[]=[],truncated=false):CliDoctorReleaseResult{
  const safeOrganizationId=validateContract('UUID',organizationId).success
    ?organizationId:'00000000-0000-4000-8000-000000000000';
  return {checkId:'release.readiness',organizationId:safeOrganizationId,status:errorCode?'Failed':'Passed',errorCode,
    violationCount:errorCode==='PRECONDITION_FAILED'
      ?Math.max(1,releases.reduce((count,item)=>count+item.stopReasons.length,0)):0,
    truncated,releases,commandRef:null,evidenceRefs:[],remediation:{
      INVALID_ARGUMENT:'Use abh doctor release --organization-id UUID --release-id UUID.',
      FORBIDDEN:'Check restricted runtime credentials and release purpose scope.',
      PRECONDITION_FAILED:'Repair the listed release evidence, installation, assignment or rollback readiness.',
      DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
      DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[errorCode]};
}

type OperationDiagnosticRow={
  record:import('@abh/contracts').OperationRecord;
  permit:import('@abh/contracts').DispatchPermitRecord|null;
  permit_expires_at:Date|string|null;
  receipt_count:string|number;last_receipt_at:Date|string|null;
  reconciliation:import('@abh/contracts').OperationReconciliationRecord|null;
  resource_fence:import('@abh/contracts').ResourceFenceRecord|null;
};

const date=(value:Date|string|null):Date|null=>value===null?null:new Date(value);

function operationFail(organizationId:string,errorCode:NonNullable<CliDoctorOperationResult['errorCode']>,
  operations:OperationDiagnostic[]=[]):CliDoctorOperationResult{
  const safeOrganizationId=validateContract('UUID',organizationId).success
    ?organizationId:'00000000-0000-4000-8000-000000000000';
  return {checkId:'operation.readiness',organizationId:safeOrganizationId,status:errorCode?'Failed':'Passed',errorCode,
    violationCount:errorCode==='PRECONDITION_FAILED'
      ?Math.max(1,operations.reduce((count,item)=>count+item.stopReasons.length,0)):0,
    truncated:false,operations,commandRef:null,evidenceRefs:[],remediation:{
      INVALID_ARGUMENT:'Use abh doctor operation --organization-id UUID --operation-id UUID.',
      FORBIDDEN:'Check restricted runtime credentials and operation reconciliation scope.',
      PRECONDITION_FAILED:'Resolve the listed operation evidence, permission or responsibility gap.',
      DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
      DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[errorCode]};
}

/** Read-only operation recovery facts; the doctor never dispatches, queries a provider or releases responsibility. */
export async function inspectOperationReadiness(options:OperationDiagnosticOptions):
  Promise<CliDoctorOperationResult>{
  const fail=(code:NonNullable<CliDoctorOperationResult['errorCode']>):CliDoctorOperationResult=>
    operationFail(options.organizationId,code);
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000
    ||!validateContract('UUID',options.organizationId).success
    ||!validateContract('UUID',options.operationId).success
    ||(options.workspaceId!==undefined&&!validateContract('UUID',options.workspaceId).success))
    return fail('INVALID_ARGUMENT');
  let url:URL;
  try{url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)
      ||!url.hostname||!url.username||url.pathname.length<2)return fail('INVALID_ARGUMENT');
  }catch{return fail('INVALID_ARGUMENT');}
  if(options.signal.aborted)return fail('DEPENDENCY_TIMEOUT');
  const pool=postgres({host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),
    database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),
    password:()=>decodeURIComponent(url.password),ssl:false,max:1,
    connect_timeout:Math.min(5,timeout/1000),idle_timeout:1,max_lifetime:60,backoff:()=>0,
    prepare:true,fetch_types:true,target_session_attrs:'read-only' as const,onnotice:()=>{},
    connection:{application_name:'abh-doctor-operation',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending:Promise<OperationDiagnostic[]>=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id','${options.organizationId}',true),
        set_config('abh.acting_organization_id','${options.organizationId}',true),
        set_config('abh.workspace_id','${options.workspaceId??''}',true),
        set_config('abh.purpose_of_use','abh.operation.reconcile',true)`,
        []);
      const rows=await tx.unsafe(`
        SELECT o.record,
          p.record AS permit,p.expires_at AS permit_expires_at,
          (SELECT count(*) FROM execution.receipts receipt
            WHERE receipt.resource_organization_id=o.resource_organization_id
              AND receipt.operation_id=o.id AND receipt.deleted_at IS NULL) receipt_count,
          (SELECT max((receipt.record->>'observedAt')::timestamptz) FROM execution.receipts receipt
            WHERE receipt.resource_organization_id=o.resource_organization_id
              AND receipt.operation_id=o.id AND receipt.deleted_at IS NULL) last_receipt_at,
          (SELECT reconciliation.record FROM execution.reconciliations reconciliation
            WHERE reconciliation.resource_organization_id=o.resource_organization_id
              AND reconciliation.operation_id=o.id AND reconciliation.deleted_at IS NULL
            ORDER BY reconciliation.created_at DESC,reconciliation.id DESC LIMIT 1) reconciliation,
          (SELECT fence.record FROM execution.resource_fences fence
            WHERE fence.resource_organization_id=o.resource_organization_id
              AND fence.unresolved_operation_id=o.id AND fence.deleted_at IS NULL
            ORDER BY fence.created_at DESC,fence.id DESC LIMIT 1) resource_fence
        FROM execution.operations o
          LEFT JOIN execution.dispatch_permits p ON p.resource_organization_id=o.resource_organization_id
            AND p.operation_id=o.id AND p.ordinal=(o.record->>'attemptCount')::int AND p.deleted_at IS NULL
        WHERE o.id=$1::uuid AND o.deleted_at IS NULL
          AND ${options.workspaceId
            ?`(o.workspace_id='${options.workspaceId}' OR o.workspace_id IS NULL)`
            :'o.id IS NOT NULL'}`,
        [options.operationId]) as unknown as OperationDiagnosticRow[];
      const row=rows[0];if(!row)return [];
      const operationCheck=validateContract('OperationRecord',row.record);
      if(!operationCheck.success)throw new Error('diagnostic operation drift');
      const operation=operationCheck.data;
      const permit=row.permit&&validateContract('DispatchPermitRecord',row.permit).success
        ?row.permit:null;
      const reconciliation=row.reconciliation
        &&validateContract('OperationReconciliationRecord',row.reconciliation).success?row.reconciliation:null;
      const fence=row.resource_fence&&validateContract('ResourceFenceRecord',row.resource_fence).success
        ?row.resource_fence:null;
      const permitExpiresAt=date(row.permit_expires_at),lastReceiptAt=date(row.last_receipt_at);
      const permitExpired=permitExpiresAt!==null&&permitExpiresAt.getTime()<=Date.now();
      const stopReasons=[
        operation.attemptCount>0&&!permit&&'PERMIT_MISSING',
        operation.position.lifecycle==='Dispatching'&&permit&&permitExpired&&'PERMIT_EXPIRED',
        operation.position.lifecycle==='Observing'&&Number(row.receipt_count)===0&&'RECEIPT_MISSING',
        operation.position.lifecycle==='Observing'&&!reconciliation&&'RECONCILIATION_MISSING',
        operation.position.outcome==='Unknown'&&!fence&&'UNKNOWN_OUTCOME_UNPROTECTED',
        operation.position.outcome==='Unknown'&&fence&&'UNKNOWN_OUTCOME_RETAINED',
        operation.position.lifecycle==='Closed'&&!reconciliation&&'CLOSED_WITHOUT_RECONCILIATION'
      ].filter(Boolean);
      const diagnostic=validateContract('OperationDiagnostic',{operationRef:operation.operationRef,
        actionRef:operation.actionRef,planRef:operation.planRef,nodeKey:operation.nodeKey,
        position:operation.position,attemptCount:operation.attemptCount,
        providerIdempotencyKey:operation.providerIdempotencyKey,
        payloadDigest:permit?.payloadDigest??'sha256:'+'0'.repeat(64),
        permitRef:permit?.permitRef??null,permitExpiresAt:permitExpiresAt?.toISOString()??null,
        permitExpired,receiptCount:Math.min(Number(row.receipt_count),100),
        lastReceiptAt:lastReceiptAt?.toISOString()??null,
        reconciliationRef:reconciliation?.reconciliationRef??operation.reconciliationRef??null,
        reconciliationVerdict:reconciliation?.verdict??null,
        resourceFenceRef:fence?.fenceRef??null,
        remainingResponsibility:operation.position.outcome==='Unknown'||fence!==null,
        safeRetry:operation.position.lifecycle==='Dispatching'&&operation.position.outcome==='Pending'
          &&permit!==null&&!permitExpired,stopReasons});
      if(!diagnostic.success)throw new Error('diagnostic result drift');
      return [diagnostic.data];
    });
    const operations=await Promise.race([pending,stopped]);
    if(operations.length===0)return operationFail(options.organizationId,'PRECONDITION_FAILED');
    if(operations[0]!.stopReasons.length>0)return operationFail(options.organizationId,
      'PRECONDITION_FAILED',operations);
    return {...operationFail(options.organizationId,'PRECONDITION_FAILED',operations),
      status:'Passed',errorCode:null,violationCount:0,remediation:null};
  }catch(error){
    if(signal.aborted)return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))
      return fail('FORBIDDEN');
    return fail('DEPENDENCY_UNAVAILABLE');
  }finally{signal.removeEventListener('abort',abort);await pool.end({timeout:0});}
}

/** Read-only release readiness: gates, exact installed assets, eligibility, pins and rollback options. */
export async function inspectReleaseReadiness(options:ReleaseDiagnosticOptions):
  Promise<CliDoctorReleaseResult>{
  const fail=(code:NonNullable<CliDoctorReleaseResult['errorCode']>):CliDoctorReleaseResult=>
    releaseFail(options.organizationId,code);
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000
    ||!validateContract('UUID',options.organizationId).success
    ||!validateContract('UUID',options.releaseId).success
    ||(options.workspaceId!==undefined&&!validateContract('UUID',options.workspaceId).success))
    return fail('INVALID_ARGUMENT');
  let url:URL;
  try{url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)
      ||!url.hostname||!url.username||url.pathname.length<2)return fail('INVALID_ARGUMENT');
  }catch{return fail('INVALID_ARGUMENT');}
  if(options.signal.aborted)return fail('DEPENDENCY_TIMEOUT');
  const pool=postgres({host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),
    database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),
    password:()=>decodeURIComponent(url.password),ssl:false,max:1,
    connect_timeout:Math.min(5,timeout/1000),idle_timeout:1,max_lifetime:60,backoff:()=>0,
    prepare:true,fetch_types:true,target_session_attrs:'read-only' as const,onnotice:()=>{},
    connection:{application_name:'abh-doctor-release',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id',$1,true),
        set_config('abh.acting_organization_id',$1,true),set_config('abh.workspace_id',$2,true),
        set_config('abh.purpose_of_use','abh.release.manage',true)`,
        [options.organizationId,options.workspaceId??'']);
      const rows=await tx.unsafe(`
        SELECT r.id,r.version,r.status,r.purpose_names,r.workspace_id,r.record,
          (SELECT count(*)::int FROM release.assignments a WHERE a.release_id=r.id AND a.deleted_at IS NULL) assignment_count,
          (SELECT count(*)::int FROM release.assignments a WHERE a.release_id=r.id AND a.deleted_at IS NULL AND a.status='Active') active_assignment_count,
          (SELECT count(*)::int FROM release.assignments a WHERE a.release_id=r.id AND a.deleted_at IS NULL AND a.execution_allowed) execution_allowed_assignment_count,
          (SELECT count(*)::int FROM release.pin_sets p WHERE p.deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(p.record->'pins') pin WHERE (pin->>'releaseId')::uuid=r.id)) pin_set_count
        FROM release.releases r WHERE r.id=$1 AND r.deleted_at IS NULL`,
        [options.releaseId]) as ReleaseDiagnosticRow[];
      const row=rows[0];if(!row)return [];
      const checked=validateContract('ReleaseRecord',row.record);
      if(!checked.success)throw new Error('diagnostic record drift');
      const release=checked.data;
      const validEvidence=async(ref:import('@abh/contracts').EntityRef):Promise<boolean>=>{
        if(ref.type==='abh.artifact'){
          const found=await tx.unsafe(`SELECT 1 FROM data.artifacts WHERE id=$1 AND version=$2
            AND status='Available' AND deleted_at IS NULL AND 'abh.release.manage'=ANY(purpose_names)`,
            [ref.id,ref.version]);return found.length===1;}
        if(ref.type==='abh.learning-gate'){
          const found=await tx.unsafe(`SELECT 1 FROM core.learning_gates WHERE id=$1 AND version=$2
            AND verdict='Pass' AND deleted_at IS NULL`,[ref.id,ref.version]);return found.length===1;}
        return false;};
      const gateChecks=await Promise.all(release.gateRefs.map(validEvidence));
      const invalidGateRefs=release.gateRefs.filter((_,index)=>!gateChecks[index]);
      const compatibilityReady=await validEvidence(release.compatibilityRef);
      const exactRefs=release.assets.flatMap(asset=>asset.capabilityExactRefs);
      const installedRows=await Promise.all(exactRefs.map(ref=>tx.unsafe(`
        SELECT 1 FROM extension.capabilities WHERE kind=$1 AND capability_id=$2 AND capability_version=$3
          AND deleted_at IS NULL`,[ref.kind,ref.id,ref.version])));
      const installed=installedRows.filter(rows=>rows.length===1).length;
      const rollbackRows=await tx.unsafe(`
        SELECT r.record->'releaseRef' AS release_ref FROM release.releases r
        WHERE r.id<>$1::uuid AND r.status='Ready' AND r.deleted_at IS NULL
          AND 'abh.release.manage'=ANY(r.purpose_names)
          AND (r.workspace_id=$2::uuid OR r.workspace_id IS NULL)
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.record->'assets') candidate
            WHERE candidate->>'behaviorSlot'=$3::text)
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.record->'gateRefs') gate WHERE NOT (
            (gate->>'type'='abh.artifact' AND EXISTS (SELECT 1 FROM data.artifacts a
              WHERE a.id=(gate->>'id')::uuid AND a.version=(gate->>'version')::bigint AND a.status='Available'
                AND a.deleted_at IS NULL AND 'abh.release.manage'=ANY(a.purpose_names)))
            OR (gate->>'type'='abh.learning-gate' AND EXISTS (SELECT 1 FROM core.learning_gates g
              WHERE g.id=(gate->>'id')::uuid AND g.version=(gate->>'version')::bigint AND g.verdict='Pass'
                AND g.deleted_at IS NULL))))
          AND EXISTS (SELECT 1 FROM data.artifacts a WHERE a.id=(r.record->'compatibilityRef'->>'id')::uuid
            AND a.version=(r.record->'compatibilityRef'->>'version')::bigint AND a.status='Available'
            AND a.deleted_at IS NULL AND 'abh.release.manage'=ANY(a.purpose_names))
        ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
        [options.releaseId,options.workspaceId??null,release.assets[0]!.behaviorSlot]) as
        {release_ref:unknown}[];
      const rollbackCandidateRefs=rollbackRows
        .filter(row=>validateContract('EntityRef',row.release_ref).success)
        .map(row=>row.release_ref);
      const stopReasons=[
        invalidGateRefs.length>0&&'GATE_EVIDENCE_INVALID',!compatibilityReady&&'COMPATIBILITY_INVALID',
        installed<exactRefs.length&&'CAPABILITY_NOT_INSTALLED',Number(row.assignment_count)===0&&'ASSIGNMENT_MISSING',
        Number(row.execution_allowed_assignment_count)===0&&'EXECUTION_NOT_ALLOWED',
        Number(row.pin_set_count)===0&&'PIN_UNAVAILABLE',
        rollbackCandidateRefs.length===0&&'ROLLBACK_CANDIDATE_MISSING'].filter(Boolean);
      const diagnostic=validateContract('ReleaseDiagnostic',{releaseRef:release.releaseRef,
        status:row.status,purposeNames:row.purpose_names,assetCount:release.assets.length,
        installedCapabilityCount:Math.min(installed,3200),
        assignmentCount:Math.min(Number(row.assignment_count),100),
        activeAssignmentCount:Math.min(Number(row.active_assignment_count),100),
        executionAllowedAssignmentCount:Math.min(Number(row.execution_allowed_assignment_count),100),
        pinSetCount:Math.min(Number(row.pin_set_count),100),gateRefs:release.gateRefs,
        invalidGateRefs,compatibilityRef:release.compatibilityRef,compatibilityReady,
        rollbackCandidateRefs,stopReasons});
      if(!diagnostic.success)throw new Error('diagnostic result drift');
      return [diagnostic.data];
    });
    const releases=await Promise.race([pending,stopped]);
    if(releases.length===0)return releaseFail(options.organizationId,'PRECONDITION_FAILED');
    if(releases[0]!.stopReasons.length>0)return releaseFail(options.organizationId,
      'PRECONDITION_FAILED',releases);
    return {...releaseFail(options.organizationId,'PRECONDITION_FAILED',releases),
      status:'Passed',errorCode:null,violationCount:0,remediation:null};
  }catch(error){
    if(signal.aborted)return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))
      return fail('FORBIDDEN');
    return fail('DEPENDENCY_UNAVAILABLE');
  }finally{signal.removeEventListener('abort',abort);await pool.end({timeout:0});}
}

class ResourceDoctorNotFound extends Error {}

type PackDiagnosticRow={
  record:unknown;purpose_names:string[];id:string;version:string;pack_id:string;pack_version:string;
  package_digest:string;deployment_version:string;status:string;validation_bound:boolean;
  governance_bound:boolean;capability_set:{id:string;record:unknown}|null;deployment_revision_ref:unknown;
};

/** Read-only installed Pack diagnosis; signed payload bytes and runtime availability are not reasserted here. */
export async function inspectPackInstallReadiness(options:PackDiagnosticOptions):
  Promise<CliDoctorPackResult>{
  const organizationId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.organizationId)
    ?options.organizationId:'00000000-0000-4000-8000-000000000000';
  const fail=(code:NonNullable<CliDoctorPackResult['errorCode']>):CliDoctorPackResult=>
    ({checkId:'pack.install-readiness',organizationId,status:'Failed',errorCode:code,violationCount:0,
    packs:[],commandRef:null,evidenceRefs:[],remediation:{
      INVALID_ARGUMENT:'Use abh doctor pack --organization-id UUID --pack-id NAME --pack-version VERSION.',
      FORBIDDEN:'Check restricted runtime credentials and Pack management scope.',
      PRECONDITION_FAILED:'Resolve the listed installation evidence, registration or lifecycle gap.',
      DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
      DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[code]});
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000
    ||!validateContract('UUID',options.organizationId).success
    ||!validateContract('RegisteredName',options.packId).success
    ||!validateContract('ExactVersion',options.packVersion).success)return fail('INVALID_ARGUMENT');
  let url:URL;
  try{url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)
      ||!url.hostname||!url.username||url.pathname.length<2)return fail('INVALID_ARGUMENT');
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
    prepare:true,fetch_types:true,target_session_attrs:'read-only' as const,onnotice:()=>{},
    connection:{application_name:'abh-doctor-pack',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending:Promise<PackInstallDiagnostic>=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id',$1,true),
        set_config('abh.acting_organization_id',$1,true),
        set_config('abh.workspace_id','',true),
        set_config('abh.purpose_of_use','abh.pack.manage',true)`,[options.organizationId]);
      const rows=await tx.unsafe(`
        SELECT p.record,p.purpose_names,p.id,p.version::text,p.pack_id,p.pack_version,p.package_digest,
          p.deployment_version::text,p.status,
          EXISTS (SELECT 1 FROM extension.validation_reports v
            WHERE v.resource_organization_id=p.resource_organization_id
              AND v.id=(p.record#>>'{validationRef,id}')::uuid AND v.version=1
              AND v.deleted_at IS NULL AND v.record->>'reportDigest'=p.record->>'reportDigest'
              AND v.governance_ref=p.record->'governanceRef'
              AND v.governance_digest=p.record->>'governanceDigest') validation_bound,
          EXISTS (SELECT 1 FROM extension.trust_policies t
            WHERE t.resource_organization_id=p.resource_organization_id
              AND t.id=(p.record#>>'{governanceRef,id}')::uuid
              AND t.version=(p.record#>>'{governanceRef,version}')::bigint
              AND t.deleted_at IS NULL AND t.pack_id=p.pack_id
              AND t.snapshot_digest=p.record->>'governanceDigest'
              AND t.signature_payload IS NOT NULL AND t.signature_bundle IS NOT NULL
              AND t.signer_key_digest IS NOT NULL AND t.verified_at IS NOT NULL
              AND t.expires_at>clock_timestamp()) governance_bound,
          (SELECT jsonb_build_object('id',s.id,'record',s.record)
            FROM extension.capability_sets s WHERE s.resource_organization_id=p.resource_organization_id
              AND s.pack_id=p.id AND s.deleted_at IS NULL AND s.workspace_id IS NULL
              AND 'abh.pack.manage'=ANY(s.purpose_names) LIMIT 1) capability_set,
          (SELECT jsonb_build_object('type','abh.pack-deployment-revision','id',r.id,'version',r.version)
            FROM extension.deployment_revisions r WHERE r.resource_organization_id=p.resource_organization_id
              AND r.deployment_version=p.deployment_version AND r.deleted_at IS NULL
              AND r.record#>>'{targetRef,id}'=p.id::text LIMIT 1) deployment_revision_ref
        FROM extension.installed_packs p
        WHERE p.resource_organization_id=$1 AND p.pack_id=$2 AND p.pack_version=$3
          AND p.deleted_at IS NULL AND p.workspace_id IS NULL
          AND 'abh.pack.manage'=ANY(p.purpose_names)`,
        [options.organizationId,options.packId,options.packVersion]) as PackDiagnosticRow[];
      const row=rows[0];if(!row)throw new ResourceDoctorNotFound('RESOURCE_NOT_FOUND');
      const checked=validateContract('InstalledPackRecord',row.record);
      if(!checked.success)throw new Error('diagnostic record drift');
      const pack=checked.data,manifest=pack.manifest;
      const computed=await digestPackManifest(manifest);
      const identityValid=pack.packRef.type==='abh.installed-pack'&&pack.packRef.id===row.id&&
        Number(pack.packRef.version)===Number(row.version)&&row.pack_id===manifest.metadata.id&&
        row.pack_version===manifest.metadata.version&&row.package_digest===manifest.integrity.packageDigest&&
        Number(row.deployment_version)===pack.deploymentVersion&&row.status===pack.status&&
        computed.manifestDigest===manifest.integrity.manifestDigest&&
        computed.artifactSetDigest===manifest.integrity.artifactSetDigest&&
        computed.packageDigest===manifest.integrity.packageDigest;
      let capabilitySetRef:null|{type:'abh.pack-capability-set';id:string;version:number}=null;
      let registeredCount=0,capabilitiesValid=identityValid&&manifest.capabilities.provides.length<=1000;
      if(row.capability_set&&typeof row.capability_set==='object'&&'id'in row.capability_set&&'record'in row.capability_set){
        const set=validateContract('PackCapabilitySetRecord',row.capability_set.record);
        if(set.success&&set.data.packRef.id===row.id&&set.data.setRef.type==='abh.pack-capability-set'){
          capabilitySetRef={type:'abh.pack-capability-set',id:row.capability_set.id as string,
            version:Number(set.data.setRef.version)};
          const children=await tx.unsafe(`SELECT record,kind,capability_id,capability_version,version::text
            FROM extension.capabilities WHERE resource_organization_id=$1 AND set_id=$2
              AND deleted_at IS NULL AND workspace_id IS NULL AND 'abh.pack.manage'=ANY(purpose_names)
            LIMIT 1001`,[options.organizationId,capabilitySetRef.id]) as
            {record:unknown;kind:string;capability_id:string;capability_version:string;version:string}[];
          registeredCount=Math.min(children.length,1001);capabilitiesValid=children.length===set.data.registrations.length;
          const expected=new Set(manifest.capabilities.provides.map(value=>canonicalJson(value)));
          for(const child of children){
            const entry=validateContract('PackCapabilityRegistration',child.record);
            if(!entry.success||Number(child.version)!==1||child.kind!==entry.data.capability.kind||
              child.capability_id!==entry.data.capability.id||child.capability_version!==entry.data.capability.version||
              !expected.has(canonicalJson(entry.data.capability))||entry.data.packRef.id!==row.id){
              capabilitiesValid=false;continue;}
            expected.delete(canonicalJson(entry.data.capability));
          }
          capabilitiesValid&&=expected.size===0;
        }else capabilitiesValid=false;
      }
      const deploymentRevision=validateContract('EntityRef',row.deployment_revision_ref);
      const deploymentRevisionValid=deploymentRevision.success&&
        deploymentRevision.data.type==='abh.pack-deployment-revision'&&
        deploymentRevision.data.id===row.id&&Number(deploymentRevision.data.version)===1;
      const lifecycleValid=(pack.status==='Staged'||pack.enablement!==undefined)&&
        (pack.status!=='Suspended'||pack.suspension!==undefined)&&
        (pack.status!=='Retired'||pack.retirement!==undefined);
      const stopReasons=[
        !identityValid&&'RECORD_DRIFT',!row.validation_bound&&'VALIDATION_EVIDENCE_MISSING',
        !row.governance_bound&&'GOVERNANCE_EVIDENCE_MISSING',
        (!capabilitySetRef||!capabilitiesValid)&&'CAPABILITY_REGISTRATION_INVALID',
        !deploymentRevisionValid&&'DEPLOYMENT_REVISION_MISSING',!lifecycleValid&&
          (pack.status==='Suspended'?'SUSPENSION_MISSING':pack.status==='Retired'?'RETIREMENT_MISSING':'ENABLEMENT_MISSING')
      ].filter(Boolean);
      const diagnostic=validateContract('PackInstallDiagnostic',{packRef:pack.packRef,
        packId:manifest.metadata.id,packVersion:manifest.metadata.version,status:pack.status,
        deploymentVersion:pack.deploymentVersion,packageDigest:manifest.integrity.packageDigest,
        validationEvidenceBound:row.validation_bound,governanceEvidenceBound:row.governance_bound,
        capabilitySetRef,expectedCapabilityCount:manifest.capabilities.provides.length,
        registeredCapabilityCount:registeredCount,deploymentRevisionRef:deploymentRevision.success?
          deploymentRevision.data:null,manifestMigrationCount:manifest.migrations.length,stopReasons});
      if(!diagnostic.success)throw new Error('diagnostic result drift');
      return diagnostic.data;
    });
    const diagnostic=await Promise.race([pending,stopped]);
    if(diagnostic.stopReasons.length>0)return {...fail('PRECONDITION_FAILED'),
      violationCount:diagnostic.stopReasons.length,packs:[diagnostic]};
    return {...fail('PRECONDITION_FAILED'),status:'Passed',errorCode:null,violationCount:0,
      packs:[diagnostic],remediation:null};
  }catch(error){
    if(error instanceof ResourceDoctorNotFound)
      return {...fail('PRECONDITION_FAILED'),violationCount:1};
    if(signal.aborted)return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))
      return fail('FORBIDDEN');
    return fail('DEPENDENCY_UNAVAILABLE');
  }finally{signal.removeEventListener('abort',abort);await pool.end({timeout:0});}
}

type LedgerDiagnosticRow=Record<string,unknown>;

function normalizedDecimal(value:string):string{
  validateContract('NonnegativeDecimal',value);
  const [whole,fraction='']=value.split('.'),clean=fraction.replace(/0+$/,'');
  return `${BigInt(whole||'0')}${clean?`.${clean}`:''}`;
}

/** Read-only ledger audit. It rebuilds bounded immutable entries and never repairs balances. */
export async function inspectLedgerBalanceAudit(options:LedgerDiagnosticOptions):
  Promise<CliDoctorLedgerResult>{
  const organizationId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.organizationId)
    ?options.organizationId:'00000000-0000-4000-8000-000000000000';
  const fail=(code:NonNullable<CliDoctorLedgerResult['errorCode']>):CliDoctorLedgerResult=>
    ({checkId:'ledger.balance-audit',organizationId,status:'Failed',errorCode:code,violationCount:0,
    ledgers:[],commandRef:null,evidenceRefs:[],remediation:{
      INVALID_ARGUMENT:'Use abh doctor ledger --organization-id UUID --ledger-id UUID.',
      FORBIDDEN:'Check restricted runtime credentials and resource read purpose.',
      PRECONDITION_FAILED:'Reconcile the listed immutable-entry or obligation gap through an audited Ledger command.',
      DEPENDENCY_TIMEOUT:'Check database availability and retry with a bounded deadline.',
      DEPENDENCY_UNAVAILABLE:'Check database connectivity and deployment configuration.'}[code]});
  const timeout=options.timeoutMs??10000;
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000
    ||!validateContract('UUID',options.organizationId).success
    ||!validateContract('UUID',options.ledgerId).success)return fail('INVALID_ARGUMENT');
  let url:URL;
  try{url=new URL(options.connectionString);
    if(options.connectionString.length>4096||!['postgres:','postgresql:'].includes(url.protocol)
      ||!url.hostname||!url.username||url.pathname.length<2)return fail('INVALID_ARGUMENT');
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
    prepare:true,fetch_types:true,target_session_attrs:'read-only' as const,onnotice:()=>{},
    connection:{application_name:'abh-doctor-ledger',statement_timeout:Math.min(timeout,5000),
      default_transaction_read_only:true}});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]);
  let abort=()=>{};
  const decimals=(value:string):string=>normalizedDecimal(value);
  try{
    const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('stopped'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
    const pending:Promise<LedgerDiagnostic>=pool.begin('READ ONLY',async tx=>{
      await tx.unsafe(`SELECT set_config('abh.resource_organization_id',$1,true),
        set_config('abh.acting_organization_id',$1,true),
        set_config('abh.workspace_id','',true),
        set_config('abh.purpose_of_use','abh.resource.read',true)`,[options.organizationId]);
      const rows=await tx.unsafe(`
        SELECT l.*,
          EXISTS (SELECT 1 FROM resource.entries e WHERE e.resource_organization_id=l.resource_organization_id
            AND e.ledger_id=l.id AND e.deleted_at IS NULL
            OFFSET 10000) entry_limit_exceeded,
          (SELECT count(*) FROM resource.reservations r WHERE r.resource_organization_id=l.resource_organization_id
            AND r.ledger_id=l.id AND r.deleted_at IS NULL AND r.status='Held'
            ) held_count,
          (SELECT count(*) FROM resource.reservations r WHERE r.resource_organization_id=l.resource_organization_id
            AND r.ledger_id=l.id AND r.deleted_at IS NULL AND r.status='Held'
            AND r.expires_at<=clock_timestamp() ) expired_count,
          (SELECT coalesce(sum(c.remaining),0)::text FROM resource.commitments c WHERE c.resource_organization_id=l.resource_organization_id
            AND c.ledger_id=l.id AND c.deleted_at IS NULL AND c.status='Open'
            ) open_remaining,
          (SELECT count(*) FROM resource.commitments c WHERE c.resource_organization_id=l.resource_organization_id
            AND c.ledger_id=l.id AND c.deleted_at IS NULL AND c.status='Open'
          ) open_count,
          (SELECT max(o.aggregate_version) FROM data.outbox o
            WHERE o.resource_organization_id=l.resource_organization_id AND o.aggregate_type='abh.ledger'
              AND o.aggregate_id=l.id) latest_event_version
        FROM resource.ledgers l WHERE l.resource_organization_id=$1 AND l.id=$2
          AND l.deleted_at IS NULL AND 'abh.resource.read'=ANY(l.purpose_names)`,
        [options.organizationId,options.ledgerId]) as LedgerDiagnosticRow[];
      const row=rows[0];if(!row)throw new ResourceDoctorNotFound('RESOURCE_NOT_FOUND');
      const ledger=ledgerRecord(row);
      const identityValid=ledger.ledgerRef.id===row.id&&ledger.ledgerRef.version===Number(row.version)&&
        ledger.resourceOrganizationId===row.resource_organization_id&&ledger.status===row.status&&
        Number(row.version)===Number(row.latest_event_version??0)&&
        ledger.resourceType===row.resource_type&&ledger.meteringMode===row.metering_mode&&
        ledger.unit===row.unit&&ledger.limit===row.limit_amount&&
        ledger.confirmedUsage===row.confirmed_usage&&ledger.heldReservation===row.held_reservation&&
        ledger.openCommitment===row.open_commitment&&
        normalizedDecimal(ledger.limit)===normalizedDecimal(row.limit_amount)&&
        normalizedDecimal(ledger.confirmedUsage)===normalizedDecimal(row.confirmed_usage)&&
        normalizedDecimal(ledger.heldReservation)===normalizedDecimal(row.held_reservation)&&
        normalizedDecimal(ledger.openCommitment)===normalizedDecimal(row.open_commitment);
      const entries=await tx.unsafe(`SELECT record FROM resource.entries
        WHERE resource_organization_id=$1 AND ledger_id=$2 AND deleted_at IS NULL ORDER BY created_at,id LIMIT 10001`,
        [options.organizationId,options.ledgerId]) as {record:unknown}[];
      const pageLimitExceeded=Boolean(row.entry_limit_exceeded);
      let entriesValid=true;
      for(const entry of entries){
        const value=validateContract('LedgerEntryRecord',entry.record);
        if(!value.success||value.data.ledgerRef.id!==row.id||value.data.resourceOrganizationId!==row.resource_organization_id){entriesValid=false;break;}
      }
      const sums=await tx.unsafe(`SELECT coalesce(sum((record->>'limitDelta')::numeric),0)::text AS limit_amount,
        coalesce(sum((record->>'usageDelta')::numeric),0)::text AS usage,
        coalesce(sum((record->>'heldDelta')::numeric),0)::text AS held,
        coalesce(sum((record->>'commitmentDelta')::numeric),0)::text AS commitment
      FROM (SELECT record,created_at,id FROM resource.entries
        WHERE resource_organization_id=$1 AND ledger_id=$2 AND deleted_at IS NULL ORDER BY created_at,id LIMIT 10001) page`,
        [options.organizationId,options.ledgerId]) as {limit_amount:string;usage:string;held:string;commitment:string}[];
      const last=entries.at(-1)?.record;
      const lastEntry=pageLimitExceeded||last===undefined?undefined:validateContract('LedgerEntryRecord',last);
      const current={limit:ledger.limit,confirmedUsage:ledger.confirmedUsage,
        heldReservation:ledger.heldReservation,openCommitment:ledger.openCommitment};
      const recomputed={limit:decimals(sums[0]!.limit_amount),confirmedUsage:decimals(sums[0]!.usage),
        heldReservation:decimals(sums[0]!.held),openCommitment:decimals(sums[0]!.commitment)};
      const balanceDrift=!entriesValid||
        normalizedDecimal(current.limit)!==normalizedDecimal(recomputed.limit)||
        normalizedDecimal(current.confirmedUsage)!==normalizedDecimal(recomputed.confirmedUsage)||
        normalizedDecimal(current.heldReservation)!==normalizedDecimal(recomputed.heldReservation)||
        normalizedDecimal(current.openCommitment)!==normalizedDecimal(recomputed.openCommitment);
      const heldSumRows=await tx.unsafe(`SELECT coalesce(sum(amount),0)::text AS amount FROM resource.reservations
        WHERE resource_organization_id=$1 AND ledger_id=$2 AND deleted_at IS NULL AND status='Held'`,[options.organizationId,options.ledgerId]) as {amount:string}[];
      const obligationDrift=normalizedDecimal(current.heldReservation)!==normalizedDecimal(heldSumRows[0]!.amount)||
        normalizedDecimal(current.openCommitment)!==normalizedDecimal(row.open_remaining as string);
      const stopReasons=[
        !identityValid&&'LEDGER_RECORD_DRIFT',!entriesValid&&'ENTRY_RECORD_INVALID',
        (pageLimitExceeded||entries.length>10000)&&'ENTRY_LIMIT_EXCEEDED',balanceDrift&&'BALANCE_DRIFT',
        obligationDrift&&'OBLIGATION_DRIFT',Number(row.expired_count)>0&&'EXPIRED_HOLD'
      ].filter(Boolean);
      const diagnostic=validateContract('LedgerDiagnostic',{ledgerRef:ledger.ledgerRef,
        resourceType:ledger.resourceType,meteringMode:ledger.meteringMode,unit:ledger.unit,
        status:ledger.status,periodRef:ledger.periodRef,entryCount:Math.min(entries.length,10001),
        lastEntryRef:lastEntry?.success?lastEntry.data.entryRef:null,current,recomputed,
        heldReservationCount:Math.min(Number(row.held_count),1001),
        expiredHeldCount:Math.min(Number(row.expired_count),1001),
        openCommitmentCount:Math.min(Number(row.open_count),1001),
        openCommitmentRemaining:decimals(row.open_remaining as string),stopReasons});
      if(!diagnostic.success)throw new Error('diagnostic result drift');
      return diagnostic.data;
    });
    const diagnostic=await Promise.race([pending,stopped]);
    if(diagnostic.stopReasons.length>0)return {...fail('PRECONDITION_FAILED'),
      violationCount:diagnostic.stopReasons.length,ledgers:[diagnostic]};
    return {...fail('PRECONDITION_FAILED'),status:'Passed',errorCode:null,violationCount:0,
      ledgers:[diagnostic],remediation:null};
  }catch(error){
    if(error instanceof ResourceDoctorNotFound)
      return {...fail('PRECONDITION_FAILED'),violationCount:1};
    if(signal.aborted)return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&error.code==='57014')return fail('DEPENDENCY_TIMEOUT');
    if(error instanceof postgres.PostgresError&&['28P01','28000','42501'].includes(error.code))
      return fail('FORBIDDEN');
    return fail('DEPENDENCY_UNAVAILABLE');
  }finally{signal.removeEventListener('abort',abort);await pool.end({timeout:0});}
}
