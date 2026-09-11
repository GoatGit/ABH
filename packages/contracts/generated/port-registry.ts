/* Generated method metadata, not Adapter implementations. */
export const portMethods = {
  "IdentityProviderPort.verify": {
    "request": "IdentityVerifyRequest",
    "response": "VerifiedIdentity",
    "effect": "Read",
    "context": "PreAuthentication",
    "errors": [
      "UNAUTHENTICATED"
    ],
    "result": "IdentityProviderVerifyResult",
    "owner": "Identity",
    "caller": "Ingress",
    "implementer": "IdentityAdapter"
  },
  "DurableExecutionPort.enqueue": {
    "request": "EnqueueJobRequest",
    "permission": "abh.runtime.enqueue",
    "targetTypes": [
      "abh.action",
      "abh.operation",
      "abh.decision",
      "abh.pack-inspection-job"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "EnqueuedJob",
    "effect": "DurableWrite",
    "context": "Request",
    "tracking": "JobRef",
    "errors": [
      "IDEMPOTENCY_CONFLICT"
    ],
    "result": "DurableExecutionEnqueueResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "DurableExecutionPort.scheduleWakeup": {
    "request": "ScheduleWakeupRequest",
    "permission": "abh.runtime.schedule-wakeup",
    "targetTypes": [
      "abh.action",
      "abh.operation",
      "abh.decision"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "ScheduledWakeup",
    "effect": "DurableWrite",
    "context": "Request",
    "tracking": "WaitRef",
    "errors": [
      "IDEMPOTENCY_CONFLICT"
    ],
    "result": "DurableExecutionScheduleWakeupResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "DurableExecutionPort.cancelWakeup": {
    "request": "CancelWakeupRequest",
    "permission": "abh.runtime.cancel-wakeup",
    "targetTypes": [
      "abh.durable-wait"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "CancelledWakeup",
    "effect": "DurableWrite",
    "context": "Request",
    "tracking": "WaitRef",
    "errors": [
      "VERSION_CONFLICT"
    ],
    "result": "DurableExecutionCancelWakeupResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "DurableExecutionPort.signal": {
    "request": "SignalWaitRequest",
    "permission": "abh.runtime.signal",
    "targetTypes": [
      "abh.action",
      "abh.operation",
      "abh.decision"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "SignalledWait",
    "effect": "DurableWrite",
    "context": "Request",
    "tracking": "WaitRef",
    "errors": [
      "IDEMPOTENCY_CONFLICT"
    ],
    "result": "DurableExecutionSignalResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "DurableExecutionPort.inspect": {
    "request": "InspectDeliveryRequest",
    "permission": "abh.runtime.inspect",
    "targetTypes": [
      "abh.job",
      "abh.durable-wait"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "DeliveryInspection",
    "effect": "Read",
    "context": "Request",
    "errors": [],
    "result": "DurableExecutionInspectResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "DurableExecutionPort.drain": {
    "request": "DrainQueueRequest",
    "permission": "abh.runtime.drain",
    "targetTypes": [
      "abh.organization"
    ],
    "purpose": "abh.runtime.deliver",
    "response": "DrainReport",
    "effect": "Read",
    "context": "Request",
    "errors": [],
    "result": "DurableExecutionDrainResult",
    "owner": "DurableExecution",
    "caller": "OwnerOutboxPublisher",
    "implementer": "PgBossAdapter"
  },
  "ObjectStorePort.put": {
    "request": "PutObjectRequest",
    "permission": "abh.artifacts.store",
    "targetTypes": [
      "abh.artifact"
    ],
    "purpose": "abh.artifact.manage",
    "response": "ObjectDescriptor",
    "effect": "DurableWrite",
    "context": "Authorized",
    "tracking": "ArtifactRef",
    "inputStream": true,
    "errors": [
      "IDEMPOTENCY_CONFLICT",
      "LIMIT_EXCEEDED",
      "PURPOSE_DENIED"
    ],
    "result": "ObjectStorePutResult",
    "owner": "ArtifactStore",
    "caller": "ArtifactOwner",
    "implementer": "ObjectStoreAdapter"
  },
  "ObjectStorePort.read": {
    "request": "ReadObjectRequest",
    "permission": "abh.artifacts.read",
    "targetTypes": [
      "abh.stored-object"
    ],
    "purpose": "abh.artifact.read",
    "response": "ReadObjectDescriptor",
    "effect": "Read",
    "context": "Authorized",
    "outputStream": true,
    "errors": [
      "PURPOSE_DENIED"
    ],
    "result": "ObjectStoreReadResult",
    "owner": "ArtifactStore",
    "caller": "ArtifactOwner",
    "implementer": "ObjectStoreAdapter"
  },
  "ObjectStorePort.stat": {
    "request": "StatObjectRequest",
    "permission": "abh.artifacts.stat",
    "targetTypes": [
      "abh.stored-object"
    ],
    "purpose": "abh.artifact.read",
    "response": "ObjectDescriptor",
    "effect": "Read",
    "context": "Authorized",
    "errors": [
      "PURPOSE_DENIED"
    ],
    "result": "ObjectStoreStatResult",
    "owner": "ArtifactStore",
    "caller": "ArtifactOwner",
    "implementer": "ObjectStoreAdapter"
  },
  "ObjectStorePort.delete": {
    "request": "DeleteObjectRequest",
    "permission": "abh.artifacts.delete",
    "targetTypes": [
      "abh.stored-object"
    ],
    "purpose": "abh.artifact.manage",
    "response": "DeletedObject",
    "effect": "DurableWrite",
    "context": "Authorized",
    "tracking": "StoredObjectRef",
    "errors": [
      "IDEMPOTENCY_CONFLICT",
      "PURPOSE_DENIED"
    ],
    "result": "ObjectStoreDeleteResult",
    "owner": "ArtifactStore",
    "caller": "ArtifactOwner",
    "implementer": "ObjectStoreAdapter"
  }
} as const;
export const portCommonErrors = ["INVALID_ARGUMENT","SCHEMA_UNSUPPORTED","FORBIDDEN","CONTEXT_EXPIRED","RESOURCE_NOT_FOUND","DEPENDENCY_UNAVAILABLE","DEPENDENCY_TIMEOUT","INTERNAL_ERROR"] as const;
