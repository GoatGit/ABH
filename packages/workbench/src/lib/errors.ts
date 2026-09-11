import {AbhClientError} from '@abh/core/client';
import {SettingsHttpError} from './settings-http.ts';

export function errorText(error:unknown):string{
  if(error instanceof AbhClientError){
    return error.response?.error.code ?? error.code;
  }
  if(error instanceof SettingsHttpError)return error.code;
  return 'INTERNAL_ERROR';
}
