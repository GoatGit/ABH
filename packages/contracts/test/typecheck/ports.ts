import type { DurableExecutionPort, IdentityProviderPort, ObjectStorePort, PortRequest } from '../../src/ports.ts';
import type { DurableExecutionEnqueueResult, ObjectStoreReadResult } from '../../src/index.ts';

declare const durable: DurableExecutionPort;
declare const identity: IdentityProviderPort;
declare const store: ObjectStorePort;
declare const enqueue: PortRequest<'DurableExecutionPort.enqueue'>;
declare const verification: PortRequest<'IdentityProviderPort.verify'>;
declare const read: PortRequest<'ObjectStorePort.read'>;
const signal = new AbortController().signal;
void durable.enqueue(enqueue, { signal });
void identity.verify(verification, { signal });
// @ts-expect-error Port callers must supply a cancellation signal.
void durable.enqueue(enqueue);
// @ts-expect-error Missing deadline is not a valid Port call context.
const missingDeadline: typeof enqueue.context = { callId: enqueue.context.callId, target: enqueue.context.target, requestContextRef: enqueue.context.requestContextRef };
// @ts-expect-error Uncertain enqueue outcomes cannot omit their durable reference.
const untracked: DurableExecutionEnqueueResult = { status: 'Tracked' };
// @ts-expect-error Cancelled is restricted to proven absence of effect.
const falseCancellation: DurableExecutionEnqueueResult = { status: 'Cancelled', effect: 'Unknown' };
// @ts-expect-error Pre-authentication verification cannot receive a client-created RequestContext.
void identity.verify({ ...verification, context: enqueue.context }, { signal });
const stream = async () => {
  const result = await store.read(read, { signal });
  if (result.status === 'Completed') {
    for await (const chunk of result.data.content) { const bytes: Uint8Array = chunk; void bytes; }
    const { content, ...descriptor } = result.data;
    const wireResult: ObjectStoreReadResult = { status: 'Completed', data: descriptor };
    void wireResult; void content;
  }
};
void stream; void missingDeadline; void untracked; void falseCancellation;
