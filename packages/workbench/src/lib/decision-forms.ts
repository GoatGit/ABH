import type {DecisionView,EntityRef} from '@abh/contracts';
import type {WorkbenchSession} from './identity';

export interface WorkbenchDecisionFormTemplate{
  key:string;
  response:'Approved'|'Rejected';
  label:string;
  description:string;
  requiresConfirmation:boolean;
  inputSchema:Record<string,unknown>;
  uiSchema?:Record<string,unknown>;
  initialData?:Record<string,unknown>;
}

export interface WorkbenchDecisionFormsRequest{
  session:WorkbenchSession;
  decision:DecisionView;
}

export interface WorkbenchDecisionFormsAdapter{
  resolve(request:WorkbenchDecisionFormsRequest):
    Promise<readonly WorkbenchDecisionFormTemplate[]|null>;
}

const reasonSchema={
  type:'string',minLength:1,maxLength:2000,
} as const;

const uuidPattern='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const conditionRefSchema={
  type:'object',required:['type','id','version'],additionalProperties:false,
  properties:{
    type:{type:'string',const:'abh.condition'},
    id:{type:'string',pattern:uuidPattern},
    version:{type:'integer',minimum:1},
  },
} as const;

const reauthProofRefSchema={
  type:'object',required:['type','id','version'],additionalProperties:false,
  properties:{
    type:{type:'string',const:'abh.reauth-proof'},
    id:{type:'string',pattern:uuidPattern},
    version:{type:'integer',minimum:1},
  },
} as const;

const conditionUiSchema=(reasonLabel:string)=>{
  return {
    type:'VerticalLayout',
    elements:[
      {type:'Control',scope:'#/properties/reason',options:{multi:true},label:reasonLabel},
    ],
  } as const;
};

function templateFor(response:'Approved'|'Rejected',label:string,description:string):
  WorkbenchDecisionFormTemplate{
  return {
    key:`contract-${response.toLowerCase()}`,response,label,description,
    requiresConfirmation:true,
    inputSchema:{
      type:'object',additionalProperties:false,
      properties:{
        reason:response==='Approved'?{...reasonSchema}:reasonSchema,
        conditionRefs:{type:'array',maxItems:response==='Approved'?100:0,items:conditionRefSchema},
        reauthProofRef:reauthProofRefSchema,
      },
    },
    uiSchema:conditionUiSchema(response==='Approved'?'审批理由':'拒绝理由'),
    initialData:response==='Approved'?{conditionRefs:[]}:{reason:'',conditionRefs:[]},
  };
}

export const contractDecisionFormsAdapter:WorkbenchDecisionFormsAdapter={
  resolve:async({decision})=>{
    if(decision.status!=='Pending')return [];
    return decision.package.allowedResponses.map(response=>response==='Approved'
      ?templateFor('Approved','批准','提交批准意图；生效必须等待服务端效果确认。')
      :templateFor('Rejected','拒绝','拒绝必须提供理由；拒绝不回滚已发生的外部影响。'));
  },
};

const decisionFormsAdapter:WorkbenchDecisionFormsAdapter=contractDecisionFormsAdapter;

export function currentDecisionFormsAdapter():WorkbenchDecisionFormsAdapter{
  return decisionFormsAdapter;
}
