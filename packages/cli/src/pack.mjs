import {constants} from 'node:fs';
import {open,readFile,rm,stat} from 'node:fs/promises';
import {canonicalJson} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';

const USAGE=`abh pack validate --root <dir> --manifest <file> --policy <file> [options]
abh pack build --root <dir> --manifest <draft.json> --output <manifest.json> [options]
abh pack compile-business --business <business.json> --output <manifest.json> [options]
abh pack sign --manifest <file> --pack-id <id> --cosign <path> --key-ref <ENV> --public-key-ref <ENV> --output <bundle> [options]
abh pack verify --root <dir> --manifest <file> --policy <file> --trust <file> [options]

Options:
  --root <dir>            Pack payload root; links and undeclared files are rejected
  --manifest <file>       Pack manifest JSON
  --business <file>       defineBusiness declaration JSON
  --policy <file>         Local deployment policy JSON
  --format <fmt>          Output format: text or json (default: json)
  --timeout-ms <n>        100..30000 (default: 10000)
  --help, -h              Show this help
`;

const REMEDIATION={
  INVALID_ARGUMENT:'Provide an existing Pack root, manifest JSON and deployment policy JSON.',
  FORBIDDEN:'Use a deployment policy that admits this Pack identity, mode, license and permissions.',
  LIMIT_EXCEEDED:'Reduce the Pack payload or split it into smaller bounded Packs.',
  PRECONDITION_FAILED:'Repair manifest digests, declared file bytes or compatibility before retrying.',
  DEPENDENCY_TIMEOUT:'Retry with a bounded deadline after checking host load.',
  DEPENDENCY_UNAVAILABLE:'Check local filesystem access and deployment configuration.'};

function result(errorCode=null,diagnostic=null){
  const status=errorCode===null?'Passed':'Failed';
  const violationCount=['LIMIT_EXCEEDED','PRECONDITION_FAILED'].includes(errorCode)?1:0;
  return {checkId:'pack.content-validation',status,errorCode,violationCount,diagnostic,
    commandRef:null,evidenceRefs:[],remediation:errorCode===null?null:REMEDIATION[errorCode]};
}

function buildResult(errorCode=null,diagnostic=null){
  const status=errorCode===null?'Passed':'Failed';
  const violationCount=['LIMIT_EXCEEDED','PRECONDITION_FAILED'].includes(errorCode)?1:0;
  return {checkId:'pack.manifest-build',status,errorCode,violationCount,diagnostic,
    commandRef:null,evidenceRefs:[],remediation:errorCode===null?null:REMEDIATION[errorCode]};
}

function signResult(errorCode=null,diagnostic=null){
  const status=errorCode===null?'Passed':'Failed';
  const violationCount=['LIMIT_EXCEEDED','PRECONDITION_FAILED'].includes(errorCode)?1:0;
  return {checkId:'pack.signature',status,errorCode,violationCount,diagnostic,
    commandRef:null,evidenceRefs:[],remediation:errorCode===null?null:REMEDIATION[errorCode]};
}

function verifyResult(errorCode=null,diagnostic=null){
  const status=errorCode===null?'Passed':'Failed';
  const violationCount=['LIMIT_EXCEEDED','PRECONDITION_FAILED'].includes(errorCode)?1:0;
  return {checkId:'pack.supply-chain-validation',status,errorCode,violationCount,diagnostic,
    commandRef:null,evidenceRefs:[],remediation:errorCode===null?null:REMEDIATION[errorCode]};
}

