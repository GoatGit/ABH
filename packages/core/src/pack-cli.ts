import type {PackIntegrityDigests} from '@abh/contracts/digest';
import type {TransactionOptions} from './data/uow.ts';
import type {PackDeploymentPolicy} from './extensions/pack-policy.ts';
import {prepareLocalPack} from './extensions/prepare-local-pack.ts';

export {buildPackManifest,type PackBuildDiagnostic} from './pack-build.ts';
export {compileBusinessPack,type BusinessConformanceCase,type BusinessConformancePlan,
  type CompiledBusinessPack} from './business-pack.ts';
export {signPackManifest,type PackSignatureDiagnostic} from './extensions/sign-pack-manifest.ts';
export {validateLocalPack} from './extensions/validate-local-pack.ts';

export interface PackContentDiagnostic {
  packId:string;
  packVersion:string;
  kind:string;
  trustMode:string;
  license:string;
  artifactCount:number;
  migrationCount:number;
  integrity:PackIntegrityDigests;
}

/** Read-only local content preflight under a fixed deployment policy. No signature, install or execution authority. */
export async function validatePackContent(input:{root:string;manifest:unknown;policy:PackDeploymentPolicy},
  options:TransactionOptions):Promise<PackContentDiagnostic>{
  const prepared=await prepareLocalPack({...input,limits:{
    maxFileBytes:4_194_304,maxTotalBytes:67_108_864,maxEntries:10_000}},options);
  const manifest=prepared.manifest();
  return Object.freeze({packId:manifest.metadata.id,packVersion:manifest.metadata.version,kind:manifest.kind,
    trustMode:manifest.trust.mode,license:manifest.metadata.license,artifactCount:manifest.artifacts.length,
    migrationCount:manifest.migrations.length,integrity:prepared.integrity()});
}
