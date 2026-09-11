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
  };
  const app=createCoreHttpApp(installation);
  return {
    app,
    close:async()=>{await app.close();},
  };
}
