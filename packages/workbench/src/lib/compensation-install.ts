import {createHttpCompensationAdapter} from './compensation-http.ts';
import {denyAllCompensationAdapter,type WorkbenchCompensationAdapter} from './compensation.ts';

function compensationAdapter():WorkbenchCompensationAdapter{
  const endpoint=process.env.WORKBENCH_COMPENSATION_URL;
  if(!endpoint)return denyAllCompensationAdapter;
  const timeoutMs=process.env.WORKBENCH_COMPENSATION_TIMEOUT_MS===undefined
    ?undefined:Number(process.env.WORKBENCH_COMPENSATION_TIMEOUT_MS);
  const maxResponseBytes=process.env.WORKBENCH_COMPENSATION_MAX_BYTES===undefined
    ?undefined:Number(process.env.WORKBENCH_COMPENSATION_MAX_BYTES);
  return createHttpCompensationAdapter({endpoint,
    ...(timeoutMs!==undefined&&!Number.isNaN(timeoutMs)?{timeoutMs}:{}),
    ...(maxResponseBytes!==undefined&&!Number.isNaN(maxResponseBytes)?{maxResponseBytes}:{})});
}

export function currentCompensationAdapter():WorkbenchCompensationAdapter{
  return compensationAdapter();
}
