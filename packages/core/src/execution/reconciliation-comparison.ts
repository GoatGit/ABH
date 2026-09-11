import type {Digest,EntityRef,NormalizedOperationObservation} from '@abh/contracts';
import {CoreError} from '../internal/errors.ts';

type Verdict='ConfirmedSuccess'|'ConfirmedNoEffect'|'Pending'|'Ambiguous'|'Conflicting';
export interface ComparisonResult {verdict:Verdict;reason:string;confirmedExternal?:{externalId:string;sourceVersion:string}}
export interface OneShotComparisonRule {
  readonly ruleRef:EntityRef;
  /** Provider-specific source ordering; undefined means incomparable, never assume lexical/time order. */
  compareSourceVersions(left:string,right:string):number|undefined;
  /** Explicit finality evidence, checked against the installed Connector's complete coverage/visibility contract. */
  verifyNoEffect(observation:NormalizedOperationObservation):Promise<boolean>;
}

/** Pure finite native-mutation comparison. It never writes an Operation or releases a reservation. */
export async function compareOneShotObservations(observations:readonly NormalizedOperationObservation[],payloadDigest:Digest,rule:OneShotComparisonRule):Promise<ComparisonResult>{
  if(!observations.length)throw new CoreError('OPERATION_FACT_CONFLICT');
  const pending:ComparisonResult={verdict:'Pending',reason:'External finality is not established.'};
  // A query containing multiple identities is itself conclusive ambiguity, even if another receipt picked one.
  if(observations.some(observation=>new Set(observation.matches.map(match=>match.externalId)).size>1))return {verdict:'Ambiguous',reason:'A single observation matched multiple external identities.'};
  const identities=new Set(observations.flatMap(observation=>observation.matches.map(match=>match.externalId)));
  if(identities.size>1)return {verdict:'Conflicting',reason:'Sources disagree about the external identity.'};
  const matches=observations.flatMap(observation=>observation.matches);
  if(matches.some(match=>match.payloadDigest!==payloadDigest))return {verdict:'Conflicting',reason:'Observed payload differs from the permitted payload.'};
  let incomparable=false;
  const sorted=[...matches].sort((a,b)=>{
    const order=rule.compareSourceVersions(a.sourceVersion,b.sourceVersion);
    if(order===undefined||!Number.isFinite(order)){incomparable=true;return 0;}return order;
  });
  if(incomparable)return {verdict:'Conflicting',reason:'Provider source versions cannot be ordered.'};
  for(let i=1;i<sorted.length;i++)if(rule.compareSourceVersions(sorted[i-1]!.sourceVersion,sorted[i]!.sourceVersion)===0&&sorted[i-1]!.effect!==sorted[i]!.effect)
    return {verdict:'Conflicting',reason:'The same provider version has incompatible effects.'};
  const latest=sorted.at(-1);
  const provenAbsence=[];
  for(const observation of observations)if(observation.source.kind==='Query'&&observation.source.coverage==='Complete'&&observation.source.noEffectEvidenceRef){
    if(await rule.verifyNoEffect(observation))provenAbsence.push(observation);
  }
  if(matches.some(match=>match.effect==='Applied')){
    // Contradictory no-effect proof cannot silently erase a recorded successful mutation.
    if(provenAbsence.length||latest?.effect!=='Applied')return {verdict:'Conflicting',reason:'Successful mutation evidence conflicts with later observations.'};
    return {verdict:'ConfirmedSuccess',confirmedExternal:{externalId:latest!.externalId,sourceVersion:latest!.sourceVersion},reason:'One exact permitted mutation has confirmed final success.'};
  }
  if(latest?.effect==='Pending')return pending;
  // A zero-match query or provider failure label alone never proves no effect.
  if(provenAbsence.length)return {verdict:'ConfirmedNoEffect',reason:'Registered complete visibility evidence proves no effect.'};
  return pending;
}
