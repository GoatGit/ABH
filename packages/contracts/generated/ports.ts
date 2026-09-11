/* Generated Port interfaces; no implementation or provider SDK. */
import type * as Types from './types.ts';
export interface PortCallOptions { readonly signal: AbortSignal; }
export type WithContent<T> = T extends { status: 'Completed'; data: infer D } ? Omit<T, 'data'> & { data: D & { content: AsyncIterable<Uint8Array> } } : T;
/** Preview contract only. Caller: Ingress; implementer: IdentityAdapter. */
export interface IdentityProviderPort {
  /** Read; cancellation stops waiting only. */
  verify(request: Types.IdentityVerifyRequest, options: PortCallOptions): Promise<Types.IdentityProviderVerifyResult>;
}

/** Preview contract only. Caller: OwnerOutboxPublisher; implementer: PgBossAdapter. */
export interface DurableExecutionPort {
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  enqueue(request: Types.EnqueueJobRequest, options: PortCallOptions): Promise<Types.DurableExecutionEnqueueResult>;
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  scheduleWakeup(request: Types.ScheduleWakeupRequest, options: PortCallOptions): Promise<Types.DurableExecutionScheduleWakeupResult>;
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  cancelWakeup(request: Types.CancelWakeupRequest, options: PortCallOptions): Promise<Types.DurableExecutionCancelWakeupResult>;
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  signal(request: Types.SignalWaitRequest, options: PortCallOptions): Promise<Types.DurableExecutionSignalResult>;
  /** Read; cancellation stops waiting only. */
  inspect(request: Types.InspectDeliveryRequest, options: PortCallOptions): Promise<Types.DurableExecutionInspectResult>;
  /** Read; cancellation stops waiting only. */
  drain(request: Types.DrainQueueRequest, options: PortCallOptions): Promise<Types.DurableExecutionDrainResult>;
}

/** Preview contract only. Caller: ArtifactOwner; implementer: ObjectStoreAdapter. */
export interface ObjectStorePort {
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  put(request: Types.PutObjectRequest, options: PortCallOptions, content: AsyncIterable<Uint8Array>): Promise<Types.ObjectStorePutResult>;
  /** Read; cancellation stops waiting only. */
  read(request: Types.ReadObjectRequest, options: PortCallOptions): Promise<WithContent<Types.ObjectStoreReadResult>>;
  /** Read; cancellation stops waiting only. */
  stat(request: Types.StatObjectRequest, options: PortCallOptions): Promise<Types.ObjectStoreStatResult>;
  /** DurableWrite; uncertain completion returns Tracked, never a retryable rejection. */
  delete(request: Types.DeleteObjectRequest, options: PortCallOptions): Promise<Types.ObjectStoreDeleteResult>;
}
