import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from '@earendil-works/pi-ai';
import type { TSchema } from 'typebox';
import { validateContract } from '@abh/contracts/schema';
import type { EntityRef, UUID, Version } from '@abh/contracts';

export const SUPPORTED_PI_VERSION = '0.85.1';

export interface ModelGatewayRequest {
  readonly invocationRef: InvocationRef;
  readonly authorizedContextRef: EntityRef;
  readonly model: Model<any>;
  readonly context: Context;
  readonly maxTokens?: number;
}

export interface ModelGatewayCallOptions {
  readonly signal: AbortSignal;
}

export interface ModelGatewayPort {
  call(
    request: ModelGatewayRequest,
    options: ModelGatewayCallOptions,
  ): Promise<AssistantMessageEventStream>;
}

export interface ToolGatewayRequest {
  readonly invocationRef: InvocationRef;
  readonly authorizedContextRef: EntityRef;
  readonly bindingRef: EntityRef;
  readonly toolName: string;
  readonly callKey: string;
  readonly arguments: Record<string, unknown>;
}

export interface ToolGatewayPort {
  call(request: ToolGatewayRequest, options: { readonly signal: AbortSignal }): Promise<{
    readonly status: 'Completed' | 'Failed';
    readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
    readonly receiptRef?: EntityRef;
  }>;
}

export interface InvocationMaterial {
  readonly model: Model<any>;
  readonly prompt: string;
  readonly systemPrompt?: string;
}

export interface GatewayToolDefinition {
  readonly bindingRef: EntityRef;
  readonly toolName: string;
  readonly description: string;
  readonly parameters: TSchema;
  execute(
    arguments_: Record<string, unknown>,
    options: { readonly signal: AbortSignal },
  ): Promise<Record<string, unknown>>;
}

export interface PiAgentRuntimeOptions {
  readonly piVersion: string;
  readonly maxBufferedEvents?: number;
  readonly cleanupDeadlineMs?: number;
  readonly projectTelemetry?: false;
  readonly modelGateway: ModelGatewayPort;
  readonly toolGateway: ToolGatewayPort;
  readonly tools?: readonly GatewayToolDefinition[];
  readonly outputSink?: OutputSinkPort;
  readonly checkpointSink?: CheckpointSinkPort;
  readonly checkpointGateway?: CheckpointGatewayPort;
  readonly resumeAdmission?: ResumeAdmissionPort;
}

export interface StoredAgentOutput {
  readonly invocationRef: InvocationRef;
  readonly text: string;
  readonly usageTokens: number;
  readonly stopReason: InternalStopReason;
}

export interface OutputSinkPort {
  store(output: StoredAgentOutput, options: { readonly signal: AbortSignal }): Promise<EntityRef & { readonly type: 'abh.artifact' }>;
}

export interface AgentInvocationRequest {
  readonly invocationRef: InvocationRef;
  readonly task: import('@abh/contracts').AgentTaskContract;
  readonly authorizedContextRef: EntityRef;
  readonly contextManifestRef: EntityRef;
  readonly bindingRefs: readonly EntityRef[];
  readonly material: InvocationMaterial;
  readonly signal: AbortSignal;
}

export interface AgentCheckpoint {
  readonly invocationRef: InvocationRef;
  readonly piVersion: string;
  readonly definitionRef: EntityRef;
  readonly contextDigest: string;
  readonly lastEventSequence: number;
  readonly usageTokens: number;
  readonly turns: number;
  readonly transcript: readonly AgentMessage[];
  readonly toolReceiptRefs: readonly EntityRef[];
  readonly unresolvedToolReceiptRefs: readonly EntityRef[];
  readonly toolCallCounts: Readonly<Record<string, number>>;
}

export interface StoredAgentCheckpoint {
  readonly checkpoint: AgentCheckpoint;
}

export interface CheckpointSinkPort {
  store(checkpoint: StoredAgentCheckpoint, options: { readonly signal: AbortSignal }): Promise<EntityRef & { readonly type: 'abh.artifact' }>;
}

export interface CheckpointLoadRequest {
  readonly invocationRef: InvocationRef;
  readonly checkpointRef: EntityRef;
  readonly resumePermitRef: EntityRef;
  readonly authorizedContextRef: EntityRef;
  readonly signal: AbortSignal;
}

