import type { ArtifactRecord, RunRecord, QueryPackCapabilitiesQuery, PackCapabilityQueryResult, PackInspectionDiagnosticResponse, InspectPackInspectionJobQuery, InlineArtifactStoredResponse, StoreInlineArtifactPayload, ActionAcceptedResponse, ActionListResponse, ActionQueryResponse, CancelActionPayload, GetActionQuery, ListActionsQuery, ListMissionsQuery, ListRunsQuery, RunListResult, ProposeActionPayload, ProposeSafetyStopPayload, RequestAuthorizationPayload, DecisionInboxResponse, DecisionQueryResponse, DecisionSubmittedResponse, DecisionWithdrawnResponse, ErrorResponse, GetDecisionQuery, ListInboxQuery, SubmitDecisionPayload, WithdrawDecisionPayload, MissionView, MissionListResult, MissionRecord, ActivateMissionPayload, PauseMissionPayload, CancelMissionPayload, ResumeMissionPayload, SubmitTriggerPayload, RunView, StartRunPayload, CompleteRunPayload, CancelRunPayload, VerificationReport, SubmitVerificationPayload, GetProjectionQuery, ProjectionQueryResult } from '@abh/contracts';
import { canonicalJson, digestBytes } from '@abh/contracts/digest';
import { parseHttpCommand, parseHttpQuery, protocolRegistry, serializeHttpResponse } from '@abh/contracts/http';
import { validateContract } from '@abh/contracts/schema';
import type { ListEvaluationRunsQuery, ListLearningCandidatesQuery, ListLearningCasesQuery, ListLearningGatesQuery, ListLearningSignalsQuery } from '@abh/contracts';

export interface ClientRequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface UpdateCommandInput<T> { id: string; expectedVersion: number; idempotencyKey: string; payload: T }
export type DecisionCommandInput<T> = UpdateCommandInput<T>;
export interface StoreInlineArtifactInput { organizationId: string; idempotencyKey: string; payload: StoreInlineArtifactPayload }
export interface StoreObjectArtifactInput {
  organizationId:string;idempotencyKey:string;
  payload:Omit<StoreInlineArtifactPayload,'content'>;
  content:ReadableStream<Uint8Array>|AsyncIterable<Uint8Array>;
  digest:string;declaredSizeBytes:number;authorizedContextRef:import('@abh/contracts').EntityRef;
}
export interface ObjectArtifactStoredResponse { readonly success:true;readonly data:{readonly record:ArtifactRecord} }
/** Small JSON business input; storage governance remains server-owned. */
export interface ProposeActionInput {
  organizationId: string;
  idempotencyKey: string;
  input: unknown;
  artifact: Omit<StoreInlineArtifactPayload, 'content' | 'mediaType'>;
  action: Omit<ProposeActionPayload, 'payloadRef' | 'sourceProposalRef'>;
}
export interface ProposeStoredActionInput { organizationId: string; idempotencyKey: string; payload: ProposeActionPayload }
export interface StartSafetyStopInput { organizationId: string; idempotencyKey: string; payload: ProposeSafetyStopPayload }
export interface MissionCommandInput<T> { idempotencyKey: string; payload: T }
export interface CorrectionCommandInput<T> { idempotencyKey: string; targetId: string; payload: T }
export interface CreateTargetCommandInput<T> { id: string; idempotencyKey: string; payload: T }
export interface LearningCaseInput { organizationId: string; idempotencyKey: string; payload: import('@abh/contracts').BuildCasePayload }
export interface LearningCandidateInput { organizationId: string; idempotencyKey: string; payload: import('@abh/contracts').CreateCandidatePayload }
export interface EvaluationRequestInput { organizationId: string; idempotencyKey: string; payload: import('@abh/contracts').RequestEvaluationPayload }
export interface EvaluationRetryInput { organizationId: string; idempotencyKey: string; payload: import('@abh/contracts').RetryEvaluationPayload }
export interface LearningReleaseInput { releaseId: string; idempotencyKey: string; payload: import('@abh/contracts').ConfigureLearningReleasePayload }
export interface MissionCreateInput { idempotencyKey: string; payload: import('@abh/contracts').CreateMissionPayload; organizationId: string }
export interface AbhClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Resolve current credentials for each call. Context, actor and authority are never client-authenticated. */
  headers?(signal: AbortSignal): Promise<HeadersInit>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}
