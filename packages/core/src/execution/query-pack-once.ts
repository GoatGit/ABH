import {lockPackCapabilityDeployment} from '../extensions/query-pack-capabilities.ts';
import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {prepareCompatiblePackQuery,resolvePreparedCompatiblePackQuery,preparePackCapabilityResolution,resolvePreparedPackCapability,type PreparedPackCapabilityResolution} from '../extensions/prepare-pack-capability-resolution.ts';
import type {InstalledCapabilityImplementation,ResolvePackCapabilityAdmission} from '../extensions/resolve-pack-capability.ts';
import {queryOnce,type QueryTransport} from './query-transport.ts';

export interface InstalledPackQuery {
 behaviorSlot:string;
 binding:InstalledCapabilityImplementation<QueryTransport>;
 readGrants:readonly EntityRef[];
 admission:ResolvePackCapabilityAdmission;
}
/** Enabled Connector query under independent query authority. Replacement
 * resolution retains original Pins and requires the claimed compatibility exit. */
export async function queryPackOnce(database:Parameters<typeof queryOnce>[0],context:Parameters<typeof queryOnce>[1],options:Parameters<typeof queryOnce>[2],
 input:Parameters<typeof queryOnce>[3],policy:Parameters<typeof queryOnce>[4],installation:InstalledPackQuery,command?:Parameters<typeof queryOnce>[6]){
 options={...options};
 const b=installation.binding,original=b.implementation,transport={capabilityRef:structuredClone(original.capabilityRef),query:original.query.bind(original)};
 const binding={exactRef:structuredClone(b.exactRef),registeredKind:b.registeredKind,implementationRef:structuredClone(b.implementationRef),implementation:transport};
 const grants=structuredClone(installation.readGrants),slot=installation.behaviorSlot,a=installation.admission,q=a.query;
 const admission={fenceRefs:a.fenceRefs.bind(a),current:a.current.bind(a),source:a.source.bind(a),query:{fenceRefs:q.fenceRefs.bind(q),inspect:q.inspect.bind(q)}};
 if(canonicalJson(binding.exactRef)!==canonicalJson(transport.capabilityRef))throw new CoreError('PIN_INPUT_CONFLICT');
 const compatible=!!policy.compatibility;
 const pending=new WeakMap<TenantTransaction,PreparedPackCapabilityResolution<QueryTransport>>(),fences=policy.fenceRefs?.bind(policy),authorize=policy.authorize.bind(policy),lock=policy.lock?.bind(policy);
 return queryOnce(database,context,options,input,{
  ...policy,authorize,lock:async tx=>{await lockPackCapabilityDeployment(tx);await lock?.(tx);},
  fenceRefs:async(tx,value)=>{
   // Command admission and claim both inspect policy in the same transaction.
   const cached=pending.get(tx);if(cached)return cached.fenceRefs;
   const extra=structuredClone(await fences?.(tx,value)??[]),operations=new OperationOwner(),actions=new ActionOwner();
   const operation=await operations.get(tx,value.operationRef.id),action=await actions.get(tx,operation.actionRef.id),intent=await actions.getIntent(tx,action.actionRef.id);
   const pins=await new StaticReleaseOwner().getPinSet(tx,action.actionRef);
   if(!pins||!action.executionAuthorityRef)throw new CoreError('PRECONDITION_FAILED');
   // Original authority Ref binds historical pin input only; query authorization stays independent.
   const request=actions.preparationRequest(tx,intent,[action.executionAuthorityRef]);
   const plan=await operations.getPlan(tx,action.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
   if(!node)throw new CoreError('OPERATION_FACT_CONFLICT');
   const prepare=compatible?prepareCompatiblePackQuery:preparePackCapabilityResolution;
   const token=await prepare(tx,options,{exactRef:node.connectorRef,pinSet:pins,request,behaviorSlot:slot},binding,grants,{
    ...admission,fenceRefs:async(tx,exact,opts)=>[...extra,...await admission.fenceRefs(tx,exact,opts)],
   });
   pending.set(tx,token);return token.fenceRefs;
  },
 },transport,command,async(tx,exit)=>{
  const token=pending.get(tx);pending.delete(tx);
  if(!token||canonicalJson(exit.queryConnectorRef??exit.connectorRef)!==canonicalJson(binding.exactRef))throw new CoreError('PIN_INPUT_CONFLICT');
  const resolved=compatible?await resolvePreparedCompatiblePackQuery(tx,token,exit):await resolvePreparedPackCapability(tx,token);
  if(resolved.implementation!==transport)throw new CoreError('PRECONDITION_FAILED');
 });
}