export interface CheckpointGatewayPort {
  load(request: CheckpointLoadRequest): Promise<LoadedAgentCheckpoint>;
}

export interface LoadedAgentCheckpoint {
  readonly checkpointRef: EntityRef & { readonly type: 'abh.artifact' };
  readonly checkpoint: AgentCheckpoint;
}

export interface ResumeAdmissionRequest {
  readonly piVersion: string;
  readonly invocationRef: InvocationRef;
  readonly checkpointRef: EntityRef;
  readonly resumePermitRef: EntityRef;
  readonly checkpoint: AgentCheckpoint;
  readonly task: import('@abh/contracts').AgentTaskContract;
  readonly authorizedContextRef: EntityRef;
  readonly contextManifestRef: EntityRef;
  readonly signal: AbortSignal;
}

export interface ResumeAdmissionPort {
  authorize(request: ResumeAdmissionRequest): Promise<void>;
}

export type AgentInvocationStatus =
  | 'Created'
  | 'Running'
  | 'Waiting'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface RuntimeSnapshot {
  readonly invocationRef: InvocationRef;
  readonly lastEventSequence: number;
  readonly runtimeStatus: AgentInvocationStatus;
  readonly stopReason?: string;
}

export interface PiAgentInvocation {
  inspect(): RuntimeSnapshot;
  cancel(reason: string, stopEpoch: Date): Promise<RuntimeSnapshot>;
  completion(): Promise<RuntimeSnapshot>;
  events(): AsyncIterable<import('@abh/contracts').RuntimeEvent>;
}

export interface PiAgentRuntimeAdapter {
  readonly piVersion: string;
  readonly projectTelemetry: false;
  invoke(request: AgentInvocationRequest): PiAgentInvocation;
  continue(request: AgentContinuationRequest): Promise<PiAgentInvocation>;
}

export interface AgentContinuationRequest extends Omit<AgentInvocationRequest, 'material'> {
  readonly checkpointRef: EntityRef;
  readonly resumePermitRef: EntityRef;
  readonly material: Omit<InvocationMaterial, 'prompt'>;
}

type InvocationRef = { readonly type: 'abh.invocation'; readonly id: UUID; readonly version: Version };
type InternalStopReason =
  | 'Completed'
  | 'BudgetExceeded'
  | 'Deadline'
  | 'NoProgress'
  | 'Cancelled'
  | 'DependencyFailure'
  | 'InvalidOutput';
export type { InternalStopReason };

interface InvocationState {
  readonly controller: AbortController;
  readonly queue: import('@abh/contracts').RuntimeEvent[];
  readonly waiters: Array<() => void>;
  readonly toolCounts: Map<string, number>;
  readonly maxBufferedEvents: number;
  sequence: number;
  status: AgentInvocationStatus;
  stopReason?: InternalStopReason;
  usageTokens: number;
  turns: number;
  closed: boolean;
  droppedCount: number;
  stopEmitted: boolean;
  checkpointRef?: EntityRef & { readonly type: 'abh.artifact' };
  toolReceiptRefs: EntityRef[];
  readonly requestedToolCallIds: Set<string>;
}

function nowTime(): string {
  return new Date().toISOString();
}

function makeRuntimeError(message: string, code = 'PI_VERSION_UNSUPPORTED'): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function unsafeResume(message = 'Invocation resume is unsafe'): Error & { code: string } {
  return makeRuntimeError(message, 'INVOCATION_RESUME_UNSAFE');
}

function emit(state: InvocationState, invocationRef: InvocationRef, event: Omit<import('@abh/contracts').RuntimeEvent, 'invocationRef' | 'sequence' | 'occurredAt'>): void {
  const candidate: import('@abh/contracts').RuntimeEvent = {
    invocationRef,
    sequence: state.sequence + 1,
    occurredAt: nowTime(),
    ...event,
  };
  const validated = validateContract('RuntimeEvent', candidate);
  if (!validated.success) {
    throw makeRuntimeError('Runtime event mapping failed');
  }
  state.sequence = validated.data.sequence;
  if (state.queue.length >= state.maxBufferedEvents) {
    state.droppedCount += 1;
    return;
  }
  state.queue.push(validated.data);
  state.waiters.splice(0).forEach(resolve => resolve());
  if (validated.data.kind === 'Stopped') state.stopEmitted = true;
}