export class AbhClientError extends Error {
  readonly code: 'INVALID_ARGUMENT' | 'TRANSPORT_ERROR' | 'PROTOCOL_ERROR' | 'ABH_ERROR';
  /** Responded means a validated error response, not proof that a write did not commit. */
  readonly outcome: 'NotSent' | 'Unknown' | 'Responded';
  readonly response: ErrorResponse | undefined;
  constructor(code: AbhClientError['code'], outcome: AbhClientError['outcome'], response?: ErrorResponse) {
    super('ABH request could not be completed.'); this.name = 'AbhClientError';
    this.code = code; this.outcome = outcome; this.response = response;
  }
}
const invalid = () => new AbhClientError('INVALID_ARGUMENT', 'NotSent');
function invalidUnlessAbh(error: unknown): never {
  if (error instanceof AbhClientError) throw error;
  throw invalid();
}

/** Browser-compatible contract client. No retries, approval defaults, Owner access or Node runtime dependencies. */
export function createAbhClient(options: AbhClientOptions) {
  let base: URL;
  try { base = new URL(options.baseUrl); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw invalid();
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis), credentials = options.headers;
  const timeoutMs = options.timeoutMs ?? 30_000, maxBytes = options.maxResponseBytes ?? 1_048_576;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216) throw invalid();

    function uploadStream(content: StoreObjectArtifactInput['content']): ReadableStream<Uint8Array> {
      if ('getReader' in content) return content;
      const iterator=content[Symbol.asyncIterator]();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next=await iterator.next();
            if(next.done)controller.close();else controller.enqueue(next.value);
          } catch(error) { controller.error(error); }
        },
        async cancel() { await iterator.return?.(); }
      });
    }
    function base64Url(value:string):string {
      const bytes=new TextEncoder().encode(value);let binary='';
      for(let offset=0;offset<bytes.length;offset+=0x8000)
        binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
      return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    async function request<T>(operation: string, path: string, headers: Headers, body: string | BodyInit | undefined, input: ClientRequestOptions): Promise<T> {
    const timeout = input.timeoutMs ?? timeoutMs;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw invalid();
    const stop = new AbortController(), cancel = () => stop.abort();
    const timer = setTimeout(cancel, timeout);
    input.signal?.addEventListener('abort', cancel, { once: true });
    if (input.signal?.aborted) cancel();
    let sent = false, onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new AbhClientError('TRANSPORT_ERROR', sent ? 'Unknown' : 'NotSent'));
      stop.signal.addEventListener('abort', onAbort, { once: true });
      if (stop.signal.aborted) onAbort();
    });
    try {
      const work = async () => {
        if (stop.signal.aborted) throw new AbhClientError('TRANSPORT_ERROR', 'NotSent');
        const auth = new Headers(await credentials?.(stop.signal));
        if (stop.signal.aborted) throw new AbhClientError('TRANSPORT_ERROR', 'NotSent');
        for (const name of ['if-match', 'idempotency-key', 'content-type']) auth.delete(name);
        headers.forEach((value, key) => auth.set(key, value));
        const url = new URL(path.replace(/^\//, ''), base);
        sent = true;
        const response = await fetcher(url, { method: body === undefined ? 'GET' : 'POST', headers: auth,
          ...(body === undefined ? {} : { body }), ...(body instanceof ReadableStream?{duplex:'half'}:{}),
          signal: stop.signal, redirect: 'error', cache: 'no-store', credentials: 'same-origin' } as RequestInit);
        if (stop.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new AbhClientError('TRANSPORT_ERROR', 'Unknown'); }
        if (response.redirected || response.url && new URL(response.url).origin !== base.origin || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { void response.body?.cancel().catch(() => {}); throw new AbhClientError('PROTOCOL_ERROR', 'Unknown'); }
        const reader = response.body?.getReader();
        if (!reader) throw new AbhClientError('PROTOCOL_ERROR', 'Unknown');
        const chunks: Uint8Array[] = []; let size = 0;
        const cancelBody = () => { void reader.cancel().catch(() => {}); };
        stop.signal.addEventListener('abort', cancelBody, { once: true });
        try {
          while (true) {
            if (stop.signal.aborted) throw new AbhClientError('TRANSPORT_ERROR', 'Unknown');
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maxBytes) { cancelBody(); throw new AbhClientError('PROTOCOL_ERROR', 'Unknown'); }
            chunks.push(chunk.value);
          }
        } finally { stop.signal.removeEventListener('abort', cancelBody); reader.releaseLock(); }
        if (stop.signal.aborted) throw new AbhClientError('TRANSPORT_ERROR', 'Unknown');
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        let decoded: unknown;
        try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { throw new AbhClientError('PROTOCOL_ERROR', 'Unknown'); }
        if (operation === 'ObjectUpload') {
          if (response.status !== 201) throw new AbhClientError('PROTOCOL_ERROR', 'Unknown');
          const upload = decoded as ObjectArtifactStoredResponse | ErrorResponse;
          if ((upload as ErrorResponse).success === false) throw new AbhClientError('ABH_ERROR', 'Responded', upload as ErrorResponse);
          if ((upload as ObjectArtifactStoredResponse).success !== true
            || !validateContract('ArtifactRecord', (upload as ObjectArtifactStoredResponse).data?.record).success)
            throw new AbhClientError('PROTOCOL_ERROR', 'Unknown');
          return upload as T;
        }
        const checked = serializeHttpResponse(operation, response.status, decoded);
        if (!checked.success) throw new AbhClientError('PROTOCOL_ERROR', 'Unknown');
        const result = JSON.parse(checked.json);
        if (result.success === false) throw new AbhClientError('ABH_ERROR', 'Responded', result as ErrorResponse);
        return result as T;
      };
      return await Promise.race([work(), aborted]);
    } catch (error) {
      if (error instanceof AbhClientError) throw error;
      throw new AbhClientError('TRANSPORT_ERROR', sent ? 'Unknown' : 'NotSent');
    } finally {
      clearTimeout(timer); input.signal?.removeEventListener('abort', cancel); stop.signal.removeEventListener('abort', onAbort);
    }
  }
  async function query<T>(type: 'abh.capabilities.query' | 'abh.pack-inspection-jobs.inspect' | 'abh.decisions.get' | 'abh.decisions.list-inbox' | 'abh.actions.get' | 'abh.actions.list' | 'abh.missions.get' | 'abh.missions.list' | 'abh.runs.get' | 'abh.runs.list' | 'abh.tools.get' | 'abh.projections.get' | 'abh.corrections.get' | 'abh.assignments.get' | 'abh.assignments.list' | 'abh.evaluation-runs.get' | 'abh.evaluation-runs.list' | 'abh.evaluation-results.get' | 'abh.learning-gates.get' | 'abh.learning-gates.list' | 'abh.learning-signals.list' | 'abh.learning-cases.list' | 'abh.learning-candidates.list' | 'abh.safety-stops.list', input: QueryPackCapabilitiesQuery | InspectPackInspectionJobQuery | GetDecisionQuery | ListInboxQuery | GetActionQuery | ListActionsQuery | ListMissionsQuery | ListRunsQuery | GetProjectionQuery | import('@abh/contracts').GetCorrectionQuery | import('@abh/contracts').GetAssignmentQuery | import('@abh/contracts').ListAssignmentsQuery | ListEvaluationRunsQuery | ListLearningGatesQuery | ListLearningSignalsQuery | ListLearningCasesQuery | ListLearningCandidatesQuery | import('@abh/contracts').ListSafetyStopsQuery | Record<string,never>, opts: ClientRequestOptions, id?: string): Promise<T> {
    try {
      const definition = protocolRegistry.queries.find(entry => entry.type === type)!;
      if (!validateContract(`${definition.name}Query`, input).success) throw invalid();
      const parameters = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
      if (!parseHttpQuery(type, parameters).success) throw invalid();
      let path: string = definition.path;
      if (path.includes('{id}')) {
        if (!validateContract('UUID', id).success) throw invalid();
        path = path.replace('{id}', encodeURIComponent(id!));
      }
      return request<T>(definition.name, `${path}?${new URLSearchParams(parameters)}`, new Headers({ accept: 'application/json' }), undefined, opts);
    } catch (error) { invalidUnlessAbh(error); }
  }
  type UpdatePayload = SubmitDecisionPayload | WithdrawDecisionPayload | CancelActionPayload | RequestAuthorizationPayload | ActivateMissionPayload | PauseMissionPayload | CancelMissionPayload | ResumeMissionPayload | SubmitTriggerPayload | StartRunPayload | CompleteRunPayload | CancelRunPayload | SubmitVerificationPayload | import('@abh/contracts').InvokeToolPayload;
   type MissionRefCommandType = 'abh.missions.activate' | 'abh.missions.pause' | 'abh.missions.cancel' | 'abh.missions.resume' | 'abh.missions.submit-trigger' | 'abh.runs.start' | 'abh.runs.complete';
  type UpdateType = 'abh.decisions.submit' | 'abh.decisions.withdraw' | 'abh.actions.cancel' | 'abh.actions.request-authorization' | 'abh.verification.submit' | 'abh.runs.cancel' | 'abh.exceptions.resolve' | 'abh.exceptions.apply-resolution-effect';
  async function command<T>(type: UpdateType | 'abh.actions.propose' | 'abh.actions.start-safety-stop' | 'abh.artifacts.store-inline' | 'abh.missions.create' | 'abh.tools.invoke' | 'abh.learning.build-case' | 'abh.learning.create-candidate' | 'abh.learning.request-evaluation' | 'abh.learning.retry-evaluation' | 'abh.releases.configure-learning-candidate' | 'abh.assignments.pause' | 'abh.assignments.rollback' | 'abh.corrections.propose' | 'abh.corrections.apply', input: UpdateCommandInput<UpdatePayload> | ProposeStoredActionInput | StartSafetyStopInput | StoreInlineArtifactInput | MissionCreateInput | MissionCommandInput<UpdatePayload> | CorrectionCommandInput<import('@abh/contracts').ProposeCorrectionPayload> | UpdateCommandInput<import('@abh/contracts').ApplyCorrectionPayload> | LearningCaseInput | LearningCandidateInput | EvaluationRequestInput | EvaluationRetryInput | LearningReleaseInput | UpdateCommandInput<import('@abh/contracts').StopStaticAssignmentPayload> | UpdateCommandInput<import('@abh/contracts').RollbackStaticAssignmentPayload> | UpdateCommandInput<import('@abh/contracts').ResolveExceptionPayload> | CreateTargetCommandInput<import('@abh/contracts').ApplyExceptionResolutionEffectPayload>, opts: ClientRequestOptions): Promise<T> {
    try {
      const definition = protocolRegistry.commands.find(entry => entry.type === type)!;
      if (!validateContract('IdempotencyKey', input.idempotencyKey).success || /[\r\n]/.test(input.idempotencyKey) || input.idempotencyKey.trim() !== input.idempotencyKey) throw invalid();
      const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': input.idempotencyKey });
      let id: string;
      if (type === 'abh.actions.propose' || type === 'abh.actions.start-safety-stop' || type === 'abh.artifacts.store-inline' || type === 'abh.missions.create' || type === 'abh.learning.build-case' || type === 'abh.learning.create-candidate' || type === 'abh.learning.request-evaluation' || type === 'abh.learning.retry-evaluation') {
        if (!('organizationId' in input) || 'expectedVersion' in input) throw invalid();
        id = input.organizationId;
      } else if (type === 'abh.corrections.propose') {
        if (!('targetId' in input) || 'expectedVersion' in input || !validateContract('UUID', input.targetId).success) throw invalid();
        id = input.targetId;
      } else if (type === 'abh.releases.configure-learning-candidate') {
        if (!('releaseId' in input) || 'expectedVersion' in input || !validateContract('UUID', input.releaseId).success) throw invalid();
        id = input.releaseId;
      } else if (type === 'abh.exceptions.apply-resolution-effect') {
        if (!('id' in input) || 'expectedVersion' in input || !validateContract('UUID', input.id).success) throw invalid();
        id = input.id;
      } else {
        if (!('expectedVersion' in input) || !validateContract('Version', input.expectedVersion).success) throw invalid();
        headers.set('if-match', `"${input.expectedVersion}"`);
        id = input.id;
      }
      const body = { target: { type: definition.targetType, id }, payload: input.payload };
      if (!parseHttpCommand(type, Object.fromEntries(headers), body).success) throw invalid();
      return request<T>(definition.name, `/v1/commands/${type}`, headers, canonicalJson(body), opts);
  } catch (error) { invalidUnlessAbh(error); }
 }
 async function createMissionRefCommand<T>(type: MissionRefCommandType,
   input: MissionCommandInput<ActivateMissionPayload | PauseMissionPayload | CancelMissionPayload |
     ResumeMissionPayload | SubmitTriggerPayload | StartRunPayload | CompleteRunPayload>,
   opts: ClientRequestOptions): Promise<T> {
  try {
   const definition = protocolRegistry.commands.find(entry => entry.type === type)!;
   if (!validateContract('IdempotencyKey', input.idempotencyKey).success || /[\r\n]/.test(input.idempotencyKey) || input.idempotencyKey.trim() !== input.idempotencyKey) throw invalid();
   const id = 'missionRef' in input.payload ? input.payload.missionRef.id : input.payload.runRef.id;
   const version = 'missionRef' in input.payload ? input.payload.missionRef.version : input.payload.runRef.version;
   const body = { target: { type: definition.targetType, id }, payload: input.payload };
   const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': input.idempotencyKey });
   headers.set('if-match', `"${version}"`);
   if (!parseHttpCommand(type, Object.fromEntries(headers), body).success) throw invalid();
   return request<T>(definition.name, `/v1/commands/${type}`, headers, canonicalJson(body), opts);
  } catch (error) { invalidUnlessAbh(error); }
 }
  async function propose(input: ProposeActionInput, opts: ClientRequestOptions = {}): Promise<ActionAcceptedResponse> {
    const timeout = opts.timeoutMs ?? timeoutMs, started = Date.now();
    let snapshot: ProposeActionInput, content: string;
    try {
      if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw invalid();
      // Validate both steps before the first write and detach all caller-owned objects before awaiting.
      snapshot = JSON.parse(canonicalJson(input)); content = canonicalJson(snapshot.input);
      if (!validateContract('IdempotencyKey', snapshot.idempotencyKey).success || /[\r\n]/.test(snapshot.idempotencyKey) || snapshot.idempotencyKey.trim() !== snapshot.idempotencyKey) throw invalid();
      const placeholder = { type: 'abh.artifact', id: '00000000-0000-4000-8000-000000000001', version: 2 };
      if (!validateContract('UUID', snapshot.organizationId).success
        || !validateContract('StoreInlineArtifactPayload', { ...snapshot.artifact, mediaType: 'application/json', content }).success
        || !validateContract('ProposeActionPayload', { ...snapshot.action, payloadRef: placeholder, sourceProposalRef: placeholder }).success
        || Object.keys(snapshot).some(key => !['organizationId','idempotencyKey','input','artifact','action'].includes(key))
        || 'content' in snapshot.artifact || 'mediaType' in snapshot.artifact || 'payloadRef' in snapshot.action || 'sourceProposalRef' in snapshot.action
        || new TextEncoder().encode(content).length > 65_536) throw invalid();
    } catch { throw invalid(); }
    // Hash the root key, not the input: changed input must conflict with the original step receipts.
    const key = await digestBytes(new TextEncoder().encode(canonicalJson(['abh.client.actions.propose.v1', snapshot.organizationId, snapshot.idempotencyKey])));
    let stored = false;
    const remaining = (): ClientRequestOptions => {
      const left = timeout - (Date.now() - started);
      if (left < 1 || opts.signal?.aborted) throw new AbhClientError('TRANSPORT_ERROR', stored ? 'Unknown' : 'NotSent');
      return { ...opts, timeoutMs: left };
    };
    try {
      const artifact = await command<InlineArtifactStoredResponse>('abh.artifacts.store-inline', { organizationId: snapshot.organizationId,
        idempotencyKey: `propose/${key.slice(7)}/artifact`, payload: { ...snapshot.artifact, mediaType: 'application/json', content } }, remaining());
      stored = true;
      return await command<ActionAcceptedResponse>('abh.actions.propose', { organizationId: snapshot.organizationId,
        idempotencyKey: `propose/${key.slice(7)}/action`, payload: { ...snapshot.action, payloadRef: artifact.data.objectRef, sourceProposalRef: artifact.data.objectRef } }, remaining());
    } catch (error) {
      if (stored && error instanceof AbhClientError && error.outcome === 'NotSent') throw new AbhClientError(error.code, 'Unknown', error.response);
      throw error;
    }
  }
  return {
    artifacts: {
      storeInline: (input: StoreInlineArtifactInput, opts: ClientRequestOptions = {}) => command<InlineArtifactStoredResponse>('abh.artifacts.store-inline', input, opts),
      storeObject: (input: StoreObjectArtifactInput, opts: ClientRequestOptions = {}) => {
        const headers = new Headers({ accept: 'application/json', 'content-type': input.payload.mediaType,
          'idempotency-key': input.idempotencyKey,
          'x-abh-upload-metadata': base64Url(canonicalJson({
            ...input.payload,digest:input.digest,declaredSizeBytes:input.declaredSizeBytes,
            authorizedContextRef:input.authorizedContextRef
          })) });
        if (!validateContract('UUID', input.organizationId).success
          || !validateContract('IdempotencyKey', input.idempotencyKey).success
          || /[\r\n]/.test(input.idempotencyKey) || input.idempotencyKey.trim() !== input.idempotencyKey
          || !validateContract('Digest', input.digest).success
          || !validateContract('EntityRef', input.authorizedContextRef).success
          || !Number.isSafeInteger(input.declaredSizeBytes) || input.declaredSizeBytes < 1) throw invalid();
        return request<ObjectArtifactStoredResponse>('ObjectUpload','/v1/artifacts/object-uploads',headers,
          uploadStream(input.content),opts);
      },
    },
    capabilities: {
      /** Candidate discovery only; complete=false requires narrowing the query, never automatic selection. */
      query: (input: QueryPackCapabilitiesQuery, opts: ClientRequestOptions = {}) => query<PackCapabilityQueryResult>('abh.capabilities.query', input, opts),
    },
    packInspections: {
      inspect: (input: InspectPackInspectionJobQuery, opts: ClientRequestOptions = {}) => query<PackInspectionDiagnosticResponse>('abh.pack-inspection-jobs.inspect', input, opts),
    },
    actions: {
      propose,
      get: (id: string, input: GetActionQuery = {}, opts: ClientRequestOptions = {}) => query<ActionQueryResponse>('abh.actions.get', input, opts, id),
      list: (input: ListActionsQuery = {}, opts: ClientRequestOptions = {}) => query<ActionListResponse>('abh.actions.list', input, opts),
      /** Low-level proposal using existing server-stored Artifact references. Does not upload or construct business input. */
      proposeFromArtifact: (input: ProposeStoredActionInput, opts: ClientRequestOptions = {}) => command<ActionAcceptedResponse>('abh.actions.propose', input, opts),
      /** Low-level safety proposal against a caller-selected current candidate; the server revalidates fence and token. */
      startSafetyStopFromArtifact: (input: StartSafetyStopInput, opts: ClientRequestOptions = {}) =>
        command<ActionAcceptedResponse>('abh.actions.start-safety-stop', input, opts),
      cancel: (input: UpdateCommandInput<CancelActionPayload>, opts: ClientRequestOptions = {}) => command<ActionAcceptedResponse>('abh.actions.cancel', input, opts),
      requestAuthorization: (input: UpdateCommandInput<RequestAuthorizationPayload>, opts: ClientRequestOptions = {}) => command<ActionAcceptedResponse>('abh.actions.request-authorization', input, opts),
    },
    decisions: {
      get: (input: GetDecisionQuery, opts: ClientRequestOptions = {}) => query<DecisionQueryResponse>('abh.decisions.get', input, opts),
      listInbox: (input: ListInboxQuery = {}, opts: ClientRequestOptions = {}) => query<DecisionInboxResponse>('abh.decisions.list-inbox', input, opts),
      submit: (input: DecisionCommandInput<SubmitDecisionPayload>, opts: ClientRequestOptions = {}) => command<DecisionSubmittedResponse>('abh.decisions.submit', input, opts),
      withdraw: (input: DecisionCommandInput<WithdrawDecisionPayload>, opts: ClientRequestOptions = {}) => command<DecisionWithdrawnResponse>('abh.decisions.withdraw', input, opts),
    },
    corrections: {
      get: (input: import('@abh/contracts').GetCorrectionQuery, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').CorrectionRecord>('abh.corrections.get', input, opts),
      apply: (input: UpdateCommandInput<import('@abh/contracts').ApplyCorrectionPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').CorrectionAppliedResponse>('abh.corrections.apply', input, opts),
      propose: (input: CorrectionCommandInput<import('@abh/contracts').ProposeCorrectionPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').CorrectionProposedResponse>('abh.corrections.propose', input, opts),
    },
    missions: {
      get: (id: string, opts: ClientRequestOptions = {}) => query<MissionView>('abh.missions.get', {id}, opts),
      list: (input: ListMissionsQuery = {}, opts: ClientRequestOptions = {}) =>
        query<MissionListResult>('abh.missions.list', input, opts),
      create: (input: MissionCreateInput, opts: ClientRequestOptions = {}) => command<MissionRecord>('abh.missions.create', input, opts),
      activate: (input: MissionCommandInput<ActivateMissionPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<MissionRecord>('abh.missions.activate', input, opts),
      pause: (input: MissionCommandInput<PauseMissionPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<MissionRecord>('abh.missions.pause', input, opts),
      cancel: (input: MissionCommandInput<CancelMissionPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<MissionRecord>('abh.missions.cancel', input, opts),
      resume: (input: MissionCommandInput<ResumeMissionPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<MissionRecord>('abh.missions.resume', input, opts),
      submitTrigger: (input: MissionCommandInput<SubmitTriggerPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<import('@abh/contracts').MissionTriggerRecord>('abh.missions.submit-trigger', input, opts),
    },
    runs: {
      get: (id: string, opts: ClientRequestOptions = {}) => query<RunView>('abh.runs.get', {id}, opts),
      list: (input: ListRunsQuery = {}, opts: ClientRequestOptions = {}) => query<RunListResult>('abh.runs.list', input, opts),
      start: (input: MissionCommandInput<StartRunPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<RunRecord & {runRef:{type:'abh.run';id:string;version:number}}>('abh.runs.start', input, opts),
      complete: (input: MissionCommandInput<CompleteRunPayload>, opts: ClientRequestOptions = {}) => createMissionRefCommand<import('@abh/contracts').RunRecord>('abh.runs.complete', input, opts),
      cancel: (input: UpdateCommandInput<CancelRunPayload>, opts: ClientRequestOptions = {}) => command<RunRecord>('abh.runs.cancel', input, opts),
    },
    verification: {
      submit: (input: MissionCommandInput<SubmitVerificationPayload>, opts: ClientRequestOptions = {}) => command<VerificationReport>('abh.verification.submit', input, opts),
    },
    learning: {
      buildCase: (input: LearningCaseInput, opts: ClientRequestOptions = {}) => command<import('@abh/contracts').LearningCaseCreatedResponse>('abh.learning.build-case', input, opts),
      createCandidate: (input: LearningCandidateInput, opts: ClientRequestOptions = {}) => command<import('@abh/contracts').LearningCandidateCreatedResponse>('abh.learning.create-candidate', input, opts),
      requestEvaluation: (input: EvaluationRequestInput, opts: ClientRequestOptions = {}) => command<import('@abh/contracts').EvaluationRunCreatedResponse>('abh.learning.request-evaluation', input, opts),
      retryEvaluation: (input: EvaluationRetryInput, opts: ClientRequestOptions = {}) => command<import('@abh/contracts').EvaluationRunCreatedResponse>('abh.learning.retry-evaluation', input, opts),
      getEvaluationRun: (id: string, opts: ClientRequestOptions = {}) => query<import('@abh/contracts').EvaluationRunRecord>('abh.evaluation-runs.get', {id}, opts),
      getEvaluationResult: (id: string, opts: ClientRequestOptions = {}) => query<import('@abh/contracts').EvaluationResultRecord>('abh.evaluation-results.get', {id}, opts),
      getLearningGate: (id: string, opts: ClientRequestOptions = {}) => query<import('@abh/contracts').EvaluationGateArtifactRecord>('abh.learning-gates.get', {id}, opts),
      listSignals: (input: ListLearningSignalsQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').LearningSignalListResult>('abh.learning-signals.list', input, opts),
      listCases: (input: ListLearningCasesQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').LearningCaseListResult>('abh.learning-cases.list', input, opts),
      listCandidates: (input: ListLearningCandidatesQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').LearningCandidateListResult>('abh.learning-candidates.list', input, opts),
      listEvaluationRuns: (input: ListEvaluationRunsQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').EvaluationRunListResult>('abh.evaluation-runs.list', input, opts),
      listGates: (input: ListLearningGatesQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').LearningGateListResult>('abh.learning-gates.list', input, opts),
    },
    projections: {
      get: (id: string, input: GetProjectionQuery, opts: ClientRequestOptions = {}) =>
        query<ProjectionQueryResult>('abh.projections.get', input, opts, id),
    },
    tools: {
      get: (id: string, opts: ClientRequestOptions = {}) => query<import('@abh/contracts').ToolCallInspection>('abh.tools.get', {id}, opts),
      invoke: (input: MissionCommandInput<import('@abh/contracts').InvokeToolPayload>, opts: ClientRequestOptions = {}) => command<import('@abh/contracts').ToolCallResponse>('abh.tools.invoke', input, opts),
    },
    releases: {
      configureLearningCandidate: (input: LearningReleaseInput, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').StaticAssignmentRecord>('abh.releases.configure-learning-candidate', input, opts),
    },
    assignments: {
      get: (id: string, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').StaticAssignmentRecord>('abh.assignments.get', {id}, opts),
      list: (input: import('@abh/contracts').ListAssignmentsQuery = {}, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').StaticAssignmentListResult>('abh.assignments.list', input, opts),
      pause: (input: UpdateCommandInput<import('@abh/contracts').StopStaticAssignmentPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').StaticAssignmentRecord>('abh.assignments.pause', input, opts),
      rollback: (input: UpdateCommandInput<import('@abh/contracts').RollbackStaticAssignmentPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').StaticAssignmentRecord>('abh.assignments.rollback', input, opts),
    },
    safetyStops: {
      list: (input: import('@abh/contracts').ListSafetyStopsQuery, opts: ClientRequestOptions = {}) =>
        query<import('@abh/contracts').SafetyStopListResult>('abh.safety-stops.list', input, opts),
      start: (input: StartSafetyStopInput, opts: ClientRequestOptions = {}) =>
        command<ActionAcceptedResponse>('abh.actions.start-safety-stop', input, opts),
    },
    exceptions: {
      resolve: (input: UpdateCommandInput<import('@abh/contracts').ResolveExceptionPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').ExceptionResolvedResponse>('abh.exceptions.resolve', input, opts),
      applyResolutionEffect: (input: CreateTargetCommandInput<import('@abh/contracts').ApplyExceptionResolutionEffectPayload>, opts: ClientRequestOptions = {}) =>
        command<import('@abh/contracts').ExceptionResolutionEffectResponse>('abh.exceptions.apply-resolution-effect', input, opts),
    },
  };
}
export type AbhClient = ReturnType<typeof createAbhClient>;
