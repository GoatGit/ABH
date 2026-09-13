import {createHash,createHmac,createPublicKey,createSecretKey,timingSafeEqual,
  verify as verifySignature,type JsonWebKey,type KeyObject} from 'node:crypto';
import type {
  WorkbenchIdentityAdapter,WorkbenchOrganizationChoice,WorkbenchOrganizationSelection,
  WorkbenchSession,
} from './identity';

/** Environment-driven production identity adapter: verifies the Bearer JWT presented by the
 *  browser (RS256/ES256 via a JWKS endpoint, or HS256 via a configured shared secret), then
 *  relays the verified token to the ABH API server-side. The organization cookie is only a
 *  selection hint; membership always comes from the verified token claims. Sessions fail
 *  closed: any verification problem resolves to null. */

const SUPPORTED_ASYMMETRIC=new Set(['RS256','ES256']);
const CLOCK_LEEWAY_SECONDS=60;
const JWKS_CACHE_MS=60*60_000;
const JWKS_RETRY_MS=30_000;
const FETCH_TIMEOUT_MS=5_000;
const MAX_TOKEN_BYTES=16*1024;
const MAX_ORGS=32;

/** Reads only the ABH_IDENTITY_* variables; typed loosely so host environments can pass
 *  process.env directly. Variables are never logged or embedded in errors. */
export type ProductionIdentityEnv=Record<string,string|undefined>;

interface Jwk{
  kty:string;kid?:string;alg?:string;use?:string;crv?:string;
  n?:string;e?:string;x?:string;y?:string;
}

export function createProductionIdentityAdapter(env:ProductionIdentityEnv):
  WorkbenchIdentityAdapter|null{
  const issuer=env.ABH_IDENTITY_ISSUER,audience=env.ABH_IDENTITY_AUDIENCE;
  if(!issuer||!audience)return null;
  if((env.ABH_IDENTITY_JWKS_URL?1:0)+(env.ABH_IDENTITY_SHARED_SECRET?1:0)!==1)
    throw new TypeError('Configure exactly one of ABH_IDENTITY_JWKS_URL or ABH_IDENTITY_SHARED_SECRET');
  const jwksUrl=env.ABH_IDENTITY_JWKS_URL?new URL(env.ABH_IDENTITY_JWKS_URL):undefined;
  if(jwksUrl&&jwksUrl.protocol!=='https:'&&!isLoopback(jwksUrl.hostname))
    throw new TypeError('ABH_IDENTITY_JWKS_URL must use https');
  const purpose=env.ABH_IDENTITY_PURPOSE??'abh.mission.manage';
  const fallbackOrg=env.ABH_IDENTITY_ORGANIZATION;
  const secret=env.ABH_IDENTITY_SHARED_SECRET;
  const keys=new Map<string,{key:KeyObject;fetchedAt:number}>();
  let lastFetch=0;

  const resolveKey=async(header:JwtHeader,signal:AbortSignal):Promise<{
    key:KeyObject;alg:string}>=>{
    if(secret){
      if(header.alg!=='HS256')throw new Error('alg mismatch');
      return {key:createHmacKey(secret),alg:header.alg};
    }
    if(!jwksUrl||!SUPPORTED_ASYMMETRIC.has(header.alg)||!header.kid)throw new Error('alg mismatch');
    const now=Date.now();
    const cached=keys.get(header.kid);
    if(!cached||now-cached.fetchedAt>JWKS_CACHE_MS){
      if(now-lastFetch<JWKS_RETRY_MS&&cached)throw new Error('jwks refresh pending');
      await fetchJwks(jwksUrl,signal);
    }
    const fresh=keys.get(header.kid);
    if(!fresh)throw new Error('unknown kid');
    return {key:fresh.key,alg:header.alg};
  };

  const fetchJwks=async(url:URL,signal:AbortSignal):Promise<void>=>{
    lastFetch=Date.now();
    const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      headers:{accept:'application/json'},cache:'no-store'});
    if(!response.ok)throw new Error('jwks unavailable');
    const document=await response.json() as {keys?:Jwk[]};
    if(!Array.isArray(document.keys)||document.keys.length>50)throw new Error('invalid jwks');
    for(const jwk of document.keys){
      if(!jwk.kid||jwk.use&&jwk.use!=='sig')continue;
      if(jwk.kty==='RSA'&&jwk.n&&jwk.e){
        keys.set(jwk.kid,{key:createPublicKey({key:jwk as JsonWebKey,format:'jwk'}),
          fetchedAt:Date.now()});
      }else if(jwk.kty==='EC'&&jwk.x&&jwk.y&&jwk.crv==='P-256'){
        keys.set(jwk.kid,{key:createPublicKey({key:jwk as JsonWebKey,format:'jwk'}),
          fetchedAt:Date.now()});
      }
    }
  };

  return {
    async resolve(requestHeaders,selection){
      const bearer=bearerToken(requestHeaders);
      if(!bearer)return null;
      let claims:Record<string,unknown>;
      try{
        const key=await resolveKey(bearer.header,new AbortController().signal);
        verifyJwt(bearer,key);
        claims=bearer.claims;
        requireIssuerAudience(claims,issuer,audience);
        if(typeof claims.exp==='number'&&claims.exp+ CLOCK_LEEWAY_SECONDS<Date.now()/1000)
          return null;
        if(typeof claims.nbf==='number'&&claims.nbf-CLOCK_LEEWAY_SECONDS>Date.now()/1000)
          return null;
      }catch{return null;}
      const actor=stringClaim(claims.sub)??stringClaim(claims.uid);
      if(!actor)return null;
      const organizations=organizationChoices(claims,fallbackOrg);
      if(!organizations)return null;
      const chosen=pickOrganization(organizations,selection)??organizations[0]!;
      const sessionPurpose=stringClaim(claims.abh_purpose)??purpose;
      const authorizationDigest=createHash('sha256').update(JSON.stringify({
        actor,organizations:organizations.map(org=>[org.actingOrganizationId,org.resourceOrganizationId,
          org.workspaceId??null]),purpose:sessionPurpose})).digest('hex');
      const token=bearer.token;
      const session:WorkbenchSession={
        actorId:actor,
        displayName:stringClaim(claims.name)??stringClaim(claims.preferred_username)??actor,
        actingOrganizationId:chosen.actingOrganizationId,
        resourceOrganizationId:chosen.resourceOrganizationId,
        organizationSelectionKey:chosen.key,
        switchableOrganizations:organizations.filter(org=>org.key!==chosen.key),
        ...(chosen.workspaceId?{workspaceId:chosen.workspaceId}:{}),
        purposeOfUse:sessionPurpose,
        authorizationDigest,
        apiHeaders:async()=>({authorization:`Bearer ${token}`}),
      };
      return session;
    },
  };
}

