import {queryPackCapabilities,type PackCapabilityQueryAdmission} from '../extensions/query-pack-capabilities.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {inspectPackInspectionJob,type PackInspectionDiagnosticAdmission} from '../extensions/inspect-pack-inspection-job.ts';
import { storeInlineArtifact, type InlineArtifactStorageChecks } from '../data/store-inline-artifact.ts';
import { requestActionAuthorization, type ActionAuthorizationRequestChecks } from '../execution/request-authorization.ts';
import { cancelAction, type ActionCancellationChecks } from '../execution/cancel-action.ts';
import { ActionCursorCodec } from './action-cursor.ts';
import { listActionQuery, type ActionListAdmission } from '../execution/action-list.ts';
import { getActionQuery, type ActionViewAction, type ActionViewAdmission } from '../execution/action-query.ts';
import { proposeAction, type ActionProposalChecks, type AutomaticProposalAuthorization } from '../execution/propose-action.ts';
import type { EntityRef, QueryPackCapabilitiesQuery } from '@abh/contracts';
import { createHttpApp, HttpFailure, type HttpInstallation, type PublicCommand } from '@abh/adapter-fastify';
import { inputDigest } from '../data/journal.ts';
import type { Database, TransactionOptions } from '../data/uow.ts';
import { IdentityIngress } from '../identity/ingress.ts';
import { deriveVerifiedContext, requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { withdrawDecision, type DecisionWithdrawalChecks } from '../human/withdraw-decision.ts';
import { submitDecision, type DecisionSubmissionChecks } from '../human/submit-decision.ts';
import { getDecisionQuery, listDecisionQuery } from '../human/decision-query.ts';
import type { DecisionInboxFilter } from '../human/inbox.ts';
import type { DecisionViewAction, DecisionViewAdmission } from '../human/decision-view.ts';
import { contract } from '../data/journal.ts';
import { InboxCursorCodec } from './inbox-cursor.ts';
import { ProjectionCursorCodec } from './projection-cursor.ts';
import { createMissionHandlers, createMissionQueryHandlers, type MissionHttpInstallation } from './mission-http.ts';
import { MissionCursorCodec } from './mission-cursor.ts';
import { RunCursorCodec } from './run-cursor.ts';
import { subscribeMissionSummaryChanges } from '../workbench/projections.ts';
import { subscribeResponsibilityInboxChanges } from '../workbench/responsibility-inbox-projection.ts';
import { recordProjectionMetric, type ProjectionMetrics, type ProjectionSseDropReason } from '../workbench/projection-metrics.ts';

type ArtifactStorageCommand = Extract<PublicCommand, { type: 'abh.artifacts.store-inline' }>;
type CancellationCommand = Extract<PublicCommand, { type: 'abh.actions.cancel' }>;
type AuthorizationRequestCommand = Extract<PublicCommand, { type: 'abh.actions.request-authorization' }>;
type ProposalCommand = Extract<PublicCommand, { type: 'abh.actions.propose' }>;
type WithdrawalCommand = Extract<PublicCommand, { type: 'abh.decisions.withdraw' }>;
type SubmissionCommand = Extract<PublicCommand, { type: 'abh.decisions.submit' }>;
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
  packInspectionDiagnostic?: {
    grants(context: VerifiedContext, id:string, options:TransactionOptions):Promise<readonly EntityRef[]>;
    admission:PackInspectionDiagnosticAdmission;
  };
  artifactStorage?: {
    grants(context: VerifiedContext, command: ArtifactStorageCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
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
  withdrawal?: {
    /** Resolve candidate grants from trusted installation. The Owner revalidates every grant in its transaction. */
    grants(context: VerifiedContext, command: WithdrawalCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: DecisionWithdrawalChecks;
  };
  submission?: {
    grants(context: VerifiedContext, command: SubmissionCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
    checks: DecisionSubmissionChecks;
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
  if (installation.mission?.contextGet && typeof installation.mission.contextGet.grants !== 'function')
    throw new TypeError('Context query grant installation required');
  if (installation.mission?.projectionList && !(installation.mission.projectionList.cursor instanceof ProjectionCursorCodec))
    throw new TypeError('Projection list cursor installation required');
  const capabilitySource=installation.capabilityQuery;
  if(capabilitySource&&[capabilitySource.grants,capabilitySource.admission?.fenceRefs,capabilitySource.admission?.inspect].some(handler=>typeof handler!=='function'))throw new TypeError('Capability query governance installation required');
  const capabilityQuery=capabilitySource&&{grants:capabilitySource.grants.bind(capabilitySource),admission:{fenceRefs:capabilitySource.admission.fenceRefs.bind(capabilitySource.admission),inspect:capabilitySource.admission.inspect.bind(capabilitySource.admission)}};
  const diagnosticSource=installation.packInspectionDiagnostic;
  if(diagnosticSource&&[diagnosticSource.grants,diagnosticSource.admission?.fenceRefs,diagnosticSource.admission?.current,diagnosticSource.admission?.read].some(handler=>typeof handler!=='function'))throw new TypeError('Pack diagnostic governance installation required');
  const diagnostic=diagnosticSource&&{grants:diagnosticSource.grants.bind(diagnosticSource),admission:{fenceRefs:diagnosticSource.admission.fenceRefs.bind(diagnosticSource.admission),current:diagnosticSource.admission.current.bind(diagnosticSource.admission),read:diagnosticSource.admission.read.bind(diagnosticSource.admission)}};

  const artifactStorage = installation.artifactStorage && { ...installation.artifactStorage, checks: { ...installation.artifactStorage.checks } };
  if (artifactStorage && [artifactStorage.grants, artifactStorage.checks.fenceRefs, artifactStorage.checks.admit, artifactStorage.checks.references].some(handler => typeof handler !== 'function')) throw new TypeError('Artifact storage governance installation required');
  const withdrawal = installation.withdrawal && { ...installation.withdrawal, checks: { ...installation.withdrawal.checks } };
  if (withdrawal && [withdrawal.grants, withdrawal.checks.fenceRefs, withdrawal.checks.admit, withdrawal.checks.lockSubject, withdrawal.checks.source].some(handler => typeof handler !== 'function')) throw new TypeError('Withdrawal governance installation required');
  const submission = installation.submission && { ...installation.submission, checks: { ...installation.submission.checks, eligibility: { ...installation.submission.checks.eligibility } } };
  if (submission && [submission.grants, submission.checks.fenceRefs, submission.checks.admit, submission.checks.effects, ...['lock', 'candidate', 'submit', 'revalidate', 'conditions'].map(key => submission.checks.eligibility[key as keyof typeof submission.checks.eligibility])].some(handler => typeof handler !== 'function')) throw new TypeError('Submission governance installation required');
  const actionAuthorizationRequest = installation.actionAuthorizationRequest && { ...installation.actionAuthorizationRequest, checks: { ...installation.actionAuthorizationRequest.checks, purposeNames: [...installation.actionAuthorizationRequest.checks.purposeNames] } };
  if (actionAuthorizationRequest && [actionAuthorizationRequest.grants, actionAuthorizationRequest.checks.fenceRefs, actionAuthorizationRequest.checks.admit].some(handler => typeof handler !== 'function')) throw new TypeError('Action authorization request governance installation required');
  const actionProposal = installation.actionProposal && { ...installation.actionProposal, checks: { ...installation.actionProposal.checks }, ...(installation.actionProposal.automaticAuthorization ? { automaticAuthorization: { ...installation.actionProposal.automaticAuthorization, purposeNames: [...installation.actionProposal.automaticAuthorization.purposeNames] } } : {}) };
  if (actionProposal && [actionProposal.grants, actionProposal.checks.fenceRefs, actionProposal.checks.admit, actionProposal.checks.definition, actionProposal.checks.artifact, actionProposal.checks.proposal].some(handler => typeof handler !== 'function')) throw new TypeError('Action proposal governance installation required');
  if (actionProposal?.automaticAuthorization && [actionProposal.automaticAuthorization.grants, actionProposal.automaticAuthorization.fenceRefs, actionProposal.automaticAuthorization.admit].some(handler => typeof handler !== 'function')) throw new TypeError('Automatic proposal authorization governance required');
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
    else throw new CoreError('RESOURCE_NOT_FOUND');
  };
  // Evidence stays private to this installation and is bound to one transport invocation.
  // JSON-shaped RequestContext alone can never create a VerifiedContext for a handler.
  const verified = new WeakMap<AbortSignal, { context: VerifiedContext; options: TransactionOptions }>();
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
  const queries: Partial<HttpInstallation['queries']> = {};
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
  return createHttpApp({
    ...(installation.deadlineMs === undefined ? {} : { deadlineMs: installation.deadlineMs }),
    ...(installation.bodyLimit === undefined ? {} : { bodyLimit: installation.bodyLimit }),
    ...(projectionEventSubscribe ? {events:{subscribe:projectionEventSubscribe}}:{}),
    commands,
    queries,
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
}
