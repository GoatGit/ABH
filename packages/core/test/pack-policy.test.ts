import assert from 'node:assert/strict';
import {test} from 'node:test';
import {packManifest} from './pack-fixture.ts';
import {admitPackDeployment,type PackDeploymentPolicy} from '../src/extensions/pack-policy.ts';
const policy=():PackDeploymentPolicy=>({abhVersion:'0.1.0',packId:'org.example.hello',allowedModes:['Declarative','TrustedCode','Isolated'],allowedLicenses:['Apache-2.0'],permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},hostProfileRefs:[],sharedNamespaces:[]});
test('Pack deployment checks compatible versions without implicit prerelease or namespace permissions',async()=>{
 const pack=await packManifest(),config=policy();assert.deepEqual(admitPackDeployment(pack,config),pack);
 for(const patch of [{abhVersion:'1.0.0'},{abhVersion:'0.1.1-beta.1'},{packId:'org.other.hello'},{allowedModes:[]},{allowedLicenses:[]}])assert.throws(()=>admitPackDeployment(pack,{...config,...patch}));
 assert.throws(()=>admitPackDeployment({...pack,compatibility:{abh:'nonsense'}},config),{code:'INVALID_ARGUMENT'});
 const extension={...pack,capabilities:{provides:[{kind:'hello.schema',id:'org.other.value',version:'1.0.0'}],requires:[]}};
 assert.throws(()=>admitPackDeployment(extension,config),{code:'FORBIDDEN'});
 assert.equal(admitPackDeployment(extension,{...config,sharedNamespaces:['org.other']}).capabilities.provides.length,1);
 assert.throws(()=>admitPackDeployment({...pack,permissions:{...pack.permissions,commands:['hello.write']}},config),{code:'FORBIDDEN'});
});
test('Pack isolation requires installed capability and respects every resource ceiling including zero',async()=>{
 const limits={cpuMillis:1,memoryBytes:1024,processes:1,temporaryDiskBytes:0,outputBytes:20,wallTimeMs:100};
 const pack={...await packManifest(),trust:{mode:'Isolated'},resources:{enforcement:'IsolatedLimits',...limits}},config={...policy(),isolated:{available:true,limits}};
 assert.equal(admitPackDeployment(pack,config).trust.mode,'Isolated');
 assert.throws(()=>admitPackDeployment(pack,{...config,isolated:{...config.isolated,available:false}}),{code:'PRECONDITION_FAILED'});
 for(const key of Object.keys(limits) as (keyof typeof limits)[])assert.throws(()=>admitPackDeployment({...pack,resources:{...pack.resources,[key]:limits[key]+1}},config),{code:'LIMIT_EXCEEDED'});
});
test('Pack host profile selection uses exact references and does not mutate caller data',async()=>{
 const profile={type:'abh.profile',id:'11111111-1111-4111-8111-111111111111',version:1};
 const pack={...await packManifest(),trust:{mode:'TrustedCode'},resources:{enforcement:'HostProfile',profileRef:profile}};
 assert.throws(()=>admitPackDeployment(pack,{...policy(),hostProfileRefs:[{...profile,version:2}]}),{code:'FORBIDDEN'});
 const result=admitPackDeployment(pack,{...policy(),hostProfileRefs:[profile]});result.metadata.id='org.changed.pack';assert.equal(pack.metadata.id,'org.example.hello');
});
