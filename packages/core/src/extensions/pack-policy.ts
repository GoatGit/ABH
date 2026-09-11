import {valid,validRange,satisfies} from 'semver';
import type {PackManifest,EntityRef,PackResources} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import {canonicalJson} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';

type IsolatedLimits=Omit<Extract<PackResources,{enforcement:'IsolatedLimits'}>,'enforcement'>;
export interface PackDeploymentPolicy {
  /** Explicit current application version; preview compatibility is never inferred. */
  abhVersion:string;
  packId:string;
  allowedModes:readonly PackManifest['trust']['mode'][];
  allowedLicenses:readonly string[];
  permissions:PackManifest['permissions'];
  hostProfileRefs:readonly EntityRef[];
  isolated?:{available:boolean;limits:IsolatedLimits};
  /** Namespaces already approved by deployment trust governance, not asserted by the Pack. */
  sharedNamespaces:readonly string[];
}

/** Static deployment envelope admission. No signature verification, dependency selection, Grant, or enablement. */
export function admitPackDeployment(manifest:unknown,policy:PackDeploymentPolicy):PackManifest{
  const candidate=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!candidate.success)throw new CoreError('INVALID_ARGUMENT');
  const pack=candidate.data,config=JSON.parse(canonicalJson(policy)) as PackDeploymentPolicy;
  if(!validateContract('PackDeploymentPolicy',config).success)throw new CoreError('INVALID_ARGUMENT');
  if(!valid(config.abhVersion)||!validRange(pack.compatibility.abh)||!valid(pack.metadata.version)
    ||pack.capabilities.requires.some(requirement=>!validRange(requirement.versionRange)))throw new CoreError('INVALID_ARGUMENT');
  if(config.packId!==pack.metadata.id||!config.allowedModes.includes(pack.trust.mode)||!config.allowedLicenses.includes(pack.metadata.license))throw new CoreError('FORBIDDEN');
  if(!satisfies(config.abhVersion,pack.compatibility.abh))throw new CoreError('PRECONDITION_FAILED');
  for(const key of ['dataClasses','purposes','commands','toolCapabilities','networkEgress','secretClasses'] as const){
    if(!Array.isArray(config.permissions[key])||pack.permissions[key].some(value=>!config.permissions[key].includes(value)))throw new CoreError('FORBIDDEN');
  }
  const namespaces=[config.packId,...config.sharedNamespaces];
  if(namespaces.some(namespace=>!validateContract('RegisteredName',namespace).success))throw new CoreError('INVALID_ARGUMENT');
  if(pack.capabilities.provides.some(capability=>!namespaces.some(namespace=>capability.id.startsWith(namespace+'.'))))throw new CoreError('FORBIDDEN');
  const resources=pack.resources;
  if(resources.enforcement==='HostProfile'){
    for(const ref of config.hostProfileRefs)if(!validateContract('EntityRef',ref).success)throw new CoreError('INVALID_ARGUMENT');
    if(!config.hostProfileRefs.some(ref=>ref.type===resources.profileRef.type&&ref.id===resources.profileRef.id&&ref.version===resources.profileRef.version))throw new CoreError('FORBIDDEN');
  }
  if(resources.enforcement==='IsolatedLimits'){
    if(!config.isolated?.available)throw new CoreError('PRECONDITION_FAILED');
    for(const key of ['cpuMillis','memoryBytes','processes','temporaryDiskBytes','outputBytes','wallTimeMs'] as const){
      const ceiling=config.isolated.limits[key];
      if(!Number.isSafeInteger(ceiling)||ceiling<0)throw new CoreError('INVALID_ARGUMENT');
      if(resources[key]>ceiling)throw new CoreError('LIMIT_EXCEEDED');
    }
  }
  return pack;
}
