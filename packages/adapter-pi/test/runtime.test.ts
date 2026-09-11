import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type Usage,
} from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type { AgentTaskContract, RuntimeEvent } from '@abh/contracts';
import {
  createPiAgentRuntimeAdapter,
  SUPPORTED_PI_VERSION,
  type AgentCheckpoint,
  type GatewayToolDefinition,
  type ModelGatewayPort,
  type ToolGatewayPort,
} from '../src/index.ts';

const usage: Usage = {
  input: 3,
  output: 4,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 7,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function message(content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'test-provider',
    model: 'test-model',
    usage,
    stopReason,
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
  };
}

function stream(messageValue: AssistantMessage): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  stream.push({ type: 'start', partial: messageValue });
  if (messageValue.content[0]?.type === 'text') {
    stream.push({ type: 'text_start', contentIndex: 0, partial: messageValue });
    stream.push({ type: 'text_end', contentIndex: 0, content: messageValue.content[0].text, partial: messageValue });
  }
  stream.push({
    type: messageValue.stopReason === 'error' ? 'error' : 'done',
    ...(messageValue.stopReason === 'error'
      ? { reason: 'error', error: messageValue }
      : { reason: 'stop', message: messageValue }),
  } as never);
  stream.end(messageValue);
  return stream;
}

function createCountingModelGateway(): ModelGatewayPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    call(request) {
      if (!request.authorizedContextRef || !request.invocationRef) throw new Error('gateway context missing');
      calls.push(request.context);
      const isToolTurn = (request.context.tools?.length ?? 0) > 0 &&
        !request.context.messages.some(item => item.role === 'toolResult');
      if (isToolTurn) {
        return Promise.resolve(stream(message([{
          type: 'toolCall',
          id: 'call-1',
          name: 'lookup',
          arguments: { query: 'status' },
        }], 'toolUse')));
      }
      return Promise.resolve(stream(message([{ type: 'text', text: 'done' }], 'stop')));
    },
  };
}

const modelGateway = createCountingModelGateway();

const toolGateway: ToolGatewayPort = {
  call(request) {
    if (request.toolName !== 'lookup') throw new Error('tool bypass');
    return Promise.resolve({
      status: 'Completed',
      content: [{ type: 'text', text: JSON.stringify(request.arguments) }],
    });
  },
};

function contract(maxTurns = 2, withTool = true): AgentTaskContract {
  const base: AgentTaskContract = {
    goalArtifactRef: { type: 'abh.artifact', id: '01890a5d-ac96-774b-bcce-b302099a8057', version: 1 },
    inputRefs: [],
    definitionRef: { type: 'abh.workflow-definition', id: '01890a5d-ac96-774b-bcce-b302099a8058', version: 1 },
    outputSchemaRef: { type: 'abh.schema', id: '01890a5d-ac96-774b-bcce-b302099a8059', version: 1 },
    modelRouteRef: { type: 'abh.model-route', id: '01890a5d-ac96-774b-bcce-b302099a8060', version: 1 },
    toolBindingRefs: [],
    maxTurns,
    maxTokens: 100,
    contextDigest: `sha256:${'a'.repeat(64)}`,
  };
  if (withTool) {
    base.toolBindingRefs.push(bindingRef);
  }
  return base;
}

const invocationRef = { type: 'abh.invocation' as const, id: '01890a5d-ac96-774b-bcce-b302099a8062', version: 1 };
const contextRef = { type: 'abh.context' as const, id: '01890a5d-ac96-774b-bcce-b302099a8063', version: 1 };
const bindingRef = { type: 'abh.tool-binding' as const, id: '01890a5d-ac96-774b-bcce-b302099a8061', version: 1 };

const tool: GatewayToolDefinition = {
  bindingRef,
  toolName: 'lookup',
  description: 'Look up authorized data',
  parameters: Type.Object({ query: Type.String() }),
  execute: async arguments_ => ({ observed: arguments_ }),
};

async function collect(iterator: AsyncIterable<RuntimeEvent>, maximum = 32): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of iterator) {
    events.push(event);
    if (events.length === maximum) break;
  }
  return events;
}

test('adapter rejects unsupported Pi versions', () => {
  assert.throws(
    () => createPiAgentRuntimeAdapter({
      piVersion: '0.86.0',
      modelGateway,
      toolGateway,
    }),
    /expected 0.85.1/,
  );
});

