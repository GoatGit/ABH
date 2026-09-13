import {queryPackCapabilities,type PackCapabilityQueryAdmission} from '../extensions/query-pack-capabilities.ts';
import {listSafetyStops} from '../execution/list-safety-stops.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {inspectPackInspectionJob,type PackInspectionDiagnosticAdmission} from '../extensions/inspect-pack-inspection-job.ts';
import { storeInlineArtifact, type InlineArtifactStorageChecks } from '../data/store-inline-artifact.ts';
import { requestActionAuthorization, type ActionAuthorizationRequestChecks } from '../execution/request-authorization.ts';
import { cancelAction, type ActionCancellationChecks } from '../execution/cancel-action.ts';
import { ActionCursorCodec } from './action-cursor.ts';
import { listActionQuery, type ActionListAdmission } from '../execution/action-list.ts';
import { getActionQuery, type ActionViewAction, type ActionViewAdmission } from '../execution/action-query.ts';
import { proposeAction, type ActionProposalChecks, type AutomaticProposalAuthorization } from '../execution/propose-action.ts';
import { startSafetyStopAction } from '../execution/safety-stop-action.ts';
import type { AuthorizedContextRef, EntityRef, QueryPackCapabilitiesQuery, StoreInlineArtifactPayload } from '@abh/contracts';
import { validateContract } from '@abh/contracts/schema';
import { createHttpApp, HttpFailure, type HttpInstallation, type PublicCommand } from '@abh/adapter-fastify';
import { inputDigest } from '../data/journal.ts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { IdentityIngress } from '../identity/ingress.ts';
import { deriveVerifiedContext, requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { withdrawDecision, type DecisionWithdrawalChecks } from '../human/withdraw-decision.ts';
import { submitDecision, type DecisionSubmissionChecks } from '../human/submit-decision.ts';
import { getDecisionQuery, listDecisionQuery } from '../human/decision-query.ts';
import type { DecisionInboxFilter } from '../human/inbox.ts';
import type { DecisionViewAction, DecisionViewAdmission } from '../human/decision-view.ts';
import { contract } from '../data/journal.ts';
import { CorrectionOwner, proposeCorrection } from '../human/corrections.ts';
import { applyCorrection } from '../human/apply-correction.ts';
import { resolveException } from '../human/exceptions.ts';
import { applyExceptionResolutionEffect } from '../human/exceptions.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { InboxCursorCodec } from './inbox-cursor.ts';
import { ProjectionCursorCodec } from './projection-cursor.ts';
import { createMissionHandlers, createMissionQueryHandlers, type MissionHttpInstallation } from './mission-http.ts';
import { buildCase } from '../mission/build-case.ts';
import { storeObjectArtifactStream } from '../data/object-artifacts.ts';
import { createCandidate } from '../mission/create-candidate.ts';
import { requestEvaluation } from '../mission/request-evaluation.ts';
import { retryEvaluation } from '../mission/retry-evaluation.ts';
import { configureLearningCandidateRelease } from '../release/learning.ts';
import { StaticReleaseOwner } from '../release/static.ts';
import { MissionCursorCodec } from './mission-cursor.ts';
import { RunCursorCodec } from './run-cursor.ts';
import { LearningCursorCodec } from './learning-cursor.ts';
import { subscribeMissionSummaryChanges } from '../workbench/projections.ts';
import { subscribeActionStatusChanges } from '../workbench/projections.ts';
import { subscribeRunStatusChanges } from '../workbench/projections.ts';
import { subscribeOrganizationProjectionChanges } from '../workbench/projections.ts';
import { subscribeResponsibilityInboxChanges } from '../workbench/responsibility-inbox-projection.ts';
import { recordProjectionMetric, type ProjectionMetrics, type ProjectionSseDropReason } from '../workbench/projection-metrics.ts';

type ArtifactStorageCommand = Extract<PublicCommand, { type: 'abh.artifacts.store-inline' }>;
export interface ObjectArtifactUploadMetadata extends Omit<StoreInlineArtifactPayload, 'content'> {
  readonly digest:string;
  readonly declaredSizeBytes:number;
  readonly authorizedContextRef:AuthorizedContextRef;
}
type CancellationCommand = Extract<PublicCommand, { type: 'abh.actions.cancel' }>;
type AuthorizationRequestCommand = Extract<PublicCommand, { type: 'abh.actions.request-authorization' }>;
type ProposalCommand = Extract<PublicCommand, { type: 'abh.actions.propose' }>;
type SafetyStopCommand = Extract<PublicCommand, { type: 'abh.actions.start-safety-stop' }>;
type WithdrawalCommand = Extract<PublicCommand, { type: 'abh.decisions.withdraw' }>;
type SubmissionCommand = Extract<PublicCommand, { type: 'abh.decisions.submit' }>;
type CorrectionCommand = Extract<PublicCommand, { type: 'abh.corrections.propose' }>;
type CorrectionApplyCommand = Extract<PublicCommand, { type: 'abh.corrections.apply' }>;
type LearningCaseCommand = Extract<PublicCommand, { type: 'abh.learning.build-case' }>;
type LearningCandidateCommand = Extract<PublicCommand, { type: 'abh.learning.create-candidate' }>;
type EvaluationRequestCommand = Extract<PublicCommand, { type: 'abh.learning.request-evaluation' }>;
type EvaluationRetryCommand = Extract<PublicCommand, { type: 'abh.learning.retry-evaluation' }>;
type LearningReleaseCommand = Extract<PublicCommand, { type: 'abh.releases.configure-learning-candidate' }>;
type AssignmentPauseCommand = Extract<PublicCommand, { type: 'abh.assignments.pause' }>;
type AssignmentRollbackCommand = Extract<PublicCommand, { type: 'abh.assignments.rollback' }>;
type ExceptionResolutionCommand = Extract<PublicCommand, { type: 'abh.exceptions.resolve' }>;
type ExceptionEffectCommand = Extract<PublicCommand, { type: 'abh.exceptions.apply-resolution-effect' }>;
type AuthenticationInput = Parameters<IdentityIngress['authenticate']>[0];
export interface CoreHttpInstallation {
  database: Database;
  identity: IdentityIngress;
  /** Trusted credential resolution; organization/purpose selections are still verified by IdentityIngress. */
  credentials(...input: Parameters<HttpInstallation['authenticate']>): Promise<AuthenticationInput>;
  capabilityQuery?: {
    grants(context:VerifiedContext, query:QueryPackCapabilitiesQuery, options:TransactionOptions):Promise<readonly EntityRef[]>;
    admission:PackCapabilityQueryAdmission;
  };
  safetyStops?: {
    grants(context:VerifiedContext, options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  packInspectionDiagnostic?: {
    grants(context: VerifiedContext, id:string, options:TransactionOptions):Promise<readonly EntityRef[]>;
    admission:PackInspectionDiagnosticAdmission;
  };
  artifactStorage?: {
    grants(context: VerifiedContext, command: ArtifactStorageCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: InlineArtifactStorageChecks;
  };
  objectUpload?: {
    objectStore:import('@abh/contracts/ports').ObjectStorePort;
    maxBytes?:number;
    grants(context: VerifiedContext, metadata: ObjectArtifactUploadMetadata, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: InlineArtifactStorageChecks;
  };
  actionCancellation?: {
    grants(context: VerifiedContext, command: CancellationCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: ActionCancellationChecks;
  };
  actionList?: {
    cursor: ActionCursorCodec;
    grants(context: VerifiedContext, options: TransactionOptions): Promise<{ read: readonly EntityRef[]; actions: Partial<Record<ActionViewAction, readonly EntityRef[]>> }>;
    admission: ActionListAdmission;
  };
  actionQuery?: {
    grants(context: VerifiedContext, id: string, options: TransactionOptions): Promise<{ read: readonly EntityRef[]; actions: Partial<Record<ActionViewAction, readonly EntityRef[]>> }>;
    admission: ActionViewAdmission;
  };
  actionAuthorizationRequest?: {
    grants(context: VerifiedContext, command: AuthorizationRequestCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: ActionAuthorizationRequestChecks;
  };
  actionProposal?: {
    grants(context: VerifiedContext, command: ProposalCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: ActionProposalChecks;
    automaticAuthorization?: Omit<AutomaticProposalAuthorization, 'grantRefs'> & {
      grants(context: VerifiedContext, command: ProposalCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
  };
  safetyStopAction?: {
    grants(context: VerifiedContext, command: SafetyStopCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: ActionProposalChecks;
  };
  withdrawal?: {
    /** Resolve candidate grants from trusted installation. The Owner revalidates every grant in its transaction. */
    grants(context: VerifiedContext, command: WithdrawalCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: DecisionWithdrawalChecks;
  };
  submission?: {
    grants(context: VerifiedContext, command: SubmissionCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: DecisionSubmissionChecks;
  };
  corrections?: {
    grants(context: VerifiedContext, command: CorrectionCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    apply?: {
      grants(context: VerifiedContext, command: CorrectionApplyCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
      authority(tx: TenantTransaction, correction: import('@abh/contracts').CorrectionRecord,
        options: TransactionOptions): Promise<void>;
    };
    get?: {
      grants(context: VerifiedContext, id: string, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
  };
  learning?: {
    buildCase?: {
      grants(context: VerifiedContext, command: LearningCaseCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    createCandidate?: {
      grants(context: VerifiedContext, command: LearningCandidateCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    requestEvaluation?: {
      grants(context: VerifiedContext, command: EvaluationRequestCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    retryEvaluation?: {
      grants(context: VerifiedContext, command: EvaluationRetryCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
  };
  releases?: {
    configureLearningCandidate?: {
      grants(context: VerifiedContext, command: LearningReleaseCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
  };
  assignments?: {
    pause?: {
      grants(context: VerifiedContext, command: AssignmentPauseCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    rollback?: {
      grants(context: VerifiedContext, command: AssignmentRollbackCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    get?: {
      grants(context: VerifiedContext, id: string, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
    list?: {
      cursor: LearningCursorCodec;
      grants(context: VerifiedContext, filter: Record<string, unknown>, options: TransactionOptions): Promise<readonly EntityRef[]>;
    };
  };
  exceptionResolution?: {
    grants(context: VerifiedContext, command: ExceptionResolutionCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
  };
  exceptionEffect?: {
    grants(context: VerifiedContext, command: ExceptionEffectCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
  };
  decisionQuery?: {
    grants(context: VerifiedContext, id: string, options: TransactionOptions): Promise<{
      read: readonly EntityRef[]; actions: Partial<Record<DecisionViewAction, readonly EntityRef[]>>;
    }>;
    admission: DecisionViewAdmission;
  };
  decisionInbox?: {
    cursor: InboxCursorCodec;
    grants(context: VerifiedContext, options: TransactionOptions): Promise<{ read: readonly EntityRef[]; actions: Partial<Record<DecisionViewAction, readonly EntityRef[]>> }>;
    /** Explicit registered query type names mapped to responsibility kinds. Unknown names are refused. */
    types: Readonly<Record<string, NonNullable<DecisionInboxFilter['kind']>>>;
    admission: DecisionViewAdmission;
  };
  mission?: MissionHttpInstallation;
  projectionList?:{
    cursor:ProjectionCursorCodec;
    grants(context:VerifiedContext,options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  projectionMetrics?:ProjectionMetrics;
  projectionEvents?:{
    grants(context:VerifiedContext['request'],subjectId:string,options:TransactionOptions):Promise<readonly EntityRef[]>;
    pollIntervalMs?:number;
    metrics?:ProjectionMetrics;
  };
  deadlineMs?: number;
  bodyLimit?: number;
}

function publicFailure(error: unknown): never {
  if (!(error instanceof CoreError)) throw error;
  // These internal admission diagnostics must not disclose permission/fence existence.
  if (['AUTHORITY_REQUIRED', 'EPOCH_REVOKED', 'PURPOSE_DENIED', 'TENANT_CONTEXT_REQUIRED'].includes(error.code)) throw new HttpFailure('FORBIDDEN');
  throw new HttpFailure(error.code);
}

/** Server composition only: domain Owners do not depend on Fastify. No default credentials or governance. */
export function createCoreHttpApp(installation: CoreHttpInstallation): ReturnType<typeof createHttpApp> {
  if (!(installation.identity instanceof IdentityIngress) || typeof installation.credentials !== 'function') throw new TypeError('Identity ingress installation required');
  const { database, identity, credentials } = installation;
  if (installation.mission && !installation.mission.tool) throw new TypeError('Tool adapter, output validator, and result storage installation required');
  if (installation.mission?.list && (!(installation.mission.list.cursor instanceof MissionCursorCodec) || typeof installation.mission.list.grants !== 'function'))
    throw new TypeError('Mission list cursor and grant installation required');
  if (installation.mission?.runList && (!(installation.mission.runList.cursor instanceof RunCursorCodec) || typeof installation.mission.runList.grants !== 'function'))
    throw new TypeError('Run list cursor and grant installation required');
  if (installation.mission?.learningLists) {
    for (const authority of Object.values(installation.mission.learningLists)) {
      if (authority && (!(authority.cursor instanceof LearningCursorCodec) || typeof authority.grants !== 'function'))
        throw new TypeError('Learning list cursor and grant installation required');
    }
  }
  if (installation.assignments?.list && !(installation.assignments.list.cursor instanceof LearningCursorCodec))
    throw new TypeError('Assignment list cursor installation required');
  if (installation.assignments && [installation.assignments.pause?.grants, installation.assignments.rollback?.grants,
    installation.assignments.get?.grants, installation.assignments.list?.grants].some(handler =>
    handler !== undefined && typeof handler !== 'function'))
    throw new TypeError('Assignment governance installation required');
  if (installation.mission?.contextGet && typeof installation.mission.contextGet.grants !== 'function')
    throw new TypeError('Context query grant installation required');
  if (installation.mission?.projectionList && !(installation.mission.projectionList.cursor instanceof ProjectionCursorCodec))
    throw new TypeError('Projection list cursor installation required');
  const capabilitySource=installation.capabilityQuery;
  if(capabilitySource&&[capabilitySource.grants,capabilitySource.admission?.fenceRefs,capabilitySource.admission?.inspect].some(handler=>typeof handler!=='function'))throw new TypeError('Capability query governance installation required');
  const capabilityQuery=capabilitySource&&{grants:capabilitySource.grants.bind(capabilitySource),admission:{fenceRefs:capabilitySource.admission.fenceRefs.bind(capabilitySource.admission),inspect:capabilitySource.admission.inspect.bind(capabilitySource.admission)}};
  const safetyStopSource=installation.safetyStops;
  if(safetyStopSource&&typeof safetyStopSource.grants!=='function')throw new TypeError('Safety stop query governance installation required');
  const safetyStops=safetyStopSource&&{grants:safetyStopSource.grants.bind(safetyStopSource)};
  const diagnosticSource=installation.packInspectionDiagnostic;
  if(diagnosticSource&&[diagnosticSource.grants,diagnosticSource.admission?.fenceRefs,diagnosticSource.admission?.current,diagnosticSource.admission?.read].some(handler=>typeof handler!=='function'))throw new TypeError('Pack diagnostic governance installation required');
  const diagnostic=diagnosticSource&&{grants:diagnosticSource.grants.bind(diagnosticSource),admission:{fenceRefs:diagnosticSource.admission.fenceRefs.bind(diagnosticSource.admission),current:diagnosticSource.admission.current.bind(diagnosticSource.admission),read:diagnosticSource.admission.read.bind(diagnosticSource.admission)}};

  const artifactStorage = installation.artifactStorage && { ...installation.artifactStorage, checks: { ...installation.artifactStorage.checks } };
  if (artifactStorage && [artifactStorage.grants, artifactStorage.checks.fenceRefs, artifactStorage.checks.admit, artifactStorage.checks.references].some(handler => typeof handler !== 'function')) throw new TypeError('Artifact storage governance installation required');
  const objectUpload=installation.objectUpload&&{...installation.objectUpload,checks:{...installation.objectUpload.checks}};
  if(objectUpload&&[objectUpload.grants,objectUpload.checks.fenceRefs,objectUpload.checks.admit,objectUpload.checks.references]
    .some(handler=>typeof handler!=='function'))throw new TypeError('Object upload governance installation required');
  if(objectUpload&&(objectUpload.maxBytes!==undefined&&(!Number.isSafeInteger(objectUpload.maxBytes)||objectUpload.maxBytes<1)))
    throw new TypeError('Invalid object upload bound');
  const withdrawal = installation.withdrawal && { ...installation.withdrawal, checks: { ...installation.withdrawal.checks } };
  if (withdrawal && [withdrawal.grants, withdrawal.checks.fenceRefs, withdrawal.checks.admit, withdrawal.checks.lockSubject, withdrawal.checks.source].some(handler => typeof handler !== 'function')) throw new TypeError('Withdrawal governance installation required');
  const submission = installation.submission && { ...installation.submission, checks: { ...installation.submission.checks, eligibility: { ...installation.submission.checks.eligibility } } };
  if (submission && [submission.grants, submission.checks.fenceRefs, submission.checks.admit, submission.checks.effects, ...['lock', 'candidate', 'submit', 'revalidate', 'conditions'].map(key => submission.checks.eligibility[key as keyof typeof submission.checks.eligibility])].some(handler => typeof handler !== 'function')) throw new TypeError('Submission governance installation required');
  const actionAuthorizationRequest = installation.actionAuthorizationRequest && { ...installation.actionAuthorizationRequest, checks: { ...installation.actionAuthorizationRequest.checks, purposeNames: [...installation.actionAuthorizationRequest.checks.purposeNames] } };
  if (actionAuthorizationRequest && [actionAuthorizationRequest.grants, actionAuthorizationRequest.checks.fenceRefs, actionAuthorizationRequest.checks.admit].some(handler => typeof handler !== 'function')) throw new TypeError('Action authorization request governance installation required');
  const actionProposal = installation.actionProposal && { ...installation.actionProposal, checks: { ...installation.actionProposal.checks }, ...(installation.actionProposal.automaticAuthorization ? { automaticAuthorization: { ...installation.actionProposal.automaticAuthorization, purposeNames: [...installation.actionProposal.automaticAuthorization.purposeNames] } } : {}) };
  if (actionProposal && [actionProposal.grants, actionProposal.checks.fenceRefs, actionProposal.checks.admit, actionProposal.checks.definition, actionProposal.checks.artifact, actionProposal.checks.proposal].some(handler => typeof handler !== 'function')) throw new TypeError('Action proposal governance installation required');
  if (actionProposal?.automaticAuthorization && [actionProposal.automaticAuthorization.grants, actionProposal.automaticAuthorization.fenceRefs, actionProposal.automaticAuthorization.admit].some(handler => typeof handler !== 'function')) throw new TypeError('Automatic proposal authorization governance required');
  if (installation.safetyStopAction && [installation.safetyStopAction.grants, installation.safetyStopAction.checks.fenceRefs,
    installation.safetyStopAction.checks.admit, installation.safetyStopAction.checks.definition,
    installation.safetyStopAction.checks.artifact, installation.safetyStopAction.checks.proposal].some(handler => typeof handler !== 'function')) throw new TypeError('Safety stop proposal governance installation required');
  const actionQuery = installation.actionQuery && { ...installation.actionQuery, admission: { ...installation.actionQuery.admission } };
  if (actionQuery && [actionQuery.grants, actionQuery.admission.fenceRefs, actionQuery.admission.canRead, actionQuery.admission.canReadRelated, actionQuery.admission.canAct].some(handler => typeof handler !== 'function')) throw new TypeError('Action query governance installation required');
  const actionList = installation.actionList && { ...installation.actionList, admission: { ...installation.actionList.admission } };
  if (actionList && (!(actionList.cursor instanceof ActionCursorCodec) || [actionList.grants, actionList.admission.fenceRefs, actionList.admission.listFenceRefs, actionList.admission.admitList, actionList.admission.canRead, actionList.admission.canReadRelated, actionList.admission.canAct].some(handler => typeof handler !== 'function'))) throw new TypeError('Action list governance and cursor installation required');
  const actionCancellation = installation.actionCancellation && { ...installation.actionCancellation, checks: { ...installation.actionCancellation.checks } };
  if (actionCancellation && [actionCancellation.grants, actionCancellation.checks.fenceRefs, actionCancellation.checks.admit].some(handler => typeof handler !== 'function')) throw new TypeError('Action cancellation governance installation required');
  const deadlineMs = installation.deadlineMs ?? 30_000;
  const decisionQuery = installation.decisionQuery && { ...installation.decisionQuery, admission: { ...installation.decisionQuery.admission } };
  const decisionInbox = installation.decisionInbox && { ...installation.decisionInbox, types: { ...installation.decisionInbox.types }, admission: { ...installation.decisionInbox.admission } };
  const projectionEventSource = installation.projectionEvents;
  const projectionMetrics = installation.projectionMetrics ?? installation.mission?.projectionMetrics;
  const projectionEventMetrics = projectionEventSource?.metrics ?? projectionMetrics;
  if (projectionEventSource && typeof projectionEventSource.grants !== 'function')
    throw new TypeError('Projection event governance installation required');
  const projectionEvents = projectionEventSource && {
    grants:projectionEventSource.grants.bind(projectionEventSource),
    ...(projectionEventSource.pollIntervalMs===undefined?{}:{pollIntervalMs:projectionEventSource.pollIntervalMs}),
    ...(projectionEventMetrics?{metrics:{
      incrementSseDrop:(reason:ProjectionSseDropReason)=>recordProjectionMetric(projectionEventMetrics,
        source=>source.incrementSseDrop(reason)),
    }}:{}),
  };
  if (decisionInbox) {
    if (!(decisionInbox.cursor instanceof InboxCursorCodec)) throw new TypeError('Inbox cursor codec installation required');
    if ([decisionInbox.grants, decisionInbox.admission.admit, decisionInbox.admission.canRead, decisionInbox.admission.canReadEffect, decisionInbox.admission.canAct, decisionInbox.admission.fenceRefs].some(handler => typeof handler !== 'function')) throw new TypeError('Decision inbox admission installation required');
    for (const [name, kind] of Object.entries(decisionInbox.types)) {
      contract('RegisteredName', name);
      if (!['Goal', 'Authorization', 'Correction', 'Exception'].includes(kind)) throw new TypeError('Invalid inbox kind mapping');
    }
  }
  if (decisionQuery && [decisionQuery.grants, decisionQuery.admission.admit, decisionQuery.admission.canRead, decisionQuery.admission.canReadEffect, decisionQuery.admission.canAct, decisionQuery.admission.fenceRefs].some(handler => typeof handler !== 'function')) throw new TypeError('Decision query admission installation required');
  const projectionEventSubscribe = projectionEvents && async function*(subjectType:string,subjectId:string,
    context:VerifiedContext['request'],signal:AbortSignal,afterEventId?:string){
    const options={deadline:Date.now()+10000,signal};
    const grants=await boundedCallback(opts=>projectionEvents.grants(context,subjectId,opts),options);
    if(subjectType==='abh.decision')yield* subscribeResponsibilityInboxChanges(database,context,
      options,subjectId,structuredClone(grants),afterEventId,projectionEvents.pollIntervalMs);
    else if(subjectType==='abh.mission')yield* subscribeMissionSummaryChanges(database,context,options,subjectId,
      structuredClone(grants),afterEventId,projectionEvents.pollIntervalMs);
    else if(subjectType==='abh.action')yield* subscribeActionStatusChanges(database,context,
      options,subjectId,structuredClone(grants),afterEventId,projectionEvents.pollIntervalMs);
    else if(subjectType==='abh.run')yield* subscribeRunStatusChanges(database,context,
      options,subjectId,structuredClone(grants),afterEventId,projectionEvents.pollIntervalMs);
    else if(subjectType==='abh.organization')yield* subscribeOrganizationProjectionChanges(database,context,
      options,subjectId,structuredClone(grants),afterEventId,projectionEvents.pollIntervalMs);
    else throw new CoreError('RESOURCE_NOT_FOUND');
  };
  // Evidence stays private to this installation and is bound to one transport invocation.
  // JSON-shaped RequestContext alone can never create a VerifiedContext for a handler.
  const verified = new WeakMap<AbortSignal, { context: VerifiedContext; options: TransactionOptions }>();
  if (installation.mission && installation.assignments) {
    installation.mission.assignmentGet = installation.assignments.get;
    installation.mission.assignmentList = installation.assignments.list;
  }
  const commands: NonNullable<HttpInstallation['commands']> = {};
  if (installation.mission) {
    const missionHandlers = createMissionHandlers(database, installation.mission);
    const missionCommandTypes = ['abh.missions.create','abh.missions.activate','abh.missions.pause','abh.missions.cancel',
      'abh.missions.resume','abh.missions.block','abh.missions.close','abh.missions.submit-trigger','abh.verification.submit',
      'abh.missions.revise-goal','abh.missions.resolve-blocker','abh.learning.capture-signal','abh.runs.start',
      'abh.runs.complete','abh.projections.refresh-mission-summary'] as const;
    const gatewayCommandTypes = ['abh.tools.invoke'] as const;
    const allCommandTypes = [...missionCommandTypes, ...gatewayCommandTypes];
    for (const type of missionCommandTypes) {
      const handler = missionHandlers[type];
      if (handler) commands[type] = async ({ command, signal }) => {
        try {
          const binding = verified.get(signal);
          if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
          verified.delete(signal); requireVerifiedContext(binding.context);
          if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
          return { success: true as const, data: await handler(binding.context, binding.options, structuredClone(command)) };
  } catch (error) { return publicFailure(error); }
  };
  }
    for (const type of gatewayCommandTypes) {
      const handler = missionHandlers[type];
      if (handler) commands[type] = async ({ command, signal }) => {
        try {
          const binding = verified.get(signal);
          if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
          verified.delete(signal); requireVerifiedContext(binding.context);
          if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
          return { success: true as const, data: await handler(binding.context, binding.options, structuredClone(command)) };
        } catch (error) { return publicFailure(error); }
      };
    }
  }
  if (artifactStorage) commands['abh.artifacts.store-inline'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      if (command.target.id !== binding.context.tenant.resourceOrganizationId) throw new CoreError('FORBIDDEN');
      const grants = await artifactStorage.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const digest = await inputDigest({ organizationId: command.target.id, payload: command.payload });
      const result = await storeInlineArtifact(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        command.target.id, command.payload, grants, artifactStorage.checks);
      return { success: true, data: { objectRef: { ...result.artifactRef, type: 'abh.artifact' as const, version: 2 as const }, commandId: result.commandId } };
    } catch (error) { return publicFailure(error); }
  };
  if (actionCancellation) commands['abh.actions.cancel'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await actionCancellation.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const actionRef = { ...command.target, version: command.expectedVersion };
      const digest = await inputDigest({ actionRef, payload: command.payload });
      const result = await cancelAction(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        actionRef, command.payload, grants, actionCancellation.checks);
      return { success: true, data: { objectRef: result.actionRef, trackingRef: result.actionRef, commandId: result.commandId } };
    } catch (error) { return publicFailure(error); }
  };
  if (actionAuthorizationRequest) commands['abh.actions.request-authorization'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await actionAuthorizationRequest.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const actionRef = { ...command.target, version: command.expectedVersion };
      const digest = await inputDigest({ actionRef, payload: command.payload });
      const result = await requestActionAuthorization(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        actionRef, command.payload, grants, actionAuthorizationRequest.checks);
      return { success: true, data: { objectRef: result.request.actionRef, trackingRef: result.request.actionRef, commandId: result.commandId } };
    } catch (error) { return publicFailure(error); }
  };
  if (actionProposal) commands['abh.actions.propose'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      if (command.target.id !== binding.context.tenant.resourceOrganizationId) throw new CoreError('FORBIDDEN');
      const grants = await actionProposal.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const automatic = actionProposal.automaticAuthorization;
      const automaticGrants = automatic ? await automatic.grants(binding.context, structuredClone(command), binding.options) : undefined;
      const digest = await inputDigest({ organizationId: command.target.id, payload: command.payload });
      const result = await proposeAction(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        command.target.id, command.payload, grants, actionProposal.checks, automatic && { ...automatic, grantRefs: automaticGrants! });
      return { success: true, data: { objectRef: result.actionRef, trackingRef: result.actionRef, commandId: result.commandId } };
    } catch (error) { return publicFailure(error); }
  };
  const safetyStopAction = installation.safetyStopAction;
  if (safetyStopAction) commands['abh.actions.start-safety-stop'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      if (command.target.id !== binding.context.tenant.resourceOrganizationId) throw new CoreError('FORBIDDEN');
      const grants = await safetyStopAction.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const digest = await inputDigest({ organizationId: command.target.id, payload: command.payload });
      const result = await startSafetyStopAction(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        command.target.id, command.payload, grants, safetyStopAction.checks);
      return { success: true, data: { objectRef: result.actionRef, trackingRef: result.actionRef, commandId: result.commandId } };
    } catch (error) { return publicFailure(error); }
  };
  if (withdrawal) commands['abh.decisions.withdraw'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);
      requireVerifiedContext(binding.context);
      const grants = await withdrawal.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const decisionRef = { ...command.target, version: command.expectedVersion };
      const digest = await inputDigest({ decisionRef, payload: command.payload });
      const result = await withdrawDecision(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        decisionRef, command.payload, grants, withdrawal.checks);
      return { success: true, data: { objectRef: result.decisionRef, commandId: result.commandId, status: 'Withdrawn' } };
    } catch (error) { return publicFailure(error); }
  };
  if (submission) commands['abh.decisions.submit'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);
      requireVerifiedContext(binding.context);
      const grants = await submission.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const decisionRef = { ...command.target, version: command.expectedVersion };
      const digest = await inputDigest({ decisionRef, submission: command.payload });
      const result = await submitDecision(database, binding.context, binding.options,
        { commandId: command.commandId, type: command.type, idempotencyKey: command.idempotencyKey, digest },
        decisionRef, command.payload, grants, submission.checks);
      return { success: true, data: { objectRef: result.decisionRef, commandId: result.commandId, status: result.status, effectTrackingRefs: result.effectTrackingRefs } };
    } catch (error) { return publicFailure(error); }
  };
  const corrections = installation.corrections;
  if (corrections) commands['abh.corrections.propose'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await corrections.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const result = await proposeCorrection(database, binding.context, binding.options,
        structuredClone(command), grants);
      return { success: true, data: {
        objectRef: result.correctionRef, commandId: result.receiptRef.id, correction: result } };
    } catch (error) { return publicFailure(error); }
  };
  const correctionApply = corrections?.apply;
  if (correctionApply) commands['abh.corrections.apply'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await correctionApply.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const application = await applyCorrection(database, binding.context, binding.options,
        structuredClone(command), grants, correctionApply);
      return { success: true, data: {
        objectRef: { type: 'abh.correction', id: command.target.id, version: command.expectedVersion },
        commandId: application.receiptRef.id, application } };
    } catch (error) { return publicFailure(error); }
  };
  const learning = installation.learning;
  const learningBuildCase = learning?.buildCase;
  if (learningBuildCase) commands['abh.learning.build-case'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await learningBuildCase.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const record = await buildCase(database, binding.context, binding.options,
        structuredClone(command), grants);
      return { success: true, data: {
        objectRef: record.caseRef, commandId: record.receiptRef.id, learningCase: record } };
    } catch (error) { return publicFailure(error); }
  };
  const learningCreateCandidate = learning?.createCandidate;
  if (learningCreateCandidate) commands['abh.learning.create-candidate'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await learningCreateCandidate.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const record = await createCandidate(database, binding.context, binding.options,
        structuredClone(command), grants);
      return { success: true, data: {
        objectRef: record.candidateRef, commandId: record.receiptRef.id, learningCandidate: record } };
    } catch (error) { return publicFailure(error); }
  };
  const learningRequestEvaluation = learning?.requestEvaluation;
  if (learningRequestEvaluation) commands['abh.learning.request-evaluation'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await learningRequestEvaluation.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const record = await requestEvaluation(database, binding.context, binding.options,
        structuredClone(command), grants);
      return { success: true, data: {
        objectRef: record.runRef, commandId: record.receiptRef.id, evaluationRun: record } };
    } catch (error) { return publicFailure(error); }
  };
  const learningRetryEvaluation = learning?.retryEvaluation;
  if (learningRetryEvaluation) commands['abh.learning.retry-evaluation'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await learningRetryEvaluation.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const record = await retryEvaluation(database, binding.context, binding.options,
        structuredClone(command), grants);
      return { success: true, data: {
        objectRef: record.runRef, commandId: record.receiptRef.id, evaluationRun: record } };
    } catch (error) { return publicFailure(error); }
  };
  const learningRelease = installation.releases?.configureLearningCandidate;
  if (learningRelease) commands['abh.releases.configure-learning-candidate'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await learningRelease.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const record = await configureLearningCandidateRelease(database, binding.context, binding.options,
        structuredClone(command), grants);
      return record;
    } catch (error) { return publicFailure(error); }
  };
  const assignmentPause = installation.assignments?.pause;
  if (assignmentPause) commands['abh.assignments.pause'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await assignmentPause.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await new StaticReleaseOwner().stopAssignment(database, binding.context,
        binding.options, structuredClone(command), grants);
    } catch (error) { return publicFailure(error); }
  };
  const assignmentRollback = installation.assignments?.rollback;
  if (assignmentRollback) commands['abh.assignments.rollback'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await assignmentRollback.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await new StaticReleaseOwner().rollbackAssignment(database, binding.context,
        binding.options, structuredClone(command), grants);
    } catch (error) { return publicFailure(error); }
  };
  const exceptionResolution = installation.exceptionResolution;
  if (exceptionResolution) commands['abh.exceptions.resolve'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await exceptionResolution.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const payload = structuredClone(command.payload);
      const result = await resolveException(database, binding.context, binding.options, command, grants);
      return { success: true, data: { objectRef: payload.exceptionRef, commandId: result.commandId, resolution: result.resolution } };
    } catch (error) { return publicFailure(error); }
  };
  const exceptionEffect = installation.exceptionEffect;
  if (exceptionEffect) commands['abh.exceptions.apply-resolution-effect'] = async ({ command, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const grants = await exceptionEffect.grants(binding.context, structuredClone(command), binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const result = await applyExceptionResolutionEffect(database, binding.context, binding.options, command, grants);
      return { success: true, data: { objectRef: result.effect.effectRef, commandId: result.commandId, effect: result.effect } };
    } catch (error) { return publicFailure(error); }
  };
  const queries: Partial<HttpInstallation['queries']> = {};
  const correctionGet = corrections?.get;
  if (correctionGet) queries['abh.corrections.get'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const { id } = contract('GetCorrectionQuery', query);
      const grants = await correctionGet.grants(binding.context, id, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await database.transaction(binding.context, binding.options, async tx => {
        const organization = { type: 'abh.organization' as const, id: tx.context.tenant.resourceOrganizationId, version: 1 };
        const locked = await lockFences(tx, [organization, ...structuredClone(grants)]);
        if (locked.some(value => value.stopFlag)) throw new CoreError('EPOCH_REVOKED');
        await assertCurrentGrants(tx, { objectRef: { type: 'abh.correction', id, version: 1 },
          scopeRefs: [organization], action: 'abh.corrections.read' }, grants);
        return await new CorrectionOwner().get(tx, { type: 'abh.correction', id, version: 1 });
      });
    } catch (error) { return publicFailure(error); }
  };
  if (installation.mission) {
    const missionQueries = createMissionQueryHandlers(database, installation.mission);
    queries['abh.missions.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.missions.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.runs.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.runs.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.tools.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.tools.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.missions.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.missions.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.runs.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.runs.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.contexts.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.contexts.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.projections.get'] = async ({ id, query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.projections.get'](binding.context, binding.options, id, query);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.evaluation-runs.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.evaluation-runs.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.evaluation-results.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.evaluation-results.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    queries['abh.learning-gates.get'] = async ({ id, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted || !id) throw new CoreError(id ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.learning-gates.get'](binding.context, binding.options, id);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.learningLists?.signals) queries['abh.learning-signals.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.learning-signals.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.learningLists?.cases) queries['abh.learning-cases.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.learning-cases.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.learningLists?.candidates) queries['abh.learning-candidates.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.learning-candidates.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.learningLists?.evaluationRuns) queries['abh.evaluation-runs.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.evaluation-runs.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.learningLists?.gates) queries['abh.learning-gates.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.learning-gates.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
    if (installation.mission.projectionList) queries['abh.projections.list'] = async ({ query, signal }) => {
      try {
        const binding = verified.get(signal);
        if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
        verified.delete(signal); requireVerifiedContext(binding.context);
        if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        return await missionQueries['abh.projections.list'](binding.context, binding.options, query);
      } catch (error) { return publicFailure(error); }
    };
  }
  const assignmentGet = installation.assignments?.get;
  if (assignmentGet) queries['abh.assignments.get'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const { id } = contract('GetAssignmentQuery', query);
      const grants = await assignmentGet.grants(binding.context, id, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await database.transaction(binding.context, binding.options, async tx => {
        const organization = { type: 'abh.organization' as const, id: tx.context.tenant.resourceOrganizationId, version: 1 };
        const locked = await lockFences(tx, [organization, ...structuredClone(grants)]);
        if (locked.some(value => value.stopFlag)) throw new CoreError('EPOCH_REVOKED');
        await assertCurrentGrants(tx, { objectRef: { type: 'abh.assignment', id, version: 1 },
          scopeRefs: [organization], action: 'abh.release.manage' }, structuredClone(grants));
        return await new StaticReleaseOwner().getAssignment(tx, { type: 'abh.assignment', id, version: 1 });
      });
    } catch (error) { return publicFailure(error); }
  };
  const assignmentList = installation.assignments?.list;
  if (assignmentList) queries['abh.assignments.list'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const { cursor, limit = 25, ...filterInput } = contract('ListAssignmentsQuery', query);
      const filter = structuredClone(filterInput) as Omit<import('@abh/contracts').ListAssignmentsQuery, 'cursor'|'limit'>;
      const after = cursor ? assignmentList.cursor.decode(cursor, binding.context.request, filter) : undefined;
      const grants = structuredClone(await assignmentList.grants(binding.context, filter, binding.options));
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await database.transaction(binding.context, binding.options, async tx => {
        const organization = { type: 'abh.organization' as const, id: tx.context.tenant.resourceOrganizationId, version: 1 };
        const locked = await lockFences(tx, [organization, ...grants]);
        if (locked.some(value => value.stopFlag)) throw new CoreError('EPOCH_REVOKED');
        await assertCurrentGrants(tx, { objectRef: organization, scopeRefs: [organization],
          action: 'abh.release.manage' }, grants);
        const page = await new StaticReleaseOwner().listAssignments(tx, {...filter, limit, ...(after?{after}:{})});
        return contract('StaticAssignmentListResult', {
          assignments: page.records, counts: page.counts,
          ...(page.next?{cursor:assignmentList.cursor.encode(page.next,binding.context.request,filter)}:{}),
          asOf:new Date().toISOString(),
        });
      });
    } catch (error) { return publicFailure(error); }
  };
  if(capabilityQuery)queries['abh.capabilities.query']=async({query,signal})=>{
    try{
      const binding=verified.get(signal);
      if(!binding||signal.aborted)throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);requireVerifiedContext(binding.context);
      const parsed=contract('QueryPackCapabilitiesQuery',query);
      const grants=await boundedCallback(opts=>capabilityQuery.grants(binding.context,structuredClone(parsed),opts),binding.options);
      return await queryPackCapabilities(database,binding.context,binding.options,parsed,grants,capabilityQuery.admission);
    }catch(error){return publicFailure(error);}
  };
  if(diagnostic)queries['abh.pack-inspection-jobs.inspect']=async({query,signal})=>{
    try{
      const binding=verified.get(signal);
      if(!binding||signal.aborted)throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);requireVerifiedContext(binding.context);
      const parsed=contract('InspectPackInspectionJobQuery',query);
      if(parsed.consistency==='Projection')throw new CoreError('SCHEMA_UNSUPPORTED');
      const grants=await diagnostic.grants(binding.context,parsed.id,binding.options);
      if(signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
      const data=await inspectPackInspectionJob(database,binding.context,binding.options,{type:'abh.pack-inspection-job',id:parsed.id,version:1},grants,diagnostic.admission);
      return contract('PackInspectionDiagnosticResponse',{success:true,data,meta:{asOf:data.assessedAt,watermark:'pack-inspection-source/'+await inputDigest(data),stale:false}});
    }catch(error){
      if(error instanceof CoreError&&['FORBIDDEN','AUTHORITY_REQUIRED','EPOCH_REVOKED','PURPOSE_DENIED'].includes(error.code))throw new HttpFailure('RESOURCE_NOT_FOUND');
      return publicFailure(error);
    }
  };

  if(safetyStops)queries['abh.safety-stops.list']=async({query,signal})=>{
    try{
      const binding=verified.get(signal);
      if(!binding||signal.aborted)throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);requireVerifiedContext(binding.context);
      const parsed=contract('ListSafetyStopsQuery',query);
      const grants=await safetyStops.grants(binding.context,binding.options);
      if(signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
      return await listSafetyStops(database,binding.context,binding.options,parsed,grants);
    }catch(error){return publicFailure(error);}
  };

  if (actionList) queries['abh.actions.list'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const { cursor, limit = 25, consistency, ...filter } = contract('ListActionsQuery', query);
      if (consistency === 'Projection') throw new CoreError('SCHEMA_UNSUPPORTED');
      const after = cursor ? actionList.cursor.decode(cursor, binding.context.request, filter) : undefined;
      const grants = await actionList.grants(binding.context, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const result = await listActionQuery(database, binding.context, binding.options, filter, limit, after, grants.read, grants.actions, actionList.admission);
      if (result.next) result.response.meta.nextCursor = actionList.cursor.encode(result.next, binding.context.request, filter);
      return result.response;
    } catch (error) { return publicFailure(error); }
  };
  if (actionQuery) queries['abh.actions.get'] = async ({ id, query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const parsed = contract('GetActionQuery', query);
      if (parsed.consistency === 'Projection') throw new CoreError('SCHEMA_UNSUPPORTED');
      contract('UUID', id);
      const grants = await actionQuery.grants(binding.context, id!, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await getActionQuery(database, binding.context, binding.options, id!, grants.read, grants.actions, actionQuery.admission);
    } catch (error) {
      if (error instanceof CoreError && ['FORBIDDEN', 'AUTHORITY_REQUIRED', 'EPOCH_REVOKED', 'PURPOSE_DENIED'].includes(error.code)) throw new HttpFailure('RESOURCE_NOT_FOUND');
      return publicFailure(error);
    }
  };
  if (decisionQuery) queries['abh.decisions.get'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const parsed = contract('GetDecisionQuery', query);
      // A projection request must not silently receive a falsely labelled projection.
      if (parsed.consistency === 'Projection') throw new CoreError('SCHEMA_UNSUPPORTED');
      const grants = await decisionQuery.grants(binding.context, parsed.id, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return await getDecisionQuery(database, binding.context, binding.options, parsed.id, grants.read, grants.actions, decisionQuery.admission);
    } catch (error) { return publicFailure(error); }
  };
  if (decisionInbox) queries['abh.decisions.list-inbox'] = async ({ query, signal }) => {
    try {
      const binding = verified.get(signal);
      if (!binding || signal.aborted) throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal); requireVerifiedContext(binding.context);
      const parsed = contract('ListInboxQuery', query);
      if (parsed.consistency === 'Projection') throw new CoreError('SCHEMA_UNSUPPORTED');
      if (parsed.type && !Object.hasOwn(decisionInbox.types, parsed.type)) throw new CoreError('INVALID_ARGUMENT');
      const filter = { ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.type ? { kind: decisionInbox.types[parsed.type]! } : {}), ...(parsed.expiry ? { expiresBefore: parsed.expiry } : {}) };
      const after = parsed.cursor ? decisionInbox.cursor.decode(parsed.cursor, binding.context.request, filter) : undefined;
      const grants = await decisionInbox.grants(binding.context, binding.options);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const result = await listDecisionQuery(database, binding.context, binding.options, {
        ...filter, limit: parsed.limit ?? 25, ...(after ? { after } : {}),
      }, grants.read, grants.actions, decisionInbox.admission);
      if (result.meta.nextCursor) result.meta.nextCursor = decisionInbox.cursor.encode(result.meta.nextCursor, binding.context.request, filter);
      return result;
    } catch (error) { return publicFailure(error); }
  };
  const objectUploadRoute=objectUpload&&{
    operation:'abh.artifacts.store-object' as const,
    maxBytes:objectUpload.maxBytes??1_073_741_824,
    handle:async({signal,headers,content}:import('@abh/adapter-fastify').HandlerContext&
      {headers:Record<string,string|string[]>;content:AsyncIterable<Uint8Array>})=>{
      try {
      const binding=verified.get(signal);
      if(!binding||signal.aborted)throw new CoreError('UNAUTHENTICATED');
      verified.delete(signal);requireVerifiedContext(binding.context);
      const current=binding.context,options=binding.options;
      const first=(name:string):string|undefined=>{
        const value=headers[name];return Array.isArray(value)?value[0]:value;
      };
      const metadataHeader=first('x-abh-upload-metadata'),idempotencyKey=first('idempotency-key'),
        contentType=first('content-type'),contentLength=Number(first('content-length'));
      if(!metadataHeader||Array.isArray(headers['x-abh-upload-metadata'])||!idempotencyKey||!contentType
        ||!Number.isSafeInteger(contentLength)||contentLength<1)throw new CoreError('INVALID_ARGUMENT');
      let metadataValue:unknown;
      try {
        const metadataJson=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(metadataHeader,'base64url'));
        metadataValue=JSON.parse(metadataJson);
        if(typeof metadataValue!=='object'||metadataValue===null||JSON.stringify(metadataValue)!==metadataJson)throw new Error();
      } catch { throw new CoreError('INVALID_ARGUMENT'); }
      const metadata=metadataValue as ObjectArtifactUploadMetadata;
      const payload={...metadata,declaredSizeBytes:undefined,digest:undefined,authorizedContextRef:undefined,
        content:''} as unknown as StoreInlineArtifactPayload;
      if(!validateContract('IdempotencyKey',idempotencyKey).success
        ||metadata.declaredSizeBytes!==contentLength||metadata.declaredSizeBytes>(objectUpload.maxBytes??1_073_741_824)
        ||metadata.mediaType!==contentType)throw new CoreError('INVALID_ARGUMENT');
      contract('Digest',metadata.digest);contract('EntityRef',metadata.authorizedContextRef);
      if(current.tenant.purposeOfUse!=='abh.action.prepare')throw new CoreError('PURPOSE_DENIED');
      const grants=await objectUpload.grants(current,structuredClone(metadata),options);
      if(signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
      async function*boundedSource():AsyncIterable<Uint8Array> {
        let size=0;
        for await(const chunk of content) {
          if(!(chunk instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
          size+=chunk.byteLength;
          if(size>metadata.declaredSizeBytes)throw new CoreError('LIMIT_EXCEEDED');
          yield chunk;
        }
      }
      const result=await storeObjectArtifactStream(database,current,options,{
        payload:{...metadata},content:boundedSource(),declaredSizeBytes:metadata.declaredSizeBytes,
        digest:metadata.digest,objectStore:objectUpload.objectStore,
        authorizedContextRef:structuredClone(metadata.authorizedContextRef),verifyReferences:async()=>{},
        idempotencyKey,artifactIdempotencyKey:idempotencyKey,grantRefs:grants,governance:{
          fenceRefs:async(tx,input)=>objectUpload.checks.fenceRefs(tx,{...input,content:''}),
          admit:async(tx,input)=>objectUpload.checks.admit(tx,{...input,content:''}),
          references:async(tx,refs)=>objectUpload.checks.references(tx,refs),
        }
      });
      if(result.status!=='Available')throw new CoreError('DEPENDENCY_TIMEOUT');
      return {record:result.record};
      } catch(error) {
        if(error instanceof CoreError)throw new HttpFailure(error.code);
        throw error;
      }
    }
  };
  const app=createHttpApp({
    ...(installation.deadlineMs === undefined ? {} : { deadlineMs: installation.deadlineMs }),
    ...(installation.bodyLimit === undefined ? {} : { bodyLimit: installation.bodyLimit }),
    ...(projectionEventSubscribe ? {events:{subscribe:projectionEventSubscribe}}:{}),
    commands,
    queries,
    ...(objectUploadRoute?{binaryRoutes:{'/v1/artifacts/object-uploads':objectUploadRoute}}:{}),
    authenticate: async (request, ingress) => {
      try {
        const options = { signal: ingress.signal, deadline: Date.parse(ingress.receivedAt) + deadlineMs };
        const input = await credentials(request, ingress);
        if (ingress.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        const authenticated = await identity.authenticate(input, options);
        requireVerifiedContext(authenticated);
        if (ingress.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
        const context = deriveVerifiedContext({ ...authenticated.request, requestId: ingress.requestId, correlationId: ingress.correlationId, receivedAt: ingress.receivedAt });
        verified.set(ingress.signal, { context, options: { ...options, deadline: Math.min(options.deadline, Date.parse(context.request.contextExpiresAt)) } });
        return context.request;
      } catch (error) { return publicFailure(error); }
      },
  });
  return app;
}