function isLoopback(hostname:string):boolean{
  return hostname==='localhost'||hostname==='127.0.0.1'||hostname==='::1'||hostname==='[::1]';
}

interface Bearer{
  token:string;header:JwtHeader;claims:Record<string,unknown>;signingInput:string;signature:Buffer;
}
interface JwtHeader{alg:string;kid?:string}

function bearerToken(headers:Headers):Bearer|undefined{
  const raw=headers.get('authorization');
  if(!raw||!/^Bearer [^ ]+$/.test(raw))return undefined;
  const token=raw.slice('Bearer '.length);
  if(token.length>MAX_TOKEN_BYTES)return undefined;
  const parts=token.split('.');
  if(parts.length!==3)return undefined;
  const [headerPart,payloadPart,signaturePart]=parts as [string,string,string];
  let header:JwtHeader,claims:Record<string,unknown>;
  try{
    header=JSON.parse(decodeBase64url(headerPart)) as JwtHeader;
    claims=JSON.parse(decodeBase64url(payloadPart)) as Record<string,unknown>;
  }catch{return undefined;}
  const signature=base64urlToBuffer(signaturePart);
  if(!signature)return undefined;
  return {token,header,claims,signingInput:`${headerPart}.${payloadPart}`,signature};
}

function verifyJwt(bearer:Bearer,resolved:{key:KeyObject;alg:string}):void{
  const {alg}=resolved;
  if(alg==='HS256'){
    const expected=createHmac('sha256',resolved.key)
      .update(Buffer.from(bearer.signingInput)).digest();
    if(expected.length!==bearer.signature.length||!timingSafeEqual(expected,bearer.signature))
      throw new Error('bad signature');
    return;
  }
  if(alg==='RS256'){
    if(!verifySignature('rsa-sha256',Buffer.from(bearer.signingInput),resolved.key,bearer.signature))
      throw new Error('bad signature');
    return;
  }
  if(alg==='ES256'){
    // JWT ECDSA signatures are raw r||s(64 bytes); Node expects DER.
    if(bearer.signature.length!==64)throw new Error('bad signature');
    const der=derEncodeEcdsa(bearer.signature.subarray(0,32),bearer.signature.subarray(32));
    if(!verifySignature('sha256',Buffer.from(bearer.signingInput),resolved.key,der))
      throw new Error('bad signature');
    return;
  }
  throw new Error('alg mismatch');
}