test('adapter enforces bounded buffering configuration', () => {
  assert.throws(
    () => createPiAgentRuntimeAdapter({
      piVersion: SUPPORTED_PI_VERSION,
      maxBufferedEvents: 31,
      modelGateway,
      toolGateway,
    }),
    /maxBufferedEvents/,
  );
});

test('adapter runs the real Pi loop through injected gateways', async () => {
  const modelGateway = createCountingModelGateway();
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION,
    modelGateway,
    toolGateway,
    tools: [tool],
  });
  const invocation = adapter.invoke({
    invocationRef,
    task: contract(2),
    authorizedContextRef: contextRef,
    contextManifestRef: contextRef,
    bindingRefs: [bindingRef],
    material: {
      model: {} as Model<any>,
      prompt: 'Use lookup then answer.',
      systemPrompt: 'Return a short answer.',
    },
    signal: new AbortController().signal,
  });

  const events = await collect(invocation.events());
  assert.equal(events.at(0)?.kind, 'Started');
  assert.equal(events.at(-1)?.kind, 'Stopped');
  assert.equal(events.at(-1)?.stopReason, 'Completed');
  assert.ok(events.some(event => event.kind === 'ToolRequested'));
  assert.ok(events.some(event => event.kind === 'ToolObserved'));
  assert.ok(events.some(event => event.kind === 'OutputReady'));
  assert.equal(modelGateway.calls.length, 2);

  const completion = await invocation.completion();
  assert.equal(completion.runtimeStatus, 'Completed');
  assert.equal(completion.lastEventSequence, events.at(-1)?.sequence);
  assert.equal(invocation.inspect().runtimeStatus, 'Completed');
});

test('adapter reports dependency failure when the model gateway returns an error stream', async () => {
  const failingGateway: ModelGatewayPort = {
    call: () => Promise.resolve(stream(message([{ type: 'text', text: 'failure' }], 'error'))),
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION,
    modelGateway: failingGateway,
    toolGateway,
  });
  const invocation = adapter.invoke({
    invocationRef,
    task: contract(1, false),
    authorizedContextRef: contextRef,
    contextManifestRef: contextRef,
    bindingRefs: [],
    material: { model: {} as Model<any>, prompt: 'fail' },
    signal: new AbortController().signal,
  });
  const events = await collect(invocation.events());
  const final = await invocation.completion();
  assert.equal(final.runtimeStatus, 'Failed');
  assert.equal(events.at(-1)?.kind, 'Stopped');
  assert.equal(events.at(-1)?.stopReason, 'DependencyFailure');
});

test('adapter stores the first structured output before publishing OutputReady', async () => {
  const stored: unknown[] = [];
  const outputSink = {
    store: async output => {
      stored.push(output);
      return { type: 'abh.artifact', id: '01890a5d-ac96-774b-bcce-b302099a8064', version: 1 };
    },
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION,
    modelGateway: createCountingModelGateway(),
    toolGateway,
    outputSink,
  });
  const invocation = adapter.invoke({
    invocationRef,
    task: contract(1, false),
    authorizedContextRef: contextRef,
    contextManifestRef: contextRef,
    bindingRefs: [],
    material: { model: {} as Model<any>, prompt: 'answer' },
    signal: new AbortController().signal,
  });
  const events = await collect(invocation.events());
  await invocation.completion();
  const ready = events.find(event => event.kind === 'OutputReady');
  assert.equal(ready?.payloadRef?.type, 'abh.artifact');
  assert.equal(stored.length, 1);
});

test('external cancellation stops before starting the Pi prompt', async () => {
  const controller = new AbortController();
  let promptStarted = false;
  const gateway: ModelGatewayPort = {
    call: () => {
      promptStarted = true;
      return Promise.resolve(stream(message([{ type: 'text', text: 'late' }], 'stop')));
    },
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION,
    modelGateway: gateway,
    toolGateway,
    cleanupDeadlineMs: 1000,
  });
  controller.abort();
  const invocation = adapter.invoke({
    invocationRef,
    task: contract(1, false),
    authorizedContextRef: contextRef,
    contextManifestRef: contextRef,
    bindingRefs: [],
    material: { model: {} as Model<any>, prompt: 'cancel' },
    signal: controller.signal,
  });
  const events = await collect(invocation.events());
  const completion = await invocation.completion();
  assert.equal(promptStarted, false);
  assert.equal(events.at(-1)?.stopReason, 'Cancelled');
  assert.equal(completion.runtimeStatus, 'Cancelled');
});