async function readJson(path,maxBytes){
  const info=await stat(path);
  if(!info.isFile()||info.size>maxBytes)throw Object.assign(new Error('input'),{code:'INVALID_ARGUMENT'});
  const value=JSON.parse(await readFile(path,'utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('input'),{code:'INVALID_ARGUMENT'});
  return value;
}

export async function runPack(args,{stdout,stderr,env=process.env,signal=new AbortController().signal}) {
  const command=args[0],validate=command==='validate',sign=command==='sign',verify=command==='verify',
    compileBusiness=command==='compile-business';
  if(command!=='validate'&&command!=='build'&&command!=='sign'&&command!=='verify'&&!compileBusiness){stderr.write('abh pack: INVALID_ARGUMENT\n');return 2;}
  args=args.slice(1);
  const seen=new Set();let root,manifestPath,businessPath,policyPath,trustPath,outputPath,packId,keyRef,publicKeyRef,passwordRef,cosign,format='json',timeoutMs=10000;
  const allowed=validate?['--root','--manifest','--policy','--format','--timeout-ms']:
    compileBusiness?['--business','--output','--format','--timeout-ms']:
    sign?['--manifest','--pack-id','--cosign','--key-ref','--public-key-ref','--password-ref','--output','--format','--timeout-ms']:
    verify?['--root','--manifest','--policy','--trust','--format','--timeout-ms']:
    ['--root','--manifest','--output','--format','--timeout-ms'];
  const label=`abh pack ${command}`;
  for(let index=0;index<args.length;index++){
    const flag=args[index];
    if(flag==='--help'||flag==='-h'){stdout.write(USAGE);return 0;}
    if(!allowed.includes(flag)){stderr.write(`${label}: INVALID_ARGUMENT\n`);return 2;}
    const value=args[++index];
    if(value===undefined||seen.has(flag)){stderr.write(`${label}: INVALID_ARGUMENT\n`);return 2;}seen.add(flag);
    if(flag==='--root')root=value;else if(flag==='--manifest')manifestPath=value;else if(flag==='--business')businessPath=value;
    else if(flag==='--policy')policyPath=value;
    else if(flag==='--trust')trustPath=value;
    else if(flag==='--output')outputPath=value;else if(flag==='--pack-id')packId=value;else if(flag==='--key-ref')keyRef=value;
    else if(flag==='--public-key-ref')publicKeyRef=value;
    else if(flag==='--password-ref')passwordRef=value;else if(flag==='--cosign')cosign=value;
    else if(flag==='--format'){if(!['text','json'].includes(value)){stderr.write(`${label}: INVALID_ARGUMENT\n`);return 2;}format=value;}
    else if(!/^[0-9]+$/.test(value)||Number(value)<100||Number(value)>30000){stderr.write(`${label}: INVALID_ARGUMENT\n`);return 2;}else timeoutMs=Number(value);
  }
  const required=compileBusiness?businessPath&&outputPath:
    validate||verify?root&&manifestPath&&policyPath:
    sign?manifestPath&&packId&&cosign&&keyRef&&publicKeyRef&&outputPath:root&&manifestPath&&outputPath;
  if(!required||(passwordRef&&!/^[A-Z_][A-Z0-9_]{0,127}$/.test(passwordRef))){stderr.write(`${label}: INVALID_ARGUMENT\n`);return 2;}
  let outcome=validate?result('INVALID_ARGUMENT'):sign?signResult('INVALID_ARGUMENT'):
    verify?verifyResult('INVALID_ARGUMENT'):buildResult('INVALID_ARGUMENT');
  try{
    if(compileBusiness){
      const business=await readJson(businessPath,262_144),core=await import('@abh/core/pack'),
        options={deadline:Date.now()+timeoutMs,signal},compiled=await core.compileBusinessPack({business},options);
      const encoded=canonicalJson(compiled.manifest)+'\n';
      const sidePath=suffix=>outputPath.endsWith('.json')?outputPath.replace(/\.json$/,suffix):outputPath+suffix;
      const declarationPath=sidePath('.business.json'),ctkPath=sidePath('.ctk-plan.json'),
        exclusive=path=>open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      const manifestFile=await exclusive(outputPath);let businessFile,ctkFile;
      try{
        businessFile=await exclusive(declarationPath);ctkFile=await exclusive(ctkPath);
        const files=[[manifestFile,encoded],[businessFile,compiled.declaration],
          [ctkFile,canonicalJson(compiled.ctk)+'\n']];
        for(const [file,bytes] of files){await file.writeFile(bytes);await file.sync();}
      }catch(error){
        await Promise.allSettled([manifestFile.close(),businessFile?.close(),ctkFile?.close(),
          rm(outputPath,{force:true}),rm(declarationPath,{force:true}),rm(ctkPath,{force:true})]);
        throw error;
      }finally{
        await Promise.allSettled([manifestFile.close(),businessFile?.close(),ctkFile?.close()]);
      }
      const diagnostic={packId:compiled.manifest.metadata.id,packVersion:compiled.manifest.metadata.version,
        kind:compiled.manifest.kind,trustMode:compiled.manifest.trust.mode,license:compiled.manifest.metadata.license,
        artifactCount:1,migrationCount:0,manifestDigest:compiled.manifest.integrity.manifestDigest,
        artifactSetDigest:compiled.manifest.integrity.artifactSetDigest,packageDigest:compiled.manifest.integrity.packageDigest,
        outputBytes:encoded.length};
      outcome=buildResult(null,diagnostic);
    }else{
      const manifest=await readJson(manifestPath,1_048_576);
    const core=await import('@abh/core/pack'),options={deadline:Date.now()+timeoutMs,signal};
    if(validate){
      const policy=await readJson(policyPath,262_144);
      const validated=await core.validatePackContent({root,manifest,policy},options);
      const diagnostic={...validated,manifestDigest:validated.integrity.manifestDigest,
        artifactSetDigest:validated.integrity.artifactSetDigest,packageDigest:validated.integrity.packageDigest};
      delete diagnostic.integrity;outcome=result(null,diagnostic);
    }else if(verify){
      const policy=await readJson(policyPath,262_144),trust=await readJson(trustPath,262_144);
      const validated=await core.validateLocalPack({root,manifest,policy,trust,
        limits:{maxFileBytes:4_194_304,maxTotalBytes:67_108_864,maxEntries:10_000}},options);
      const report=validated.validation();
      outcome=verifyResult(null,{packId:report.packId,packVersion:report.packVersion,subjectDigest:report.subjectDigest,
        manifestDigest:report.manifestDigest,artifactSetDigest:report.artifactSetDigest,
        deploymentPolicyDigest:report.deploymentPolicyDigest,signatureBundleDigest:report.signatureBundleDigest,
        provenanceBundleDigest:report.provenanceBundleDigest,conformanceBundleDigest:report.conformanceBundleDigest,
        conformanceReportDigest:report.conformanceReportDigest,validatedAt:report.validatedAt,
        validUntil:report.validUntil,reportDigest:report.reportDigest});
    }else if(sign){
      if(!/^[A-Z_][A-Z0-9_]{0,127}$/.test(keyRef))throw Object.assign(new Error('key'),{code:'INVALID_ARGUMENT'});
      const privateKeyPem=env[keyRef];
      if(typeof privateKeyPem!=='string')throw Object.assign(new Error('key'),{code:'DEPENDENCY_UNAVAILABLE'});
      const publicKeyPem=env[publicKeyRef];
      if(typeof publicKeyPem!=='string')throw Object.assign(new Error('public key'),{code:'DEPENDENCY_UNAVAILABLE'});
      const password=passwordRef?env[passwordRef]:undefined;
      if(passwordRef&&typeof password!=='string')throw Object.assign(new Error('password'),{code:'DEPENDENCY_UNAVAILABLE'});
      const signed=await core.signPackManifest(manifest,{executable:cosign,privateKeyPem,publicKeyPem,password,expectedPackId:packId},options);
      const file=await open(outputPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await file.writeFile(signed.bundle);await file.sync();}finally{await file.close();}
      outcome=signResult(null,signed.diagnostic);
    }else{
      const built=await core.buildPackManifest({root,draft:manifest},options);
      const encoded=canonicalJson(built.manifest)+'\n',file=await open(outputPath,
        constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await file.writeFile(encoded);await file.sync();}finally{await file.close();}
      const diagnostic={...built.diagnostic,manifestDigest:built.diagnostic.integrity.manifestDigest,
        artifactSetDigest:built.diagnostic.integrity.artifactSetDigest,packageDigest:built.diagnostic.integrity.packageDigest};
      delete diagnostic.integrity;outcome=buildResult(null,diagnostic);
    }
    }
  }catch(error){
    const code=['INVALID_ARGUMENT','FORBIDDEN','LIMIT_EXCEEDED','PRECONDITION_FAILED','DEPENDENCY_TIMEOUT'].includes(error?.code)
      ?error.code:'DEPENDENCY_UNAVAILABLE';
    outcome=(validate?result:sign?signResult:verify?verifyResult:buildResult)(code);
  }
  if(!validateContract(validate?'CliPackValidateResult':sign?'CliPackSignResult':
    verify?'CliPackVerifyResult':'CliPackBuildResult',outcome).success)throw new Error('DEPENDENCY_UNAVAILABLE');
  if(format==='json')stdout.write(JSON.stringify(outcome)+'\n');
  else{
    stdout.write(`${outcome.checkId}: ${outcome.status}${outcome.errorCode?' ('+outcome.errorCode+')':''}\n`);
    if(outcome.diagnostic)stdout.write(`${outcome.diagnostic.packId}@${outcome.diagnostic.packVersion} `+
      (sign?`package=${outcome.diagnostic.packageDigest} bundle=${outcome.diagnostic.bundleDigest} bundleBytes=${outcome.diagnostic.bundleBytes}`:
      verify?`package=${outcome.diagnostic.subjectDigest} validUntil=${outcome.diagnostic.validUntil} report=${outcome.diagnostic.reportDigest}`:
      `artifacts=${outcome.diagnostic.artifactCount} migrations=${outcome.diagnostic.migrationCount}${validate?'':' outputBytes='+outcome.diagnostic.outputBytes}`)+'\n');
    stdout.write(`${outcome.remediation??(validate?'Pack content and deployment policy are consistent; no signature, install or execution authority was granted.':
      sign?'Cosign bundle written; provenance, CTK, installation and runtime authority remain separate.':
      verify?'Local signature, provenance, CTK and bytes verified; installation and runtime authority remain separate.':
      'Unsigned local manifest written; proof files and runtime authority were not created or granted.')}\n`);
  }
  if(outcome.errorCode)stderr.write(`${label}: ${outcome.errorCode}\n`);
  return outcome.errorCode===null?0:outcome.errorCode==='FORBIDDEN'?3:
    ['LIMIT_EXCEEDED','PRECONDITION_FAILED'].includes(outcome.errorCode)?4:
    outcome.errorCode==='INVALID_ARGUMENT'?2:6;
}
