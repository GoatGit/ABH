/* Generated HTTP contracts. No server implementation or authorization. */
export const protocolRegistry = {
  "version": "0.1.0",
  "owner": "ContractMaintainer",
  "status": "ContractOnly",
  "source": "docs/V1/10-ABH详细设计/01-公共契约与错误模型.md",
  "commonErrors": [
    "INVALID_ARGUMENT",
    "SCHEMA_UNSUPPORTED",
    "UNAUTHENTICATED",
    "CONTEXT_EXPIRED",
    "FORBIDDEN",
    "RESOURCE_NOT_FOUND",
    "INTERNAL_ERROR"
  ],
  "commands": [
    {
      "type": "abh.missions.create",
      "name": "CreateMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "CreateMissionPayload",
      "permission": "abh.missions.create",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "MISSION_DEFINITION_INVALID",
        "AUTHORITY_REQUIRED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.activate",
      "name": "ActivateMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "ActivateMissionPayload",
      "permission": "abh.missions.activate",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "MISSION_AUTHORITY_MISSING",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.submit-trigger",
      "name": "SubmitTrigger",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.mission",
      "payload": "SubmitTriggerPayload",
      "permission": "abh.missions.submit-trigger",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionTriggerRecord",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.pause",
      "name": "PauseMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "PauseMissionPayload",
      "permission": "abh.missions.pause",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.cancel",
      "name": "CancelMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "CancelMissionPayload",
      "permission": "abh.missions.cancel",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.resume",
      "name": "ResumeMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "ResumeMissionPayload",
      "permission": "abh.missions.resume",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "MISSION_BLOCKED",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.revise-goal",
      "name": "ReviseMissionGoal",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "ReviseMissionGoalPayload",
      "permission": "abh.missions.revise-goal",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "MISSION_DEFINITION_INVALID",
        "GOAL_AUTHORITY_INSUFFICIENT",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.close",
      "name": "CloseMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "CloseMissionPayload",
      "permission": "abh.missions.close",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "MISSION_EFFECT_PENDING",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.block",
      "name": "BlockMission",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "BlockMissionPayload",
      "permission": "abh.missions.block",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "BLOCKER_EVIDENCE_INVALID",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.missions.resolve-blocker",
      "name": "ResolveBlocker",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "ResolveBlockerPayload",
      "permission": "abh.missions.resolve-blocker",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "MissionRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "BLOCKER_EVIDENCE_INVALID",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.fail",
      "name": "FailPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "FailPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.fail-lost-lease",
      "name": "FailLostPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "FailLostPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.accept-delivery",
      "name": "AcceptPackInspectionDelivery",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.pack-inspection-job",
      "payload": "AcceptPackInspectionDeliveryPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.cancel",
      "name": "CancelPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "CancelPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.wait",
      "name": "WaitPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "WaitPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.complete",
      "name": "CompletePackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "CompletePackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.expire",
      "name": "ExpirePackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "ExpirePackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.pack-inspection-jobs.start",
      "name": "StartPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.pack-inspection-job",
      "payload": "StartPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.request-inspection",
      "name": "RequestPackInspection",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RequestPackInspectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.record-data-impact",
      "name": "RecordPackDataImpact",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RecordPackDataImpactPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.register-capabilities",
      "name": "RegisterPackCapabilities",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RegisterPackCapabilitiesPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.operations.record-compatible-query-evidence",
      "name": "RecordCompatibleQueryEvidence",
      "owner": "ReconciliationService",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RecordCompatibleQueryEvidencePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PIN_INPUT_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.retire",
      "name": "RetirePack",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RetirePackPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.suspend",
      "name": "SuspendPack",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "SuspendPackPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.enable",
      "name": "EnablePack",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "EnablePackPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.request-enable",
      "name": "RequestPackEnable",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RequestPackEnablePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "DECISION_PACKAGE_INCOMPLETE"
      ]
    },
    {
      "type": "abh.packs.record-conformance",
      "name": "RecordPackConformance",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RecordPackConformancePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.stage",
      "name": "StagePack",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "StagePackPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.publish-trust-policy",
      "name": "PublishPackTrustPolicy",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "PublishPackTrustPolicyPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.packs.record-validation",
      "name": "RecordPackValidation",
      "owner": "PackLoader",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "RecordPackValidationPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.responsibility-requests.revise-route",
      "name": "ReviseResponsibilityRoute",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.responsibility-request",
      "payload": "ReviseResponsibilityRoutePayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "DECISION_STALE",
        "DECISION_PACKAGE_INCOMPLETE",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.responsibilities.revoke",
      "name": "RevokeResponsibility",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.responsibility-assignment",
      "payload": "RevokeResponsibilityPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "LAST_REQUIRED_RESPONSIBILITY"
      ]
    },
    {
      "type": "abh.responsibility-requests.expire",
      "name": "ExpireResponsibilityRequest",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.responsibility-request",
      "payload": "RequestRef",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.responsibility-requests.retry-route",
      "name": "RetryResponsibilityRoute",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.responsibility-request",
      "payload": "OpenResponsibilityRequestPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "DECISION_STALE",
        "DECISION_PACKAGE_INCOMPLETE",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.exceptions.open-terminal",
      "name": "OpenTerminalException",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.reconciliation",
      "payload": "OpenTerminalExceptionPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "PRECONDITION_FAILED",
        "VERSION_CONFLICT",
        "IDEMPOTENCY_CONFLICT"
      ]
    },
    {
      "type": "abh.execution-authority.create",
      "name": "CreateScopeAuthority",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.execution-authority",
      "payload": "CreateScopeAuthorityPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "POLICY_DENIED",
        "EXECUTION_AUTHORITY_SCOPE_EXCEEDED",
        "IDEMPOTENCY_CONFLICT"
      ]
    },
    {
      "type": "abh.execution-authority.evaluate-scope",
      "name": "EvaluateScopeAuthority",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.principal",
      "payload": "ScopeAuthorityDraft",
      "errors": [
        "AUTHORITY_REQUIRED",
        "POLICY_DENIED",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.operations.capture-query",
      "name": "CaptureQuery",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "CaptureQueryPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "OPERATION_FACT_CONFLICT",
        "RAW_RECEIPT_UNSUPPORTED"
      ]
    },
    {
      "type": "abh.operations.claim-query-exit",
      "name": "ClaimQueryExit",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "ClaimQueryExitPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "RESOURCE_EXHAUSTED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.operations.notify-wait",
      "name": "NotifyOperationWait",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation-wait",
      "payload": "NotifyOperationWaitPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.runtime.execute-wait-port",
      "name": "ExecuteWaitPort",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.durable-wait",
      "payload": "ExecuteWaitPortPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.actions.notify-wait",
      "name": "NotifyActionWait",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action-wait",
      "payload": "NotifyActionWaitPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.runtime.register-wait",
      "name": "RegisterDurableWait",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.durable-wait",
      "payload": "RegisterDurableWaitPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.runtime.recheck-wait",
      "name": "RecheckDurableWait",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.durable-wait",
      "payload": "RecheckDurableWaitPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.runtime.cancel-wait",
      "name": "CancelDurableWait",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.durable-wait",
      "payload": "CancelDurableWaitPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.runtime.prepare-outbox",
      "name": "PrepareOutbox",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.event",
      "payload": "PrepareOutboxPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.runtime.record-outbox-consumption",
      "name": "RecordOutboxConsumption",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.outbox-routing",
      "payload": "RecordOutboxConsumptionPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.runtime.record-outbox-delivery",
      "name": "RecordOutboxDelivery",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.outbox-routing",
      "payload": "RecordOutboxDeliveryPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.runtime.consume-event",
      "name": "ConsumeEvent",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.event",
      "payload": "ConsumeEventPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.projections.build-mission-summary",
      "name": "BuildMissionSummary",
      "owner": "MissionController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.mission",
      "payload": "BuildMissionSummaryPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.projections.refresh-mission-summary",
      "name": "RefreshMissionSummary",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.mission",
      "payload": "RefreshMissionSummaryPayload",
      "permission": "abh.projections.request-mission-summary",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "ProjectionRefreshReceipt",
      "status": 202,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED",
        "SCHEMA_UNSUPPORTED"
      ]
    },
    {
      "type": "abh.actions.refresh-authorization",
      "name": "RefreshActionAuthorization",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "RefreshActionPayload",
      "errors": [
        "AUTHORIZATION_REFRESH_DENIED",
        "VERSION_CONFLICT",
        "POLICY_DENIED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.actions.cleanup",
      "name": "CleanupAction",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "CleanupActionPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.actions.aggregate",
      "name": "AggregateAction",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "AggregateActionPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "ACTION_CHILD_VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.operations.recover",
      "name": "RecoverOperation",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "RecoverOperationPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.operations.apply-reconciliation",
      "name": "ApplyReconciliation",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "ApplyReconciliationPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "OPERATION_FACT_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.operations.reconcile",
      "name": "CompareOperation",
      "owner": "ReconciliationService",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "CompareOperationPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "OPERATION_FACT_CONFLICT"
      ]
    },
    {
      "type": "abh.operations.capture-transport",
      "name": "CaptureTransport",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "CaptureTransportPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "OPERATION_FACT_CONFLICT",
        "RAW_RECEIPT_UNSUPPORTED",
        "LIMIT_EXCEEDED"
      ]
    },
    {
      "type": "abh.operations.record-receipt",
      "name": "RecordOperationReceipt",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "RecordOperationReceiptPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "OPERATION_FACT_CONFLICT",
        "RAW_RECEIPT_UNSUPPORTED"
      ]
    },
    {
      "type": "abh.operations.claim-exit",
      "name": "ClaimDispatchExit",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.dispatch-permit",
      "payload": "ClaimDispatchExitPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.operations.issue-permit",
      "name": "IssueDispatchPermit",
      "owner": "OperationController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.operation",
      "payload": "IssueDispatchPermitPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "POLICY_DENIED",
        "EPOCH_REVOKED"
      ]
    },
    {
      "type": "abh.actions.propose",
      "name": "ProposeAction",
      "owner": "ActionEngine",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "ProposeActionPayload",
      "response": "ActionAcceptedResponse",
      "status": 202,
      "permission": "abh.actions.propose",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "ACTION_DOMAIN_INVALID",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.actions.cancel",
      "name": "CancelAction",
      "owner": "ActionEngine",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "CancelActionPayload",
      "response": "ActionAcceptedResponse",
      "status": 202,
      "permission": "abh.actions.cancel",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.actions.request-authorization",
      "name": "RequestAuthorization",
      "owner": "ActionEngine",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "RequestAuthorizationPayload",
      "response": "ActionAcceptedResponse",
      "status": 202,
      "permission": "abh.actions.request-authorization",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "EXECUTION_AUTHORITY_AMBIGUOUS",
        "ACTION_PLAN_SCOPE_EXCEEDED"
      ]
    },
    {
      "type": "abh.decisions.submit",
      "name": "SubmitDecision",
      "owner": "HumanGateway",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.decision",
      "payload": "SubmitDecisionPayload",
      "response": "DecisionSubmittedResponse",
      "status": 200,
      "permission": "abh.decisions.submit",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "DECISION_STALE",
        "DECIDER_NOT_ELIGIBLE"
      ]
    },
    {
      "type": "abh.decisions.withdraw",
      "name": "WithdrawDecision",
      "owner": "HumanGateway",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.decision",
      "payload": "WithdrawDecisionPayload",
      "response": "DecisionWithdrawnResponse",
      "status": 200,
      "permission": "abh.decisions.withdraw",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "DECISION_STALE"
      ]
    },
    {
      "type": "abh.actions.validate",
      "name": "ValidateAction",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "ValidateActionPayload",
      "errors": [
        "ACTION_DOMAIN_INVALID",
        "VERSION_CONFLICT"
      ]
    },
    {
      "type": "abh.actions.register-plan",
      "name": "RegisterOperationPlan",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "RegisterOperationPlanPayload",
      "errors": [
        "ACTION_PLAN_SCOPE_EXCEEDED",
        "VERSION_CONFLICT",
        "PIN_INPUT_CONFLICT"
      ]
    },
    {
      "type": "abh.ledgers.configure",
      "name": "ConfigureLedger",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.ledger",
      "payload": "ConfigureLedgerPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "INVALID_ARGUMENT"
      ]
    },
    {
      "type": "abh.reservations.reserve",
      "name": "ReserveAll",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.reservation",
      "payload": "ReserveAllPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.reservations.consume",
      "name": "ConsumeReservation",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.reservation",
      "payload": "ConsumeReservationPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.reservations.release",
      "name": "ReleaseReservation",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.reservation",
      "payload": "ReleaseReservationPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.grants.revoke",
      "name": "RevokeGrant",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.grant",
      "payload": "RevokeGrantPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.releases.configure-static",
      "name": "ConfigureStaticRelease",
      "owner": "CapabilityRelease",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.release",
      "payload": "ConfigureStaticReleasePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PIN_INPUT_CONFLICT"
      ]
    },
    {
      "type": "abh.releases.resolve-pins",
      "name": "ResolveStaticPins",
      "owner": "CapabilityRelease",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.pin-set",
      "payload": "ResolveStaticPinsPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PIN_INPUT_CONFLICT"
      ]
    },
    {
      "type": "abh.assignments.pause",
      "name": "StopStaticAssignment",
      "owner": "CapabilityRelease",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.assignment",
      "payload": "StopStaticAssignmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PIN_INPUT_CONFLICT"
      ]
    },
    {
      "type": "abh.artifacts.store-inline",
      "name": "StoreInlineArtifact",
      "owner": "ArtifactStore",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "StoreInlineArtifactPayload",
      "response": "InlineArtifactStoredResponse",
      "permission": "abh.artifacts.store-inline",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "FORBIDDEN",
        "RESOURCE_NOT_FOUND"
      ]
    },
    {
      "type": "abh.artifacts.tombstone",
      "name": "TombstoneArtifact",
      "owner": "ArtifactStore",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.artifact",
      "payload": "TombstoneArtifactPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "FORBIDDEN",
        "RESOURCE_NOT_FOUND"
      ]
    },
    {
      "type": "abh.commitments.open",
      "name": "OpenCommitment",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.commitment",
      "payload": "OpenCommitmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.commitments.settle",
      "name": "SettleCommitment",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.commitment",
      "payload": "SettleCommitmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.commitments.adjust",
      "name": "AdjustCommitment",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.commitment",
      "payload": "AdjustCommitmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.commitments.begin-close",
      "name": "BeginCloseCommitment",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.commitment",
      "payload": "BeginCloseCommitmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.commitments.close",
      "name": "CloseCommitment",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.commitment",
      "payload": "CloseCommitmentPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "RESOURCE_EXHAUSTED",
        "OBLIGATION_CONFLICT"
      ]
    },
    {
      "type": "abh.responsibilities.assign",
      "name": "AssignResponsibility",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.responsibility-assignment",
      "payload": "AssignResponsibilityPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.responsibility-requests.open",
      "name": "OpenResponsibilityRequest",
      "owner": "HumanGateway",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.responsibility-request",
      "payload": "OpenResponsibilityRequestPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "AUTHORITY_REQUIRED",
        "DECISION_PACKAGE_INCOMPLETE"
      ]
    },
    {
      "type": "abh.execution-authority.issue-effect",
      "name": "IssueExecutionAuthority",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.execution-authority",
      "payload": "IssueExecutionAuthorityPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "EXECUTION_AUTHORITY_SCOPE_EXCEEDED"
      ]
    },
    {
      "type": "abh.execution-authority.revoke",
      "name": "RevokeExecutionAuthority",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.execution-authority",
      "payload": "RevokeExecutionAuthorityPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.actions.pin",
      "name": "PinAction",
      "owner": "ActionEngine",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.action",
      "payload": "PinActionPayload",
      "errors": [
        "VERSION_CONFLICT",
        "PIN_INPUT_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.policies.configure",
      "name": "ConfigurePolicy",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.policy-version",
      "payload": "ConfigurePolicyPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "POLICY_DENIED",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.policies.activate-mandatory",
      "name": "ActivateMandatoryPolicy",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "ActivateMandatoryPolicyPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "POLICY_DENIED",
        "AUTHORITY_REQUIRED"
      ]
    },
    {
      "type": "abh.resource-envelopes.configure",
      "name": "ConfigureResourceEnvelope",
      "owner": "ResourceLedger",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.resource-envelope",
      "payload": "ConfigureResourceEnvelopePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "AUTHORITY_REQUIRED",
        "INVALID_ARGUMENT"
      ]
    },
    {
      "type": "abh.purposes.configure",
      "name": "ConfigurePurpose",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.purpose",
      "payload": "ConfigurePurposePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.connections.configure",
      "name": "ConfigureConnection",
      "owner": "Identity",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.connection",
      "payload": "ConfigureConnectionPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.purposes.revoke",
      "name": "RevokePurpose",
      "owner": "Control",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.purpose",
      "payload": "RevokeDirectoryRecordPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.connections.revoke",
      "name": "RevokeConnection",
      "owner": "Identity",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.connection",
      "payload": "RevokeDirectoryRecordPayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.work-leases.claim",
      "name": "ClaimWorkLease",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "ClaimWorkLeasePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.work-leases.renew",
      "name": "RenewWorkLease",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.work-lease",
      "payload": "RenewWorkLeasePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.work-leases.release",
      "name": "ReleaseWorkLease",
      "owner": "DurableExecution",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.work-lease",
      "payload": "ReleaseWorkLeasePayload",
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "AUTHORITY_REQUIRED",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.runs.start",
      "name": "StartRun",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.mission",
      "payload": "StartRunPayload",
      "permission": "abh.runs.start",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "RunRecord",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "RUN_ALREADY_ACTIVE",
        "PRECONDITION_FAILED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.runs.complete",
      "name": "CompleteRun",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.run",
      "payload": "CompleteRunPayload",
      "permission": "abh.runs.complete",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "RunRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.runs.cancel",
      "name": "CancelRun",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Update",
      "targetType": "abh.run",
      "payload": "CancelRunPayload",
      "permission": "abh.runs.cancel",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "RunRecord",
      "status": 200,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.runs.recover",
      "name": "RecoverRun",
      "owner": "MissionController",
      "visibility": "Internal",
      "mode": "Update",
      "targetType": "abh.run",
      "payload": "RecoverRunPayload",
      "errors": [
        "AUTHORITY_REQUIRED",
        "IDEMPOTENCY_CONFLICT",
        "VERSION_CONFLICT",
        "PRECONDITION_FAILED"
      ]
    },
    {
      "type": "abh.verification.submit",
      "name": "SubmitVerification",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.task",
      "payload": "SubmitVerificationPayload",
      "permission": "abh.verification.submit",
      "purposeNames": [
        "abh.mission.manage",
        "abh.verification.submit"
      ],
      "response": "VerificationReport",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.tools.invoke",
      "name": "InvokeTool",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.tool-binding",
      "payload": "InvokeToolPayload",
      "permission": "abh.tools.invoke",
      "purposeNames": [
        "abh.mission.manage"
      ],
      "response": "ToolCallResponse",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "PRECONDITION_FAILED",
        "PURPOSE_DENIED"
      ]
    },
    {
      "type": "abh.learning.capture-signal",
      "name": "CaptureSignal",
      "owner": "MissionController",
      "visibility": "Public",
      "mode": "Create",
      "targetType": "abh.organization",
      "payload": "CaptureSignalPayload",
      "permission": "abh.learning.capture",
      "purposeNames": [
        "abh.learning.capture"
      ],
      "response": "LearningSignalRecord",
      "status": 201,
      "errors": [
        "IDEMPOTENCY_CONFLICT",
        "LEARNING_PURPOSE_DENIED",
        "PURPOSE_DENIED"
      ]
    }
  ],
  "queries": [
    {
      "name": "QueryPackCapabilities",
      "type": "abh.capabilities.query",
      "owner": "PackLoader",
      "path": "/v1/queries/abh.capabilities.query",
      "response": "PackCapabilityQueryResult",
      "permission": "abh.capabilities.read",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.action.prepare",
        "abh.action.execute",
        "abh.operation.reconcile"
      ],
      "filters": [
        "kind",
        "capabilityId",
        "version",
        "versionRange",
        "limit"
      ],
      "requiredFilters": [
        "kind",
        "limit"
      ],
      "errors": []
    },
    {
      "name": "GetMission",
      "type": "abh.missions.get",
      "owner": "MissionController",
      "path": "/v1/queries/abh.missions.get",
      "response": "MissionView",
      "permission": "abh.missions.read",
      "targetTypes": [
        "abh.mission",
        "abh.decision"
      ],
      "purposeNames": [
        "abh.mission.manage",
        "abh.decision.review",
        "abh.runtime.deliver"
      ],
      "filters": [
        "id"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    },
    {
      "name": "ListMissions",
      "type": "abh.missions.list",
      "owner": "MissionController",
      "path": "/v1/queries/abh.missions.list",
      "response": "MissionListResult",
      "permission": "abh.missions.read",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "missionStatus",
        "domainType",
        "workspaceId",
        "cursor",
        "limit"
      ],
      "errors": []
    },
    {
      "name": "GetRun",
      "type": "abh.runs.get",
      "owner": "MissionController",
      "path": "/v1/queries/abh.runs.get",
      "response": "RunView",
      "permission": "abh.runs.read",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "id"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    },
    {
      "name": "GetToolCall",
      "type": "abh.tools.get",
      "owner": "MissionController",
      "path": "/v1/queries/abh.tools.get",
      "response": "ToolCallInspection",
      "permission": "abh.tools.read",
      "targetTypes": [
        "abh.tool-call"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "id"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    },
    {
      "name": "ListRuns",
      "type": "abh.runs.list",
      "owner": "MissionController",
      "path": "/v1/queries/abh.runs.list",
      "response": "RunListResult",
      "permission": "abh.runs.read",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "missionStatus",
        "missionId",
        "cursor",
        "limit"
      ],
      "errors": []
    },
    {
      "name": "GetContext",
      "type": "abh.contexts.get",
      "owner": "MissionController",
      "path": "/v1/queries/abh.contexts.get",
      "response": "ContextManifest",
      "permission": "abh.missions.read",
      "targetTypes": [
        "abh.context"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "id"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    },
    {
      "name": "GetProjection",
      "type": "abh.projections.get",
      "owner": "MissionController",
      "path": "/v1/queries/abh.projections.get",
      "response": "ProjectionQueryResult",
      "permission": "abh.projections.read",
      "targetTypes": [
        "abh.mission",
        "abh.decision"
      ],
      "purposeNames": [
        "abh.mission.manage",
        "abh.decision.review",
        "abh.runtime.deliver"
      ],
      "filters": [
        "id",
        "type",
        "fieldSet"
      ],
      "requiredFilters": [
        "id",
        "type"
      ],
      "errors": []
    },
    {
      "name": "ListProjection",
      "type": "abh.projections.list",
      "owner": "MissionController",
      "path": "/v1/queries/abh.projections.list",
      "response": "ProjectionListResult",
      "permission": "abh.projections.read",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "filters": [
        "type",
        "missionStatus",
        "domainType",
        "cursor",
        "limit"
      ],
      "requiredFilters": [
        "type"
      ],
      "errors": []
    },
    {
      "name": "GetAction",
      "type": "abh.actions.get",
      "owner": "ActionEngine",
      "path": "/v1/actions/{id}",
      "response": "ActionQueryResponse",
      "permission": "abh.actions.read",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "filters": [
        "consistency"
      ],
      "errors": []
    },
    {
      "name": "ListActions",
      "type": "abh.actions.list",
      "owner": "ActionEngine",
      "path": "/v1/actions",
      "response": "ActionListResponse",
      "permission": "abh.actions.read",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "filters": [
        "missionId",
        "type",
        "lifecycle",
        "outcome",
        "cursor",
        "limit",
        "consistency"
      ],
      "errors": []
    },
    {
      "name": "GetDecision",
      "type": "abh.decisions.get",
      "owner": "HumanGateway",
      "path": "/v1/queries/abh.decisions.get",
      "response": "DecisionQueryResponse",
      "permission": "abh.decisions.read",
      "targetTypes": [
        "abh.decision"
      ],
      "purposeNames": [
        "abh.decision.review",
        "abh.runtime.deliver"
      ],
      "filters": [
        "id",
        "consistency"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    },
    {
      "name": "ListInbox",
      "type": "abh.decisions.list-inbox",
      "owner": "HumanGateway",
      "path": "/v1/queries/abh.decisions.list-inbox",
      "response": "DecisionInboxResponse",
      "permission": "abh.decisions.read",
      "targetTypes": [
        "abh.decision"
      ],
      "purposeNames": [
        "abh.decision.review",
        "abh.runtime.deliver"
      ],
      "filters": [
        "status",
        "type",
        "expiry",
        "cursor",
        "limit",
        "consistency"
      ],
      "errors": []
    },
    {
      "name": "InspectPackInspectionJob",
      "type": "abh.pack-inspection-jobs.inspect",
      "owner": "PackLoader",
      "path": "/v1/queries/abh.pack-inspection-jobs.inspect",
      "response": "PackInspectionDiagnosticResponse",
      "permission": "abh.packs.record-data-impact",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "filters": [
        "id",
        "consistency"
      ],
      "requiredFilters": [
        "id"
      ],
      "errors": []
    }
  ],
  "events": [
    {
      "type": "abh.mission.created",
      "aggregateType": "abh.mission",
      "owner": "MissionController"
    },
    {
      "type": "abh.mission.projection-refresh-requested",
      "aggregateType": "abh.mission",
      "owner": "MissionController"
    },
    {
      "type": "abh.mission-conditions.created",
      "aggregateType": "abh.mission-conditions",
      "owner": "MissionController"
    },
    {
      "type": "abh.pack-inspection-delivery.accepted",
      "aggregateType": "abh.pack-inspection-delivery",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack-inspection-job.requested",
      "aggregateType": "abh.pack-inspection-job",
      "owner": "PackLoader"
    },
    {
      "type": "abh.decision-effect.applied",
      "aggregateType": "abh.decision-effect",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.decision-effect.created",
      "aggregateType": "abh.decision-effect",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.responsibility-request.route-revised",
      "aggregateType": "abh.responsibility-request",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.responsibility-assignment.revoked",
      "aggregateType": "abh.responsibility-assignment",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.exception.created",
      "aggregateType": "abh.exception",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.organization.created",
      "aggregateType": "abh.organization",
      "owner": "Identity"
    },
    {
      "type": "abh.principal.created",
      "aggregateType": "abh.principal",
      "owner": "Identity"
    },
    {
      "type": "abh.membership.created",
      "aggregateType": "abh.membership",
      "owner": "Identity"
    },
    {
      "type": "abh.grant.created",
      "aggregateType": "abh.grant",
      "owner": "Control"
    },
    {
      "type": "abh.ledger.created",
      "aggregateType": "abh.ledger",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.reservation.created",
      "aggregateType": "abh.reservation",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.artifact.created",
      "aggregateType": "abh.artifact",
      "owner": "ArtifactStore"
    },
    {
      "type": "abh.ledger.balance-changed",
      "aggregateType": "abh.ledger",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.fence.advanced",
      "aggregateType": "abh.fence",
      "owner": "Control"
    },
    {
      "type": "abh.release.created",
      "aggregateType": "abh.release",
      "owner": "CapabilityRelease"
    },
    {
      "type": "abh.assignment.created",
      "aggregateType": "abh.assignment",
      "owner": "CapabilityRelease"
    },
    {
      "type": "abh.pin-set.created",
      "aggregateType": "abh.pin-set",
      "owner": "CapabilityRelease"
    },
    {
      "type": "abh.assignment.selection-changed",
      "aggregateType": "abh.assignment",
      "owner": "CapabilityRelease"
    },
    {
      "type": "abh.commitment.created",
      "aggregateType": "abh.commitment",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.commitment.balance-changed",
      "aggregateType": "abh.commitment",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.settlement.created",
      "aggregateType": "abh.settlement",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.responsibility-assignment.created",
      "aggregateType": "abh.responsibility-assignment",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.responsibility-request.created",
      "aggregateType": "abh.responsibility-request",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.decision.created",
      "aggregateType": "abh.decision",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.request-completion-evidence.created",
      "aggregateType": "abh.request-completion-evidence",
      "owner": "HumanGateway"
    },
    {
      "type": "abh.execution-authority.created",
      "aggregateType": "abh.execution-authority",
      "owner": "Control"
    },
    {
      "type": "abh.pack.trust-policy-published",
      "aggregateType": "abh.pack-trust-policy",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack.data-impact-recorded",
      "aggregateType": "abh.pack-data-impact",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack-capability-set.registered",
      "aggregateType": "abh.pack-capability-set",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack.staged",
      "aggregateType": "abh.installed-pack",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack.enabled",
      "aggregateType": "abh.installed-pack",
      "owner": "PackLoader"
    },
    {
      "type": "abh.pack.validation-recorded",
      "aggregateType": "abh.pack-validation",
      "owner": "PackLoader"
    },
    {
      "type": "abh.action.created",
      "aggregateType": "abh.action",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.operation-plan.created",
      "aggregateType": "abh.operation-plan",
      "owner": "OperationController"
    },
    {
      "type": "abh.operation.created",
      "aggregateType": "abh.operation",
      "owner": "OperationController"
    },
    {
      "type": "abh.operation-receipt.created",
      "aggregateType": "abh.operation-receipt",
      "owner": "OperationController"
    },
    {
      "type": "abh.reconciliation.created",
      "aggregateType": "abh.reconciliation",
      "owner": "ReconciliationService"
    },
    {
      "type": "abh.action.plan-registered",
      "aggregateType": "abh.action",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.action-authorization-request.accepted",
      "aggregateType": "abh.action-authorization-request",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.action.pinned",
      "aggregateType": "abh.action",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.policy-version.created",
      "aggregateType": "abh.policy-version",
      "owner": "Control"
    },
    {
      "type": "abh.policy-binding.activated",
      "aggregateType": "abh.policy-binding",
      "owner": "Control"
    },
    {
      "type": "abh.policy-evaluation.created",
      "aggregateType": "abh.policy-evaluation",
      "owner": "Control"
    },
    {
      "type": "abh.resource-envelope.created",
      "aggregateType": "abh.resource-envelope",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.authorization-snapshot.created",
      "aggregateType": "abh.authorization-snapshot",
      "owner": "Control"
    },
    {
      "type": "abh.purpose.created",
      "aggregateType": "abh.purpose",
      "owner": "Control"
    },
    {
      "type": "abh.purpose.revoked",
      "aggregateType": "abh.purpose",
      "owner": "Control"
    },
    {
      "type": "abh.connection.created",
      "aggregateType": "abh.connection",
      "owner": "Identity"
    },
    {
      "type": "abh.connection.revoked",
      "aggregateType": "abh.connection",
      "owner": "Identity"
    },
    {
      "type": "abh.work-lease.claimed",
      "aggregateType": "abh.work-lease",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.work-lease.renewed",
      "aggregateType": "abh.work-lease",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.work-lease.released",
      "aggregateType": "abh.work-lease",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.resource-fence.created",
      "aggregateType": "abh.resource-fence",
      "owner": "OperationController"
    },
    {
      "type": "abh.resource-fence.occupied",
      "aggregateType": "abh.resource-fence",
      "owner": "OperationController"
    },
    {
      "type": "abh.resource-fence.blocked",
      "aggregateType": "abh.resource-fence",
      "owner": "OperationController"
    },
    {
      "type": "abh.resource-fence.cleared",
      "aggregateType": "abh.resource-fence",
      "owner": "OperationController"
    },
    {
      "type": "abh.dispatch-permit.created",
      "aggregateType": "abh.dispatch-permit",
      "owner": "OperationController"
    },
    {
      "type": "abh.attempt.created",
      "aggregateType": "abh.attempt",
      "owner": "OperationController"
    },
    {
      "type": "abh.attempt-observation.created",
      "aggregateType": "abh.attempt-observation",
      "owner": "OperationController"
    },
    {
      "type": "abh.dispatch-exit.created",
      "aggregateType": "abh.dispatch-exit",
      "owner": "OperationController"
    },
    {
      "type": "abh.action-result.created",
      "aggregateType": "abh.action-result",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.action-cleanup.created",
      "aggregateType": "abh.action-cleanup",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.reservation.extended",
      "aggregateType": "abh.reservation",
      "owner": "ResourceLedger"
    },
    {
      "type": "abh.action.authorization-refreshed",
      "aggregateType": "abh.action",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.transport-capture.created",
      "aggregateType": "abh.transport-capture",
      "owner": "OperationController"
    },
    {
      "type": "abh.inbox.created",
      "aggregateType": "abh.inbox",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.outbox-routing.created",
      "aggregateType": "abh.outbox-routing",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.outbox-delivery.created",
      "aggregateType": "abh.outbox-delivery",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.outbox-consumption.created",
      "aggregateType": "abh.outbox-consumption",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.outbox-publication.created",
      "aggregateType": "abh.outbox-publication",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.durable-wait.registered",
      "aggregateType": "abh.durable-wait",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.durable-wakeup.created",
      "aggregateType": "abh.durable-wakeup",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.durable-wait.observed",
      "aggregateType": "abh.durable-wait",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.wait-port-receipt.created",
      "aggregateType": "abh.wait-port-receipt",
      "owner": "DurableExecution"
    },
    {
      "type": "abh.action-wait.created",
      "aggregateType": "abh.action-wait",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.action-wait.notified",
      "aggregateType": "abh.action-wait",
      "owner": "ActionEngine"
    },
    {
      "type": "abh.operation-wait.created",
      "aggregateType": "abh.operation-wait",
      "owner": "OperationController"
    },
    {
      "type": "abh.operation-wait.notified",
      "aggregateType": "abh.operation-wait",
      "owner": "OperationController"
    },
    {
      "type": "abh.query-exit.created",
      "aggregateType": "abh.query-exit",
      "owner": "OperationController"
    },
    {
      "type": "abh.query-capture.created",
      "aggregateType": "abh.query-capture",
      "owner": "OperationController"
    },
    {
      "type": "abh.run.created",
      "aggregateType": "abh.run",
      "owner": "MissionController"
    },
    {
      "type": "abh.run.completed",
      "aggregateType": "abh.run",
      "owner": "MissionController"
    },
    {
      "type": "abh.run.recovered",
      "aggregateType": "abh.run",
      "owner": "MissionController"
    },
    {
      "type": "abh.task.cancelled",
      "aggregateType": "abh.task",
      "owner": "MissionController"
    },
    {
      "type": "abh.verification.created",
      "aggregateType": "abh.verification-report",
      "owner": "MissionController"
    }
  ]
} as const;