function stop(state: InvocationState, status: AgentInvocationStatus, reason: InternalStopReason): void {
  if (state.closed) return;
  state.status = status;
  state.stopReason = reason;
  state.closed = true;
  state.controller.abort();
  state.waiters.splice(0).forEach(resolve => resolve());
}

function validateInvocationRequest(request:AgentInvocationRequest|AgentContinuationRequest,tools:readonly GatewayToolDefinition[]):void{
 const contract=validateContract('AgentTaskContract',request.task);
 if(!contract.success)throw makeRuntimeError('Agent task contract is invalid','INVOCATION_CONTRACT_INVALID');
 const bindingIds=new Set(request.bindingRefs.map(ref=>ref.id));
 for(const ref of request.task.toolBindingRefs)if(!bindingIds.has(ref.id))throw makeRuntimeError('Invocation binding is missing','INVOCATION_CONTRACT_INVALID');
 for(const tool of tools)if(!bindingIds.has(tool.bindingRef.id))throw makeRuntimeError('Tool definition is not bound to this invocation','INVOCATION_CONTRACT_INVALID');
}

function usageTokens(usage: Usage | undefined): number {
  return usage ? usage.input + usage.output : 0;
}

function convertStopReason(message: import('@earendil-works/pi-ai').AssistantMessage | undefined): InternalStopReason {
  if (!message) return 'DependencyFailure';
  if (message.stopReason === 'aborted') return 'Cancelled';
  if (message.stopReason === 'length') return 'BudgetExceeded';
  if (message.stopReason === 'error') return 'DependencyFailure';
  if (message.content.some(item => item.type === 'toolCall')) return 'NoProgress';
  return 'Completed';
}

function makeTool(
  request: AgentInvocationRequest | AgentContinuationRequest,
  definition: GatewayToolDefinition,
  state: InvocationState,
  options: PiAgentRuntimeOptions,
): AgentTool {
  const tool = {
    name: definition.toolName,
    label: definition.toolName,
    description: definition.description,
    parameters: definition.parameters,
    executionMode: 'sequential' as const,
    execute: async (
      _toolCallId: string,
      params: Record<string, unknown>,
      signal: AbortSignal | undefined,
    ) => {
      const bindingId = definition.bindingRef.id;
      const previous = state.toolCounts.get(bindingId) ?? 0;
      if (previous >= request.task.maxTurns) {
        stop(state, 'Failed', 'BudgetExceeded');
        throw new Error('Tool call budget exceeded');
      }
      state.toolCounts.set(bindingId, previous + 1);
      const result = await options.toolGateway.call(
        {
          invocationRef: request.invocationRef,
          authorizedContextRef: request.authorizedContextRef,
          bindingRef: definition.bindingRef,
          toolName: definition.toolName,
          callKey: `${request.invocationRef.id}:${definition.bindingRef.id}:${previous + 1}`,
          arguments: params,
        },
        { signal: signal ?? state.controller.signal },
      );
      if (result.status === 'Failed') {
        throw new Error('Authorized tool execution failed');
      }
      if (!result.receiptRef) throw unsafeResume('Tool gateway did not return a receipt reference');
      if (result.receiptRef.type !== 'abh.artifact') throw unsafeResume('Tool receipt reference is invalid');
      state.toolReceiptRefs.push(result.receiptRef);
      return {
        content: result.content.map(item => ({ type: 'text' as const, text: item.text })),
        details: result,
      };
    },
  };
  return tool as unknown as AgentTool;
}

