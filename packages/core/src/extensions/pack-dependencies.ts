import {valid,validRange,satisfies} from 'semver';
import type {PackManifest,PackCapabilityReference} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import {CoreError} from '../internal/errors.ts';

export interface PackIdentity {id:string;version:string}
export interface PackDependencySelection {
  consumer:PackIdentity;
  kind:string;
  id:string;
  versionRange:string;
  provider:PackIdentity;
  capabilityVersion:string;
}
export interface ResolvedPackDependency {
  consumer:PackIdentity;
  provider:PackIdentity;
  capability:PackCapabilityReference;
  versionRange:string;
}
export class PackDependencyError extends Error {
  readonly reason:'Missing'|'Ambiguous'|'Cycle'|'Conflict'|'Selection';
  readonly chain:readonly string[];
  constructor(reason:PackDependencyError['reason'],chain:readonly string[]){
    super(`Pack dependency ${reason}: ${chain.join(' -> ')}`);this.name='PackDependencyError';this.reason=reason;this.chain=Object.freeze([...chain]);
  }
}
const identity=(pack:PackManifest):PackIdentity=>({id:pack.metadata.id,version:pack.metadata.version});
const key=(pack:PackIdentity)=>`${pack.id}@${pack.version}`;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Resolve an explicitly admitted candidate set. Never load code, pick highest version, or grant authority. */
export function resolvePackDependencies(input:readonly PackManifest[],selections:readonly PackDependencySelection[]=[]):{
  order:PackIdentity[];dependencies:ResolvedPackDependency[];
}{
  if(!Array.isArray(input)||input.length>100||!Array.isArray(selections)||selections.length>10000)throw new CoreError('INVALID_ARGUMENT');
  const packs=(JSON.parse(canonicalJson(input)) as PackManifest[]).map(pack=>{
    if(!validateContract('PackManifest',pack).success||!valid(pack.metadata.version)||pack.capabilities.provides.some(cap=>!valid(cap.version))||pack.capabilities.requires.some(cap=>!validRange(cap.versionRange)))throw new CoreError('INVALID_ARGUMENT');
    return pack;
  }).sort((a,b)=>compare(key(identity(a)),key(identity(b))));
  const choices=JSON.parse(canonicalJson(selections)) as PackDependencySelection[],used=new Set<number>();
  const byPack=new Map<string,PackManifest>(),providers=new Map<string,{pack:PackManifest;capability:PackCapabilityReference}[]>();
  for(const pack of packs){
    const packKey=key(identity(pack));
    if(byPack.has(packKey))throw new PackDependencyError('Conflict',[packKey]);byPack.set(packKey,pack);
    for(const capability of pack.capabilities.provides){
      const capabilityKey=`${capability.kind}/${capability.id}`;
      const candidates=providers.get(capabilityKey)??[];
      // No capability-specific schema digest exists yet, so never assume duplicate providers are equivalent.
      if(candidates.some(value=>value.capability.version===capability.version))throw new PackDependencyError('Conflict',[capabilityKey+'@'+capability.version,...candidates.map(value=>key(identity(value.pack))),packKey]);
      candidates.push({pack,capability});providers.set(capabilityKey,candidates);
    }
  }
  const dependencies:ResolvedPackDependency[]=[],edges=new Map<string,Set<string>>();
  for(const pack of packs){
    const consumer=identity(pack),consumerKey=key(consumer);edges.set(consumerKey,new Set());
    const requirements=[...pack.capabilities.requires].sort((a,b)=>compare(canonicalJson(a),canonicalJson(b)));
    for(const requirement of requirements){
      const label=`${requirement.kind}/${requirement.id}@${requirement.versionRange}`;
      const candidates=(providers.get(`${requirement.kind}/${requirement.id}`)??[]).filter(value=>satisfies(value.capability.version,requirement.versionRange));
      const matches=choices.map((choice,index)=>({choice,index})).filter(({choice})=>key(choice.consumer)===consumerKey&&choice.kind===requirement.kind&&choice.id===requirement.id&&choice.versionRange===requirement.versionRange);
      if(matches.length>1)throw new PackDependencyError('Selection',[consumerKey,label]);
      let selected;
      if(matches.length){const match=matches[0]!;used.add(match.index);selected=candidates.find(value=>key(identity(value.pack))===key(match.choice.provider)&&value.capability.version===match.choice.capabilityVersion);if(!selected)throw new PackDependencyError('Selection',[consumerKey,label,key(match.choice.provider)]);}
      else{
        if(!candidates.length)throw new PackDependencyError('Missing',[consumerKey,label]);
        if(candidates.length!==1)throw new PackDependencyError('Ambiguous',[consumerKey,label,...candidates.map(value=>key(identity(value.pack)))]);
        selected=candidates[0]!;
      }
      const provider=identity(selected.pack);edges.get(consumerKey)!.add(key(provider));
      dependencies.push({consumer,provider,capability:selected.capability,versionRange:requirement.versionRange});
    }
  }
  if(used.size!==choices.length)throw new PackDependencyError('Selection',['unused selection']);
  const visited=new Set<string>(),active:string[]=[],order:PackIdentity[]=[];
  const visit=(name:string)=>{
    if(active.includes(name))throw new PackDependencyError('Cycle',[...active,name]);
    if(visited.has(name))return;active.push(name);
    for(const dependency of [...edges.get(name)!].sort(compare))visit(dependency);
    active.pop();visited.add(name);order.push(identity(byPack.get(name)!));
  };
  for(const name of byPack.keys())visit(name);
  return {order,dependencies};
}
