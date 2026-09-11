import {digestBytes,digestPackManifest} from '@abh/contracts/digest';
const bytes=new TextEncoder().encode('abc');
export const packManifest=async()=>{
  const value={apiVersion:'abh.open/v1',kind:'DomainPack',metadata:{id:'org.example.hello',version:'1.0.0',license:'Apache-2.0'},compatibility:{abh:'>=0.1.0 <1.0.0'},trust:{mode:'Declarative'},
    capabilities:{provides:[],requires:[]},permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},resources:{enforcement:'None'},
    artifacts:[{ref:'input.json',sizeBytes:3,mediaType:'application/json',digest:await digestBytes(bytes)}],migrations:[],conformance:{suiteVersion:'1.0.0'}};
  const {signaturePayload:_,...digests}=await digestPackManifest(value);
  return {...value,integrity:{...digests,signatureFormat:'application/vnd.dev.sigstore.bundle.v0.3+json',signatureRef:'proof/signature.json',provenanceRef:'proof/source.json',conformanceRef:'proof/ctk.json'}};
};
