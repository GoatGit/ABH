import type {EntityRef} from '@abh/contracts';
import type {ActionView} from '@abh/contracts';
import type {WorkbenchSession} from './identity';

export interface WorkbenchCompensationArtifact{
  ownerRef:EntityRef;
  dataClass:string;
  purposeNames:string[];
  sourceRefs:EntityRef[];
  region:string;
  retentionPolicyRef:EntityRef;
}

export interface WorkbenchCompensationTemplate{
  key:string;
  label:string;
  description:string;
  actionType:string;
  targetRefs:EntityRef[];
  sourceVersionRefs:EntityRef[];
  artifact:WorkbenchCompensationArtifact;
  inputSchema:Record<string,unknown>;
  uiSchema?:Record<string,unknown>;
  initialData?:Record<string,unknown>;
}

export interface WorkbenchCompensationRequest{
  action:ActionView;
}

export interface WorkbenchCompensationAdapter{
  /** Hosts must verify visibility, state, action definition ownership and compensation authorization. */
  resolve(session:WorkbenchSession,request:WorkbenchCompensationRequest):
    Promise<WorkbenchCompensationTemplate|null>;
}

export const denyAllCompensationAdapter:WorkbenchCompensationAdapter={
  resolve:async()=>null,
};

/** Production hosts replace this explicit installation with a registered Domain Pack template. */
const compensationAdapter:WorkbenchCompensationAdapter=denyAllCompensationAdapter;

export function currentCompensationAdapter():WorkbenchCompensationAdapter{
  return compensationAdapter;
}