export function createPiAgentRuntimeAdapter(options: PiAgentRuntimeOptions): PiAgentRuntimeAdapter {
  if (options.piVersion !== SUPPORTED_PI_VERSION) {
    throw makeRuntimeError(`Pi version ${options.piVersion} is not supported; expected ${SUPPORTED_PI_VERSION}`);
  }
  const maxBufferedEvents = options.maxBufferedEvents ?? 256;
  if (maxBufferedEvents < 32 || maxBufferedEvents > 4096) {
    throw makeRuntimeError('pi.maxBufferedEvents must be between 32 and 4096');
  }
  const cleanupDeadlineMs = options.cleanupDeadlineMs ?? 5000;
  if (cleanupDeadlineMs < 1000 || cleanupDeadlineMs > 10000) {
    throw makeRuntimeError('pi.cleanupDeadlineMs must be between 1000 and 10000');
  }
  const definitions = new Map((options.tools ?? []).map(tool => [tool.toolName, tool]));

  async function storeCheckpoint(request: AgentInvocationRequest | AgentContinuationRequest,
    state:InvocationState,transcript:readonly AgentMessage[]):Promise<void>{
   if(!options.checkpointSink)return;
   const checkpoint:AgentCheckpoint={
    invocationRef:request.invocationRef,piVersion:SUPPORTED_PI_VERSION,definitionRef:request.task.definitionRef,
    contextDigest:request.task.contextDigest,lastEventSequence:state.sequence,usageTokens:state.usageTokens,turns:state.turns,
    transcript:[...transcript],toolReceiptRefs:[...state.toolReceiptRefs],unresolvedToolReceiptRefs:[],
    toolCallCounts:Object.fromEntries(state.toolCounts)};
   const checkpointRef=await options.checkpointSink.store({checkpoint},{signal:state.controller.signal});
   if(checkpointRef.type!=='abh.artifact')throw unsafeResume('Checkpoint sink returned an invalid reference');
   state.checkpointRef=checkpointRef;
  }

  function validateResumeCheckpoint(request:AgentContinuationRequest,checkpoint:AgentCheckpoint):void{
   if(checkpoint.piVersion!==SUPPORTED_PI_VERSION||checkpoint.invocationRef.id!==request.invocationRef.id
    ||checkpoint.definitionRef.id!==request.task.definitionRef.id||checkpoint.definitionRef.version!==request.task.definitionRef.version
    ||checkpoint.contextDigest!==request.task.contextDigest||!Number.isSafeInteger(checkpoint.lastEventSequence)
    ||checkpoint.lastEventSequence<1||checkpoint.usageTokens>request.task.maxTokens||checkpoint.turns>request.task.maxTurns
    ||checkpoint.transcript.length===0||checkpoint.unresolvedToolReceiptRefs.length>0)throw unsafeResume('Checkpoint is incompatible with this invocation');
   const last=checkpoint.transcript.at(-1);
   if(last?.role!=='user'&&last?.role!=='toolResult')throw unsafeResume('Checkpoint transcript cannot continue');
   const bindings=new Set(request.bindingRefs.map(ref=>ref.id));
   for(const [bindingId,count] of Object.entries(checkpoint.toolCallCounts)){
    if(!bindings.has(bindingId)||!Number.isSafeInteger(count)||count<0||count>request.task.maxTurns)throw unsafeResume('Checkpoint tool budget is invalid');
   }
  }

  function startInvocation(request: AgentInvocationRequest | AgentContinuationRequest, resume?: AgentCheckpoint): PiAgentInvocation {
      validateInvocationRequest(request, options.tools ?? []);

      const state: InvocationState = {
        controller: new AbortController(),
        queue: [],
        waiters: [],
        toolCounts: new Map(Object.entries(resume?.toolCallCounts ?? {})),
        maxBufferedEvents,
        sequence: resume?.lastEventSequence ?? 0,
        status: 'Created',
        usageTokens: resume?.usageTokens ?? 0,
        turns: resume?.turns ?? 0,
        closed: false,
        droppedCount: 0,
        stopEmitted: false,
        toolReceiptRefs: [...(resume?.toolReceiptRefs ?? [])],
        requestedToolCallIds: new Set(),
        ...((request as AgentContinuationRequest).checkpointRef
          ? { checkpointRef: (request as AgentContinuationRequest).checkpointRef as EntityRef & { readonly type: 'abh.artifact' } }
          : {}),
      };
      if (request.signal.aborted) stop(state, 'Cancelled', 'Cancelled');
      else request.signal.addEventListener('abort', () => stop(state, 'Cancelled', 'Cancelled'), { once: true });
      if (request.task.deadline) {
        const delay = Date.parse(request.task.deadline) - Date.now();
        if (Number.isFinite(delay)) {
          setTimeout(() => stop(state, 'Failed', 'Deadline'), Math.max(0, delay)).unref();
        }
      }

      const agent = new Agent({
        initialState: {
          systemPrompt: request.material.systemPrompt ?? '',
          model: request.material.model,
          tools: (options.tools ?? []).map(definition => makeTool(request, definition, state, options)),
          ...(resume ? { messages: [...resume.transcript] } : {}),
        },
        streamFn: async (model, context, streamOptions: SimpleStreamOptions = {}) => {
          state.status = 'Running';
          return options.modelGateway.call(
            {
              invocationRef: request.invocationRef,
              authorizedContextRef: request.authorizedContextRef,
              model,
              context,
              ...(request.task.maxTokens === undefined ? {} : { maxTokens: request.task.maxTokens }),
            },
            {
              signal: state.controller.signal,
            },
          ).then(stream => {
            void streamOptions;
            return stream;
          });
        },
        toolExecution: 'sequential',
        beforeToolCall: context => {
          const definition = definitions.get(context.toolCall.name);
          if (!definition) {
            return Promise.resolve({ block: true, terminate: true, reason: 'Tool is not bound to this invocation' });
          }
          emit(state, request.invocationRef, {
            kind: 'ToolRequested',
            payloadRef: definition.bindingRef,
          });
          state.requestedToolCallIds.add(context.toolCall.id);
          return Promise.resolve(undefined);
        },
        shouldStopAfterTurn: async context => {
          state.turns += 1;
          state.usageTokens += usageTokens(context.message.usage);
          emit(state, request.invocationRef, { kind: 'TurnCompleted' });
          try {
            if (context.context.messages.at(-1)?.role === 'toolResult') {
              await storeCheckpoint(request, state, context.context.messages);
            }
          } catch {
            if (!state.closed) state.stopReason = 'DependencyFailure';
            return true;
          }
          if (state.turns >= request.task.maxTurns) {
            state.stopReason = context.message.content.some(item => item.type === 'toolCall') ? 'NoProgress' : 'Completed';
            return true;
          }
          if (state.usageTokens >= request.task.maxTokens) {
            state.stopReason = 'BudgetExceeded';
            return true;
          }
          if (
            request.task.maxCostMicros !== undefined &&
            Math.ceil(context.message.usage.cost.total * 1_000_000) >= request.task.maxCostMicros
          ) {
            state.stopReason = 'BudgetExceeded';
            return true;
          }
          return false;
        },
      });

      agent.subscribe(async event => {
        if (event.type === 'agent_start') {
          emit(state, request.invocationRef, { kind: 'Started' });
        } else if (event.type === 'tool_execution_end') {
          if (!state.requestedToolCallIds.has(event.toolCallId)) {
            emit(state, request.invocationRef, { kind: 'ToolRequested' });
            state.requestedToolCallIds.add(event.toolCallId);
          }
          const definition=definitions.get(event.toolName),result=event.result as {receiptRef?:EntityRef};
          const receipt=result.receiptRef?.type==='abh.artifact'?result.receiptRef:undefined;
          emit(state, request.invocationRef, {
            kind: 'ToolObserved',
            ...(receipt ?? definition ? { payloadRef: receipt ?? definition!.bindingRef } : {}),
          });
        } else if (event.type === 'message_end' && event.message.role === 'assistant') {
          const output = event.message.content.find(item => item.type === 'text');
          if (output?.type === 'text') {
            if (!options.outputSink) {
              emit(state, request.invocationRef, { kind: 'OutputReady' });
            } else {
              try {
                const payloadRef = await options.outputSink.store({
                  invocationRef: request.invocationRef,
                  text: output.text,
                  usageTokens: usageTokens(event.message.usage),
                  stopReason: state.stopReason ?? 'Completed',
                }, { signal: state.controller.signal });
                emit(state, request.invocationRef, { kind: 'OutputReady', payloadRef });
              } catch {
                emit(state, request.invocationRef, { kind: 'Failed', stopReason: 'DependencyFailure' });
                stop(state, 'Failed', 'DependencyFailure');
                return;
              }
            }
          }
        } else if (event.type === 'agent_end') {
          const last = [...event.messages].reverse().find(message => message.role === 'assistant');
          const reason = state.stopReason ?? convertStopReason(last);
          emit(state, request.invocationRef, { kind: 'Stopped', stopReason: reason });
          stop(state, reason === 'Completed' ? 'Completed' : 'Failed', reason);
        }
      });

      const completionPromise = (async () => {
        try {
          if (state.status !== 'Cancelled') {
            await (resume ? agent.continue() : agent.prompt((request as AgentInvocationRequest).material.prompt));
          }
          if (!state.closed) {
            emit(state, request.invocationRef, { kind: 'Stopped', stopReason: 'Completed' });
            stop(state, 'Completed', 'Completed');
          } else if (state.status === 'Cancelled' && !state.stopEmitted) {
            emit(state, request.invocationRef, { kind: 'Stopped', stopReason: 'Cancelled' });
          }
        } catch {
          emit(state, request.invocationRef, { kind: 'Failed', stopReason: 'DependencyFailure' });
          stop(state, 'Failed', 'DependencyFailure');
        }
        return inspectInternal();
      })();

      function inspectInternal(): RuntimeSnapshot {
        return {
          invocationRef: request.invocationRef,
          lastEventSequence: state.sequence,
          runtimeStatus: state.status,
          ...(state.stopReason === undefined ? {} : { stopReason: state.stopReason }),
        };
      }

      async function* eventStream(): AsyncIterable<import('@abh/contracts').RuntimeEvent> {
        while (true) {
          const event = state.queue.shift();
          if (event) {
            yield event;
            continue;
          }
          if (state.closed) return;
          await new Promise<void>(resolve => state.waiters.push(resolve));
        }
      }

      return {
        inspect: inspectInternal,
        cancel: async (reason: string, stopEpoch: Date) => {
          if (Date.parse(stopEpoch.toISOString()) > Date.now()) {
            throw makeRuntimeError('Cancellation stopEpoch cannot be in the future');
          }
          stop(state, 'Cancelled', 'Cancelled');
          try {
            await Promise.race([
              agent.waitForIdle(),
              new Promise((_, reject) => setTimeout(
                () => reject(makeRuntimeError('Runtime cleanup exceeded deadline')),
                cleanupDeadlineMs,
              ).unref()),
            ]);
          } catch {
            state.controller.abort();
          }
          return { ...inspectInternal(), stopReason: state.stopReason ?? 'Cancelled', ...{ reason } as object };
        },
        completion: () => completionPromise,
        events: eventStream,
      };
  }

  return {
    piVersion: SUPPORTED_PI_VERSION,
    projectTelemetry: false,
    invoke: request => startInvocation(request),
    continue: async request => {
      validateInvocationRequest(request, options.tools ?? []);
      if (!options.checkpointGateway || !options.resumeAdmission) throw unsafeResume('Resume gateways are not configured');
      if (request.signal.aborted) throw unsafeResume('Continuation signal is already aborted');
      try {
        if (request.checkpointRef.type !== 'abh.artifact' || request.resumePermitRef.type !== 'abh.artifact') throw unsafeResume('Resume references are invalid');
        const loaded = await options.checkpointGateway.load({
          invocationRef: request.invocationRef,
          checkpointRef: request.checkpointRef,
          resumePermitRef: request.resumePermitRef,
          authorizedContextRef: request.authorizedContextRef,
          signal: request.signal,
        });
        await options.resumeAdmission.authorize({
          piVersion: SUPPORTED_PI_VERSION,
          invocationRef: request.invocationRef,
          checkpointRef: request.checkpointRef,
          resumePermitRef: request.resumePermitRef,
          checkpoint: loaded.checkpoint,
          task: request.task,
          authorizedContextRef: request.authorizedContextRef,
          contextManifestRef: request.contextManifestRef,
          signal: request.signal,
        });
        if (loaded.checkpointRef.id !== request.checkpointRef.id || loaded.checkpointRef.version !== request.checkpointRef.version) {
          throw unsafeResume('Loaded checkpoint does not match the requested reference');
        }
        validateResumeCheckpoint(request, loaded.checkpoint);
        return startInvocation(request, loaded.checkpoint);
      } catch (error) {
        const code=(error as {code?:string}).code;
        if(code==='INVOCATION_CONTRACT_INVALID'||code==='INVOCATION_RESUME_UNSAFE')throw error;
        throw unsafeResume();
      }
    },
  };
}
