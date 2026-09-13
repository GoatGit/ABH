import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from './actions.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {preparePackCapabilityResolution,resolvePreparedPackCapability,type PreparedPackCapabilityResolution} from '../extensions/prepare-pack-capability-resolution.ts';
import {lockPackCapabilityDeployment} from '../extensions/query-pack-capabilities.ts';
import type {InstalledCapabilityImplementation,ResolvePackCapabilityAdmission} from '../extensions/resolve-pack-capability.ts';
import {dispatchOnce,type ConnectorTransport} from './transport.ts';

export interface InstalledPackDispatch {
 behaviorSlot:string;
 binding:InstalledCapabilityImplementation<ConnectorTransport>;
 readGrants:readonly EntityRef[];
 admission:ResolvePackCapabilityAdmission;
}
/** Trusted deployment composition. T1 must include the same declared capability
 * scopes in its source fences; existing Snapshots never gain additional authority.
 * Resolve current Pack facts inside the exit transaction; send only after commit. */
export async function dispatchPackOnce(database:Parameters<typeof dispatchOnce>[0],context:Parameters<typeof dispatchOnce>[1],options:Parameters<typeof dispatchOnce>[2],
 value:Parameters<typeof dispatchOnce>[3],resolver:Parameters<typeof dispatchOnce>[4],checks:Parameters<typeof dispatchOnce>[5],installation:InstalledPackDispatch){
 options={...options};
 const installed=installation.binding,original=installed.implementation;
 const connector={capabilityRef:structuredClone(original.capabilityRef),send:original.send.bind(original)};
 const binding={exactRef:structuredClone(installed.exactRef),registeredKind:installed.registeredKind,implementationRef:structuredClone(installed.implementationRef),implementation:connector};
 const grants=structuredClone(installation.readGrants),slot=installation.behaviorSlot,a=installation.admission,q=a.query;
 const admission={fenceRefs:a.fenceRefs.bind(a),current:a.current.bind(a),source:a.source.bind(a),query:{fenceRefs:q.fenceRefs.bind(q),inspect:q.inspect.bind(q)}};
 if(canonicalJson(connector.capabilityRef)!==canonicalJson(binding.exactRef))throw new CoreError('PIN_INPUT_CONFLICT');
 const scopes=checks.fenceRefs.bind(checks),target=checks.target.bind(checks);
 const pending=new WeakMap<TenantTransaction,PreparedPackCapabilityResolution<ConnectorTransport>>();
 let safetyStop=false;
 return dispatchOnce(database,context,options,value,resolver,{
  ...checks,
  sources:checks.sources.bind(checks),artifact:checks.artifact.bind(checks),obligations:checks.obligations.bind(checks),
  fenceRefs:async(tx,action,intent,plan)=>{
   const extra=structuredClone(await scopes(tx,action,intent,plan));
   safetyStop=intent.safetyStop===true;
   const pins=await new StaticReleaseOwner().getPinSet(tx,action.actionRef);
   if(!pins||!action.executionAuthorityRef)throw new CoreError('AUTHORITY_REQUIRED');
   const request=new ActionOwner().preparationRequest(tx,intent,[action.executionAuthorityRef]);
   const token=await preparePackCapabilityResolution(tx,options,{exactRef:binding.exactRef,requireSafetyStop:safetyStop,pinSet:pins,request,behaviorSlot:slot},binding,grants,admission);
   pending.set(tx,token);return [...extra,...token.fenceRefs];
  },
  target:async(tx,node,plan,payload)=>{
   await target(tx,node,plan,payload);
   if(canonicalJson(node.connectorRef)!==canonicalJson(binding.exactRef))throw new CoreError('PIN_INPUT_CONFLICT');
   await lockPackCapabilityDeployment(tx);
  },
 },connector,async(tx,permit)=>{
  const token=pending.get(tx);pending.delete(tx);
  if(!token||canonicalJson(permit.connectorRef)!==canonicalJson(binding.exactRef))throw new CoreError('PIN_INPUT_CONFLICT');
  const resolved=await resolvePreparedPackCapability(tx,token);
  if(resolved.implementation!==connector)throw new CoreError('PRECONDITION_FAILED');
  if(safetyStop&&!resolved.safetyStop)throw new CoreError('PIN_INPUT_CONFLICT');
 });
}
