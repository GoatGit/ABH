import {AbhClientError,createAbhClient,type AbhClient} from '@abh/core/client';
import type {WorkbenchSession} from './identity';
import {workbenchConfig} from './config';
export {cancelActionIdempotencyKey,decisionIdempotencyKey,missionIdempotencyKey} from './keys';
export {errorText} from './errors';

export function createWorkbenchClient(session:WorkbenchSession):AbhClient{
  if(!workbenchConfig.apiUrl)throw new Error('ABH_API_URL is required');
  return createAbhClient({
    baseUrl:workbenchConfig.apiUrl,
    headers:async signal=>session.apiHeaders(signal),
    timeoutMs:10_000,
  });
}
