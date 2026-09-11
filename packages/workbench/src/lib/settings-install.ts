import {createHttpSettingsAdapter} from './settings-http.ts';
import {denyAllSettingsAdapter,type WorkbenchSettingsAdapter} from './settings.ts';

function settingsAdapter():WorkbenchSettingsAdapter{
  const endpoint=process.env.WORKBENCH_SETTINGS_URL;
  if(!endpoint)return denyAllSettingsAdapter;
  const timeoutMs=process.env.WORKBENCH_SETTINGS_TIMEOUT_MS===undefined
    ?undefined:Number(process.env.WORKBENCH_SETTINGS_TIMEOUT_MS);
  const maxResponseBytes=process.env.WORKBENCH_SETTINGS_MAX_BYTES===undefined
    ?undefined:Number(process.env.WORKBENCH_SETTINGS_MAX_BYTES);
  return createHttpSettingsAdapter({endpoint,
    ...(timeoutMs!==undefined&&!Number.isNaN(timeoutMs)?{timeoutMs}:{}),
    ...(maxResponseBytes!==undefined&&!Number.isNaN(maxResponseBytes)?{maxResponseBytes}:{})});
}

export function currentSettingsAdapter():WorkbenchSettingsAdapter{
  return settingsAdapter();
}