function derEncodeEcdsa(r:Buffer,s:Buffer):Buffer{
  const integer=(value:Buffer)=>{
    let body=value;
    if(body[0]!&0x80)while(body.length>1&&body[0]===0)body=body.subarray(1);
    else while(body.length>1&&body[0]===0&&!(body[1]&0x80))body=body.subarray(1);
    if(body[0]&0x80)body=Buffer.concat([Buffer.from([0]),body]);
    return Buffer.concat([Buffer.from([0x02,body.length]),body]);
  };
  const rPart=integer(r),sPart=integer(s);
  return Buffer.concat([Buffer.from([0x30,rPart.length+sPart.length]),rPart,sPart]);
}

function createHmacKey(secret:string):KeyObject{
  return createSecretKey(Buffer.from(secret,'utf8'));
}

function requireIssuerAudience(claims:Record<string,unknown>,issuer:string,audience:string):void{
  if(stringClaim(claims.iss)!==issuer)throw new Error('issuer mismatch');
  const aud=claims.aud;
  const audiences=typeof aud==='string'?[aud]:Array.isArray(aud)?aud.filter(item=>typeof item==='string'):[];
  if(!audiences.includes(audience))throw new Error('audience mismatch');
}

function stringClaim(value:unknown):string|undefined{
  return typeof value==='string'&&value.length>0&&value.length<=256?value:undefined;
}

function organizationChoices(claims:Record<string,unknown>,
  fallbackOrg:string|undefined):readonly WorkbenchOrganizationChoice[]|null{
  const raw=claims.abh_organizations;
  const choices:WorkbenchOrganizationChoice[]=[];
  if(Array.isArray(raw)){
    for(const entry of raw.slice(0,MAX_ORGS)){
      if(typeof entry!=='object'||entry===null)continue;
      const record=entry as Record<string,unknown>;
      const label=stringClaim(record.label)??stringClaim(record.id);
      const acting=stringClaim(record.actingOrganizationId)??stringClaim(record.id);
      const resource=stringClaim(record.resourceOrganizationId)??acting;
      if(!acting||!resource||!label)continue;
      const workspace=stringClaim(record.workspaceId);
      choices.push({key:stringClaim(record.key)??resource,label,actingOrganizationId:acting,
        resourceOrganizationId:resource,...(workspace?{workspaceId:workspace}:{})});
    }
  }else if(fallbackOrg){
    choices.push({key:fallbackOrg,label:fallbackOrg,actingOrganizationId:fallbackOrg,
      resourceOrganizationId:fallbackOrg});
  }
  return choices.length>0?choices:null;
}

function pickOrganization(choices:readonly WorkbenchOrganizationChoice[],
  selection?:WorkbenchOrganizationSelection):WorkbenchOrganizationChoice|undefined{
  if(!selection)return undefined;
  return choices.find(choice=>choice.actingOrganizationId===selection.actingOrganizationId
    &&choice.resourceOrganizationId===selection.resourceOrganizationId
    &&(choice.workspaceId??undefined)===(selection.workspaceId??undefined));
}

function decodeBase64url(part:string):string{
  const buffer=base64urlToBuffer(part);
  if(!buffer)throw new Error('invalid encoding');
  return buffer.toString('utf8');
}

function base64urlToBuffer(part:string):Buffer|undefined{
  try{
    return Buffer.from(part.replace(/-/g,'+').replace(/_/g,'/'),'base64');
  }catch{return undefined;}
}