test('continue resumes the governed transcript without replaying observed tools', async () => {
  const modelGateway = createCountingModelGateway();
  let toolCalls = 0;
  const countedToolGateway: ToolGatewayPort = {
    async call(request) {
      toolCalls += 1;
      const result = await toolGateway.call(request, { signal: new AbortController().signal });
      return {...result, receiptRef: { type: 'abh.artifact' as const, id: '01890a5d-ac96-774b-bcce-b302099a9088', version: 1 }};
    },
  };
  const checkpoints: AgentCheckpoint[] = [];
  let checkpointSequence = 0;
  const checkpointSink = {
    store: async ({ checkpoint }) => {
      checkpoints.push(checkpoint);
      checkpointSequence += 1;
      return { type: 'abh.artifact' as const, id: `01890a5d-ac96-774b-bcce-b302099a90${checkpointSequence.toString().padStart(2, '0')}`, version: 1 };
    },
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION,
    modelGateway,
    toolGateway: countedToolGateway,
    tools: [tool],
    checkpointSink,
    checkpointGateway: {
      load: async request => {
        const checkpoint = checkpoints.at(-1)!;
        assert.equal(request.resumePermitRef.type, 'abh.artifact');
        return { checkpointRef: request.checkpointRef as { type: 'abh.artifact'; id: string; version: number }, checkpoint };
      },
    },
    resumeAdmission: {
      authorize: async request => {
        assert.equal(request.piVersion, SUPPORTED_PI_VERSION);
        assert.equal(request.checkpoint.definitionRef.id, request.task.definitionRef.id);
        assert.equal(request.checkpoint.contextDigest, request.task.contextDigest);
        assert.deepEqual(request.checkpoint.unresolvedToolReceiptRefs, []);
        assert.deepEqual(request.checkpoint.toolReceiptRefs, [{ type: 'abh.artifact', id: '01890a5d-ac96-774b-bcce-b302099a9088', version: 1 }]);
      },
    },
  });
  const first = adapter.invoke({
    invocationRef, task: contract(2), authorizedContextRef: contextRef, contextManifestRef: contextRef,
    bindingRefs: [bindingRef], material: { model: {} as Model<any>, prompt: 'Use lookup then answer.' },
    signal: new AbortController().signal,
  });
  await collect(first.events());
  await first.completion();
  assert.equal(toolCalls, 1);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]!.transcript.at(-1)?.role, 'toolResult');
  assert.equal(checkpoints[0]!.turns, 1);

  const permit = { type: 'abh.artifact' as const, id: '01890a5d-ac96-774b-bcce-b302099a9099', version: 1 };
  const continuation = await adapter.continue({
    invocationRef, task: contract(2), authorizedContextRef: contextRef, contextManifestRef: contextRef,
    bindingRefs: [bindingRef], checkpointRef: { type: 'abh.artifact', id: checkpoints[0] ? '01890a5d-ac96-774b-bcce-b302099a9001' : randomUUID(), version: 1 },
    resumePermitRef: permit, material: { model: {} as Model<any> },
    signal: new AbortController().signal,
  });
  const events = await collect(continuation.events());
  await continuation.completion();
  assert.equal(toolCalls, 1);
  assert.equal(modelGateway.calls.length, 3);
  assert.equal(events.at(0)?.kind, 'Started');
  assert.equal(events.some(event => event.kind === 'ToolObserved'), false);
  assert.equal(events.at(-1)?.stopReason, 'Completed');
});

