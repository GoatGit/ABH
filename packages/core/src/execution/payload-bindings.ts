import type {ArtifactRecord,EntityRef,OperationPlan,OperationPlanNode,OperationRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {ReconciliationOwner} from './reconciliations.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {readCurrentPermit} from './dispatch-facts.ts';
import {refKey,sameRef} from './shared.ts';

export interface OutputBindingDefinition {readonly outputName:string;readonly valueType:string;readonly field:'externalId'|'sourceVersion'}
export interface ResolvedNodePayload {
  readonly template:ArtifactRecord;readonly bytes:Uint8Array;readonly digest:string;
  readonly dependencyRefs:EntityRef[];readonly purposeNames:string[];
}
export interface InstalledPayloadBindings {
  /** Exact installed parent Connector/operation output map. No arbitrary Provider response fields. */
  outputs(tx:TenantTransaction,parent:OperationPlanNode,plan:OperationPlan):Promise<readonly OutputBindingDefinition[]>;
  /** Domain proves resolved values stay within the frozen template, Scope Proof and original impact bound. */
  validate(tx:TenantTransaction,node:OperationPlanNode,plan:OperationPlan,payload:ResolvedNodePayload):Promise<void>;
}
const vector=(refs:EntityRef[])=>canonicalJson(refs.map(refKey).sort());

/** Bind explicit RFC 6901 paths without response merging, inherited properties or prototype setters. */
export function bindJsonFields(template:unknown,bindings:readonly {path:string;value:string}[]):unknown{
  const result=JSON.parse(canonicalJson(template));
  const paths=bindings.map(binding=>{
    if(binding.path.length>512||! /^(?:\/(?:[^~/]|~[01])*)+$/.test(binding.path))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    return binding.path.split('/').slice(1).map(segment=>segment.replaceAll('~1','/').replaceAll('~0','~'));
  });
  for(let i=0;i<paths.length;i++){
    const segments=paths[i]!;
    if(segments.some(segment=>['__proto__','prototype','constructor'].includes(segment))
      ||paths.some((other,j)=>j!==i&&other.length>=segments.length&&segments.every((segment,k)=>segment===other[k])))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    let target=result;
    for(const [index,segment] of segments.entries()){
      if(!target||typeof target!=='object'||Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(segment)||Number(segment)>=target.length))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
      if(index===segments.length-1)Object.defineProperty(target,segment,{value:bindings[i]!.value,enumerable:true,configurable:true,writable:true});
      else {if(!Object.hasOwn(target,segment))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');target=target[segment];}
    }
  }
  return result;
}

/** Caller holds the Action lock. New evidence invalidates an old parent's output until formally resolved. */
export async function resolveNodePayload(tx:TenantTransaction,node:OperationPlanNode,plan:OperationPlan,children:readonly OperationRecord[],bindings:InstalledPayloadBindings|undefined,
  authorize:(tx:TenantTransaction,record:ArtifactRecord)=>Promise<void>):Promise<ResolvedNodePayload>{
  const payload=await new InlineArtifactOwner().read(tx,node.payloadRef,record=>authorize(tx,record));
  if(payload.record.contentDigest!==node.payloadDigest)throw new CoreError('ACTION_DOMAIN_INVALID');
  if(!node.inputBindings.length)return {template:payload.record,bytes:payload.bytes,digest:node.payloadDigest,dependencyRefs:[],purposeNames:payload.record.purposeNames};
  if(!bindings||payload.record.mediaType!=='application/json')throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
  const dependencyRefs=new Map<string,EntityRef>(),values:{path:string;value:string}[]=[];
  let purposeNames=[...payload.record.purposeNames];
  const parents=new Map<string,{externalId:string;sourceVersion:string}>();
  for(const binding of node.inputBindings){
    const parentNode=plan.nodes.find(parent=>parent.nodeKey===binding.parentNodeKey),parent=children.find(operation=>operation.nodeKey===binding.parentNodeKey);
    if(!node.dependsOn.includes(binding.parentNodeKey)||!parentNode||!parent||parent.position.lifecycle!=='Closed'||parent.position.outcome!=='Succeeded'||!parent.reconciliationRef)throw new CoreError('PRECONDITION_FAILED');
    const definitions=(await bindings.outputs(tx,parentNode,plan)).filter(definition=>definition.outputName===binding.outputName&&definition.valueType===binding.valueType);
    if(definitions.length!==1)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    let external=parents.get(parent.nodeKey);
    if(!external){
      const report=await new ReconciliationOwner().get(tx,parent.reconciliationRef),permit=await readCurrentPermit(tx,parent);
      if(report.verdict!=='ConfirmedSuccess'||!report.confirmedExternal||report.operationRef.id!==parent.operationRef.id||report.operationRef.version!==parent.operationRef.version-1
        ||!sameRef(report.planRef,parent.planRef)||!sameRef(report.comparisonRuleRef,parentNode.completionPolicyRef)||!sameRef(report.permitRef,permit.permitRef)||report.payloadDigest!==permit.payloadDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
      const receipts=await new OperationReceiptOwner().list(tx,parent.operationRef.id);
      if(vector(receipts.map(receipt=>receipt.receiptRef))!==vector(report.receiptRefs))throw new CoreError('OPERATION_FACT_CONFLICT');
      // Actual source bytes remain subject to current access, tombstone and digest checks.
      for(const receipt of receipts)await new OperationReceiptOwner().observation(tx,receipt,async(tx,record)=>{
        await authorize(tx,record);
        // Until a DataClass conversion policy is installed, mixed classes/regions cannot flow into a derived payload.
        if(record.dataClass!==payload.record.dataClass||record.region!==payload.record.region)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
        purposeNames=purposeNames.filter(purpose=>record.purposeNames.includes(purpose));
        dependencyRefs.set(refKey(record.artifactRef),record.artifactRef);
      });
      for(const ref of [parent.operationRef,report.reconciliationRef,permit.permitRef,...report.receiptRefs])dependencyRefs.set(refKey(ref),ref);
      external=report.confirmedExternal;parents.set(parent.nodeKey,external);
    }
    const value=external[definitions[0]!.field];if(typeof value!=='string'||!value.length)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    values.push({path:binding.inputPath,value});
  }
  if(!purposeNames.includes(tx.context.tenant.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
  if(dependencyRefs.size>98)throw new CoreError('LIMIT_EXCEEDED');
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload.bytes));}catch{throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');}
  const bytes=new TextEncoder().encode(canonicalJson(bindJsonFields(parsed,values)));if(bytes.length>65_536)throw new CoreError('LIMIT_EXCEEDED');
  const result={template:payload.record,bytes,digest:await digestBytes(bytes),dependencyRefs:[...dependencyRefs.values()],purposeNames};
  await bindings.validate(tx,node,plan,result);return result;
}
