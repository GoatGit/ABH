import {lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {requiredEnvironmentReferences,resolveDevelopmentConfig} from '@abh/contracts/config';

const USAGE=`abh init --template action-only|hello-business [--directory PATH] [--force]

Options:
  --template <name>       Template: action-only or hello-business
  --directory <path>      Target directory (default: .)
  --force                 Replace only template-owned files after showing their diff
  --format <fmt>          Output format: text or json (default: text)
  --help, -h              Show this help
`;

const CONFIG={
  schema:'DevelopmentConfig',
  value:{
    deployment:{profile:'Development'},identity:{provider:'Fake'},
    database:{runtimeUrlRef:'env:ABH_DATABASE_RUNTIME_URL',queueUrlRef:'env:ABH_DATABASE_QUEUE_URL'},
    runtime:{businessEntry:'./business.ts',mode:'ActionOnly'},web:{enabled:false}
  }
};

const files={
  'abh.config.json':()=>JSON.stringify({schema:CONFIG.schema,value:CONFIG.value},null,2)+'\n',
  'business.ts':()=>'/** Explicit Action-only development entry; runtime assembly remains deployment-owned. */\nexport const businessEntry = { mode: "ActionOnly" } as const;\n',
  '.env.example':()=>'# Supply both restricted roles through protected secret injection.\nABH_DATABASE_RUNTIME_URL=\nABH_DATABASE_QUEUE_URL=\n',
  'package.json':()=>JSON.stringify({name:'abh-business',private:true,type:'module',scripts:{check:'tsc --noEmit'}},null,2)+'\n',
  'tsconfig.json':()=>JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',noEmit:true,strict:true,types:['node']},include:['business.ts']},null,2)+'\n',
  'README.md':()=>'# ABH Action-only project\n\nThis project uses the explicit Development profile. Supply the two restricted database role references through a protected environment mechanism; never commit credentials.\n'
};
const helloConfig=structuredClone(CONFIG.value);helloConfig.runtime.businessEntry='./business.mjs';
const helloFiles={
  'abh.config.json':()=>JSON.stringify({schema:CONFIG.schema,value:helloConfig},null,2)+'\n',
  'business.mjs':()=>`import {defineBusiness} from '@abh/core';\n\nexport const business = await defineBusiness({\n  name:'hello.business',version:'0.1.0',mode:'ActionOnly',actions:[{\n    actionType:'hello.publish',title:'Publish internal brief',\n    description:'Propose publication of one approved internal brief.',\n    inputSchema:{type:'object',properties:{message:{type:'string',minLength:1,maxLength:2000}},required:['message'],additionalProperties:false},\n    executionPrincipalRef:{type:'abh.principal',id:'00000000-0000-4000-8000-000000000001',version:1},\n    completionPolicyRef:{type:'hello.completion-policy',id:'00000000-0000-4000-8000-000000000002',version:1},\n    riskClass:'hello.low-risk',requiredBehaviorSlots:['hello.execution'],maxOperations:1,intentExpirySeconds:86400,\n    purposeNames:['abh.action.prepare']\n  }]\n});\n`,
  'compile-pack.mjs':()=>`import {mkdir,writeFile} from 'node:fs/promises';\nimport {join} from 'node:path';\nimport {fileURLToPath} from 'node:url';\nimport {compileBusinessPack} from '@abh/core/pack';\nimport {business} from './business.mjs';\n\nconst root=fileURLToPath(new URL('./pack', import.meta.url));\nconst compiled=await compileBusinessPack({business},{deadline:Date.now()+10000,signal:new AbortController().signal});\nawait mkdir(root,{recursive:true});\nawait writeFile(join(root,'business.json'),compiled.declaration,{mode:0o600,flag:'wx'});\nawait writeFile(join(root,'manifest.json'),JSON.stringify(compiled.manifest,null,2)+'\\n',{encoding:'utf8',mode:0o600,flag:'wx'});\nawait writeFile(join(root,'ctk-plan.json'),JSON.stringify(compiled.ctk,null,2)+'\\n',{encoding:'utf8',mode:0o600,flag:'wx'});\nconsole.log(JSON.stringify({packId:compiled.manifest.metadata.id,packageDigest:compiled.manifest.integrity.packageDigest,ctkStatus:compiled.ctk.status}));\n`,
  'example.mjs':()=>`import {createAbhClient} from '@abh/core/client';\nimport {validateBusinessInput} from '@abh/core';\nimport {randomUUID} from 'node:crypto';\nimport {business} from './business.mjs';\n\nconst required=['ABH_BASE_URL','ABH_BEARER','ABH_ORGANIZATION_ID','ABH_TARGET_ID','ABH_RETENTION_POLICY_ID'];\nconst missing=required.filter(name=>!process.env[name]);\nif(missing.length)throw new Error('Missing environment: '+missing.join(', '));\nconst organizationId=process.env.ABH_ORGANIZATION_ID,targetId=process.env.ABH_TARGET_ID,retentionId=process.env.ABH_RETENTION_POLICY_ID;\nfor(const value of [organizationId,targetId,retentionId])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('ABH IDs must be UUIDs');\nconst input={message:process.argv[2]??'Approved internal brief'};\nvalidateBusinessInput(business,'hello.publish',input);\nconst client=createAbhClient({baseUrl:process.env.ABH_BASE_URL,headers:async()=>({authorization:'Bearer '+process.env.ABH_BEARER})});\nconst ref=(kind,id)=>({type:kind,id,version:1});\nconst accepted=await client.actions.propose({organizationId,idempotencyKey:process.env.ABH_IDEMPOTENCY_KEY??randomUUID(),input,\n  artifact:{ownerRef:ref('abh.organization',organizationId),purposeNames:['abh.action.prepare'],dataClass:'abh.data.internal',sourceRefs:[],region:'local',retentionPolicyRef:ref('hello.retention-policy',retentionId)},\n  action:{actionType:'hello.publish',targetRefs:[ref('hello.brief',targetId)],sourceVersionRefs:[ref('hello.brief',targetId)]}});\nconst view=(await client.actions.get(accepted.data.trackingRef.id,{consistency:'Strong'})).data;\nconsole.log(JSON.stringify({action:view.actionRef,position:view.position,business:business.digest},null,2));\n`,
  '.env.example':()=>'# Supply protected database roles and this example through a secret mechanism.\nABH_DATABASE_RUNTIME_URL=\nABH_DATABASE_QUEUE_URL=\nABH_BASE_URL=http://127.0.0.1:3000/api/v1\nABH_BEARER=\nABH_ORGANIZATION_ID=\nABH_TARGET_ID=\nABH_RETENTION_POLICY_ID=\n',
  'package.json':()=>JSON.stringify({name:'abh-hello-business',private:true,type:'module',scripts:{check:'node --check business.mjs && node --check compile-pack.mjs && node --check example.mjs',example:'node example.mjs','pack:manifest':'node compile-pack.mjs'},dependencies:{'@abh/core':'workspace:*'}},null,2)+'\n',
  'README.md':()=>'# ABH hello-business\n\nThis template declares one Action with `defineBusiness`, compiles an unsigned local Pack Manifest and an explicit `NotRun` CTK plan with `npm run pack:manifest`, and submits the Action through the public SDK. Start an explicitly installed ABH service, provide protected environment values, then run `npm run example`. The example stops before approval; approval must be made by an authorized human in your deployment-owned frontend or client. Local compilation does not sign, distribute, install, enable or execute the Pack.\n'
};
const templates={'action-only':{config:CONFIG.value,files},'hello-business':{config:helloConfig,files:helloFiles}};

function output(format,state){return format==='json'?JSON.stringify(state)+'\n':`${state.status}: ${state.directory}\n${state.files.map(file=>`  ${file.action} ${file.path}`).join('\n')}\n`;}

function unifiedDiff(current,proposed,path){
  const before=current.split(/\r?\n/),after=proposed.split(/\r?\n/);
  if(before.length>10000||after.length>10000)throw Object.assign(new Error('diff too large'),{code:'EFBIG'});
  const rows=before.length+1,columns=after.length+1,table=Array.from({length:rows},()=>new Uint16Array(columns));
  for(let i=before.length-1;i>=0;i--)for(let j=after.length-1;j>=0;j--)
    table[i][j]=before[i]===after[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const operations=[];let i=0,j=0;
  while(i<before.length&&j<after.length){
    if(before[i]===after[j]){operations.push({kind:'same',value:before[i]});i++;j++;}
    else if(table[i+1][j]>=table[i][j+1])operations.push({kind:'delete',value:before[i++]});
    else operations.push({kind:'insert',value:after[j++]});
  }
  while(i<before.length)operations.push({kind:'delete',value:before[i++]});
  while(j<after.length)operations.push({kind:'insert',value:after[j++]});
  const lines=[`--- a/${path}`,`+++ b/${path}`];let left=1,right=1;
  for(let index=0;index<operations.length;){
    let end=index;while(end<operations.length&&operations[end].kind!=='same')end++;
    const start=Math.max(0,index-3),stop=Math.min(operations.length,end+3);
    const selected=operations.slice(start,stop),leftCount=selected.filter(item=>item.kind!=='insert').length,
      rightCount=selected.filter(item=>item.kind!=='delete').length,leftStart=left+operations.slice(start,index).filter(item=>item.kind!=='insert').length,
      rightStart=right+operations.slice(start,index).filter(item=>item.kind!=='delete').length;
    lines.push(`@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`);
    for(const item of selected)lines.push((item.kind==='delete'?'-':item.kind==='insert'?'+':' ')+item.value);
    left+=selected.filter(item=>item.kind!=='insert').length;
    right+=selected.filter(item=>item.kind!=='delete').length;
    index=stop;
  }
  return lines.join('\n');
}

async function safeRead(path){try{const stat=await lstat(path);if(!stat.isFile())return null;return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return undefined;throw error;}}

export async function runInit(args,{stdout,stderr}) {
  const seen=new Set();let template,directory='.',force=false,format='text';
  for(let index=0;index<args.length;index++){
    const flag=args[index];
    if(flag==='--help'||flag==='-h'){stdout.write(USAGE);return 0;}
    if(flag==='--force'){if(seen.has(flag)){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}seen.add(flag);force=true;continue;}
    if(!['--template','--directory','--format'].includes(flag)){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
    const value=args[++index];
    if(value===undefined){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
    if(seen.has(flag)){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}seen.add(flag);
    if(flag==='--template')template=value;
    else if(flag==='--directory')directory=value;
    else if(['text','json'].includes(value))format=value;else{stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
  }
  const selected=template?templates[template]:undefined;
  if(!selected||!directory){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
  if(typeof directory!=='string'||!directory||directory.includes('\0')){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
  const root=resolve(directory);const config=resolveDevelopmentConfig(structuredClone(selected.config));
  if(!config.success){stderr.write('abh init: CONFIG_INVALID\n');return 2;}
  const environments=requiredEnvironmentReferences(structuredClone(selected.config));
  if(!environments.success||environments.data.length!==2){stderr.write('abh init: CONFIG_INVALID\n');return 2;}
  try{
    let stat;try{stat=await lstat(root);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(stat&&!stat.isDirectory())throw Object.assign(new Error('not directory'),{code:'EEXIST'});
    const existing=stat===undefined?[]:await readdir(root);
    if(existing.length&&!force)throw Object.assign(new Error('non-empty'),{code:'EEXIST'});
    const changes=[];let ownedConflict=false,unsafeTarget=false;
    for(const path of Object.keys(selected.files)){
      const target=join(root,path),current=await safeRead(target);
      if(current===null)unsafeTarget=true;
      else if(current!==undefined)changes.push({path,action:'replace',current,proposed:selected.files[path]()});
      else changes.push({path,action:'create',proposed:selected.files[path]()});
      ownedConflict||=current!==undefined;
    }
    if(unsafeTarget){stderr.write('abh init: INVALID_ARGUMENT\n');return 2;}
    if(ownedConflict&&!force){stderr.write('abh init: TARGET_NOT_EMPTY\n');return 4;}
    if(force&&format==='text')for(const change of changes)if(change.action==='replace')
      stdout.write(unifiedDiff(change.current,change.proposed,change.path)+'\n');
    if(stat===undefined)await mkdir(root,{recursive:true,mode:0o755});
    for(const change of changes){
      const target=join(root,change.path);
      await mkdir(dirname(target),{recursive:true,mode:0o755});
      await writeFile(target,change.proposed,{encoding:'utf8',mode:0o600,flag:change.action==='replace'?'w':'wx'});
    }
    const state={status:force&&ownedConflict?'Updated':'Created',errorCode:null,commandRef:null,evidenceRefs:[],directory:root,
      files:changes.map(({path,action})=>({path,action})),environmentReferences:environments.data.map(item=>item.name)};
    stdout.write(output(format,state));return 0;
  }catch(error){
    if(error.code==='EEXIST'||error.code==='ENOTDIR'||error.code==='EISDIR'){stderr.write('abh init: TARGET_NOT_EMPTY\n');return 4;}
    if(error.code==='EFBIG'){stderr.write('abh init: LIMIT_EXCEEDED\n');return 4;}
    stderr.write('abh init: DEPENDENCY_UNAVAILABLE\n');return 6;
  }
}
