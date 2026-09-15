import {createCoreHttpApp,type CoreHttpInstallation} from './http.ts';
import type {MissionHttpInstallation} from './mission-http.ts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {IdentityIngress} from '../identity/ingress.ts';

export interface AbhServiceConfig {
  database:Database;
  identity:IdentityIngress;
  credentials:CoreHttpInstallation['credentials'];
  mission:MissionHttpInstallation;
  deadlineMs?:number;
  bodyLimit?:number;
  /** Optional capability surfaces. Without them the corresponding public
   *  commands/queries are not mounted at all (fail-closed composition). */
  capabilityQuery?:CoreHttpInstallation['capabilityQuery'];
  artifactStorage?:CoreHttpInstallation['artifactStorage'];
  objectUpload?:CoreHttpInstallation['objectUpload'];
  safetyStops?:CoreHttpInstallation['safetyStops'];
  packInspectionDiagnostic?:CoreHttpInstallation['packInspectionDiagnostic'];
  actionCancellation?:CoreHttpInstallation['actionCancellation'];
}

export interface AssembledService {
  app:ReturnType<typeof createCoreHttpApp>;
  close():Promise<void>;
}

/** Compose a production ABH service: Mission HTTP routes + identity ingress + tenant runtime.
 *  Public commands/queries are auto-registered from the Mission installation; Durable workers
 *  attach via runHttpService({tenant}) separately. This module only wires the HTTP ingress. */
export function assembleAbhService(config:AbhServiceConfig):AssembledService{
  if(!config.identity)throw new TypeError('Identity ingress required');
  if(!config.mission)throw new TypeError('Mission installation required');
  const installation:CoreHttpInstallation={
    database:config.database,
    identity:config.identity,
    credentials:config.credentials,
    mission:config.mission,
    ...(config.deadlineMs!==undefined?{deadlineMs:config.deadlineMs}:{}),
    ...(config.bodyLimit!==undefined?{bodyLimit:config.bodyLimit}:{}),
    ...(config.capabilityQuery?{capabilityQuery:config.capabilityQuery}:{}),
    ...(config.artifactStorage?{artifactStorage:config.artifactStorage}:{}),
    ...(config.objectUpload?{objectUpload:config.objectUpload}:{}),
    ...(config.safetyStops?{safetyStops:config.safetyStops}:{}),
    ...(config.packInspectionDiagnostic?{packInspectionDiagnostic:config.packInspectionDiagnostic}:{}),
    ...(config.actionCancellation?{actionCancellation:config.actionCancellation}:{}),
  };
  const app=createCoreHttpApp(installation);
  return {
    app,
    close:async()=>{await app.close();},
  };
}