test('adapter blocks unbound tools before any gateway execution', async () => {
  const actualToolGateway = createCountingModelGateway();
  let toolExecutions = 0;
  const evilModelGateway: ModelGatewayPort & { calls: unknown[] } = {
    calls: [],
    call(request) {
      actualToolGateway.calls.push(request.context);
      if (request.context.messages.some(item => item.role === 'toolResult')) {
        return Promise.resolve(stream(message([{ type: 'text', text: 'done' }], 'stop')));
      }
      return Promise.resolve(stream(message([{
        type: 'toolCall', id: 'evil-call', name: 'unbound.tool', arguments: {},
      }], 'toolUse')));
    },
  };
  const countingToolGateway: ToolGatewayPort = {
    call: async () => {
      toolExecutions += 1;
      return { status: 'Completed', content: [] };
    },
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION, modelGateway: evilModelGateway, toolGateway: countingToolGateway,
  });
  const invocation = adapter.invoke({
    invocationRef, task: contract(2, false), authorizedContextRef: contextRef, contextManifestRef: contextRef,
    bindingRefs: [], material: { model: {} as Model<any>, prompt: 'try evil tool' },
    signal: new AbortController().signal,
  });
  const events = await collect(invocation.events());
  await invocation.completion();
  assert.equal(toolExecutions, 0);
  assert.equal(events.some(event => event.kind === 'ToolRequested'), true);
});

test('adapter reports NoProgress instead of falsely completing an unresolved tool request', async () => {
  const modelGateway: ModelGatewayPort = {
    call: () => Promise.resolve(stream(message([{
      type: 'toolCall', id: 'repeat-call', name: 'lookup', arguments: { query: 'again' },
    }], 'toolUse'))),
  };
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION, modelGateway, toolGateway,
  });
  const invocation = adapter.invoke({
    invocationRef, task: contract(1), authorizedContextRef: contextRef, contextManifestRef: contextRef,
    bindingRefs: [bindingRef], material: { model: {} as Model<any>, prompt: 'loop' },
    signal: new AbortController().signal,
  });
  const events = await collect(invocation.events());
  const completion = await invocation.completion();
  assert.equal(events.at(-1)?.stopReason, 'NoProgress');
  assert.equal(completion.runtimeStatus, 'Failed');
});

test('continue fails closed for missing resume governance, invalid checkpoints, and rejected permits', async t => {
  const untouchedModelGateway = createCountingModelGateway();
  const adapter = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION, modelGateway: untouchedModelGateway, toolGateway,
  });
  const request = () => ({
    invocationRef, task: contract(1), authorizedContextRef: contextRef, contextManifestRef: contextRef,
    bindingRefs: [bindingRef], checkpointRef: { type: 'abh.artifact' as const, id: randomUUID(), version: 1 },
    resumePermitRef: { type: 'abh.artifact' as const, id: randomUUID(), version: 1 },
    material: { model: {} as Model<any> }, signal: new AbortController().signal,
  });
  await assert.rejects(adapter.continue(request()), { code: 'INVOCATION_RESUME_UNSAFE' });

  const unsafe = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION, modelGateway: untouchedModelGateway, toolGateway,
    checkpointGateway: { load: async () => Promise.reject(new Error('private checkpoint failure')) },
    resumeAdmission: { authorize: async () => {} },
  });
  await assert.rejects(unsafe.continue(request()), error => {
    assert.equal((error as {code?:string}).code, 'INVOCATION_RESUME_UNSAFE');
    assert.doesNotMatch(String((error as Error).message), /private/);
    return true;
  });

  const checkpoint: AgentCheckpoint = {
    invocationRef, piVersion: SUPPORTED_PI_VERSION,
    definitionRef: contract().definitionRef, contextDigest: contract().contextDigest,
    lastEventSequence: 3, usageTokens: 7, turns: 1,
    transcript: [{ role: 'assistant', content: [{ type: 'text', text: 'waiting' }], api: 'openai-completions',
      provider: 'test', model: 'test', usage, stopReason: 'stop', timestamp: 0 } as never],
    toolReceiptRefs: [], unresolvedToolReceiptRefs: [], toolCallCounts: {},
  };
  const rejected = createPiAgentRuntimeAdapter({
    piVersion: SUPPORTED_PI_VERSION, modelGateway: untouchedModelGateway, toolGateway,
    checkpointGateway: { load: async request => ({ checkpointRef: request.checkpointRef as { type: 'abh.artifact'; id: string; version: number }, checkpoint }) },
    resumeAdmission: { authorize: async () => { throw new Error('permit rejected'); } },
  });
  await assert.rejects(rejected.continue(request()), { code: 'INVOCATION_RESUME_UNSAFE' });
  assert.equal(untouchedModelGateway.calls.length, 0);
});
