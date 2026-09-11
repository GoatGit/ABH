import {validateContract} from '@abh/contracts/schema';
import {createAbhClient,AbhClientError} from '@abh/core/client';

const nextSteps={
 AwaitDelivery:'Await the existing Outbox/Inbox delivery acceptance; this report does not enqueue work.',
 AttemptExecution:'An independently authorized management worker may attempt inspection within the remaining budget.',
 ObserveRunning:'Observe the current running attempt and lease; this report does not renew ownership.',
 SettleExpired:'Use the authorized expiry workflow to settle this Job; this report performs no cleanup.',
 SettleLostLease:'Use the authorized lease-loss workflow; this report does not stop or replace the worker.',
 Terminal:'Review the terminal Job and its evidence. This report does not certify installation or Enable.',
};
const remediation={
 INVALID_ARGUMENT:'Use abh doctor inspection --id UUID [--format text|json] [--timeout-ms 100..30000]. Configure ABH_API_BASE_URL and ABH_API_TOKEN.',
 UNAUTHENTICATED:'Check the API credential and its current identity binding.',
 FORBIDDEN:'Check the current management Service identity, purpose and read authority.',
 RESOURCE_NOT_FOUND:'The inspection Job is absent or not visible to the current identity.',
 SCHEMA_UNSUPPORTED:'Check client/server compatibility and installed diagnostic capabilities.',
 PRECONDITION_FAILED:'Review the current Job and evidence through the authorized management workflow.',
 DEPENDENCY_TIMEOUT:'The diagnostic wait ended. Check connectivity or retry this read with a new deadline.',
 DEPENDENCY_UNAVAILABLE:'A validated diagnostic response is unavailable. Check the API deployment and connectivity.',
};
function classify(error,signal){
 if(signal.aborted)return 'DEPENDENCY_TIMEOUT';
 if(!(error instanceof AbhClientError))return 'DEPENDENCY_UNAVAILABLE';
 if(error.code==='INVALID_ARGUMENT')return 'INVALID_ARGUMENT';
 const code=error.response?.error.code;
 if(code==='CONTEXT_EXPIRED')return 'DEPENDENCY_TIMEOUT';
 if(['AUTHORITY_REQUIRED','EPOCH_REVOKED','PURPOSE_DENIED'].includes(code))return 'FORBIDDEN';
 if(code==='VERSION_CONFLICT')return 'PRECONDITION_FAILED';
 return Object.hasOwn(remediation,code??'')?code:'DEPENDENCY_UNAVAILABLE';
}
/** A read-only query client. Token selects no actor, purpose, Grant or repair command. */
export async function runInspectionDoctor(args,{env,stdout,stderr,signal:parent}){
 let id,format='text',timeoutMs=10000,valid=true;
 const seen=new Set();
 for(let i=2;i<args.length;i++){
  const flag=args[i],value=args[++i];
  if(seen.has(flag)||!['--id','--format','--timeout-ms'].includes(flag)||value===undefined){valid=false;continue;}
  seen.add(flag);
  if(flag==='--id')id=value;
  else if(flag==='--format'){if(['text','json'].includes(value))format=value;else valid=false;}
  else if(!/^[0-9]+$/.test(value)||Number(value)<100||Number(value)>30000)valid=false;
  else timeoutMs=Number(value);
 }
 valid=valid&&validateContract('UUID',id).success;
 const baseUrl=env.ABH_API_BASE_URL,token=env.ABH_API_TOKEN;
 try{
  const url=new URL(baseUrl);
  const local=['127.0.0.1','[::1]','localhost'].includes(url.hostname);
  valid=valid&&(url.protocol==='https:'||url.protocol==='http:'&&local)&&!url.username&&!url.password&&!url.search&&!url.hash;
 }catch{valid=false;}
 valid=valid&&typeof token==='string'&&token.length<=8192&&/^[A-Za-z0-9._~+/-]+=*$/.test(token);
 let diagnostic=null,errorCode='INVALID_ARGUMENT';
 if(valid){
  const signal=AbortSignal.any([parent,AbortSignal.timeout(timeoutMs)]);
  try{
   const client=createAbhClient({baseUrl,maxResponseBytes:65536,timeoutMs,headers:async()=>({authorization:`Bearer ${token}`})});
   const response=await client.packInspections.inspect({id,consistency:'Strong'},{signal,timeoutMs});
   if(response.data.jobRef.id!==id||response.meta.stale||response.meta.asOf!==response.data.assessedAt)throw new AbhClientError('PROTOCOL_ERROR','Unknown');
   diagnostic=response.data;errorCode=null;
  }catch(error){errorCode=classify(error,signal);}
 }
 const output={commandRef:null,checkId:'pack.inspection-job',status:diagnostic?'Reported':'Failed',errorCode,evidenceRefs:diagnostic?.evidenceRefs??[],diagnostic,remediation:diagnostic?nextSteps[diagnostic.nextStep]:remediation[errorCode]};
 if(!validateContract('CliInspectionDiagnosticResult',output).success)throw new Error('DEPENDENCY_UNAVAILABLE');
 if(format==='json')stdout.write(JSON.stringify(output)+'\n');
 else{
  stdout.write(`${output.checkId}: ${output.status}${errorCode?' ('+errorCode+')':''}\n`);
  if(diagnostic)stdout.write(`Job: ${diagnostic.jobRef.id} v${diagnostic.jobRef.version} ${diagnostic.status}\nAssessed: ${diagnostic.assessedAt}\nNext step: ${diagnostic.nextStep}\nRemaining attempts: ${diagnostic.remainingAttempts}; duration: ${diagnostic.remainingDurationMs} ms\n`);
  if(diagnostic)for(const ref of diagnostic.evidenceRefs)stdout.write(`Evidence: ${ref.type}/${ref.id}@${ref.version}\n`);
  stdout.write(output.remediation+'\n');
 }
 if(errorCode)stderr.write(`abh doctor inspection: ${errorCode}\n`);
 // Successful reporting is not a claim that the underlying Job succeeded.
 return errorCode===null?0:errorCode==='INVALID_ARGUMENT'?2:['UNAUTHENTICATED','FORBIDDEN'].includes(errorCode)?3:['RESOURCE_NOT_FOUND','SCHEMA_UNSUPPORTED','PRECONDITION_FAILED'].includes(errorCode)?4:6;
}
