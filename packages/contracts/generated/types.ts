/* Generated from JSON Schema 2020-12. Do not edit. */

/**
 * M0-A Preview structural contracts; all runtime authorization checks remain mandatory.
 */
export type PublicContract =
  | UUID
  | Version
  | RegisteredName
  | ExactVersion
  | Digest
  | Time
  | Decimal
  | Money
  | EntityRef
  | EntitySelector
  | CapabilityRef
  | AuthorityRef
  | SubjectRef
  | Actor
  | Target
  | AuthenticationStrength
  | RequestContext
  | AuthorizedRequestContext
  | ExecutionAuthorityBinding
  | ExecutionAuthority
  | ResolveAndPinRequest
  | ExecutionPin
  | PinSet
  | DevelopmentConfig
  | ActionRef
  | OperationRef
  | PlanRef
  | DecisionRef
  | DecisionEffectRef
  | CommandRef
  | ArtifactRef
  | PinSetRef
  | RequestRef
  | IdempotencyKey
  | NodeKey
  | Reason
  | NonnegativeDecimal
  | ResourceRequirement
  | ImpactUpperBound
  | ProposeActionPayload
  | ActionProposal
  | CancelActionPayload
  | RequestAuthorizationPayload
  | ValidateActionPayload
  | RegisterOperationPlanPayload
  | OperationInputBinding
  | OperationPlanNode
  | OperationPlan
  | ActionRecord
  | DecisionResponse
  | DecisionPackage
  | SubmitDecisionPayload
  | WithdrawDecisionPayload
  | DecisionEffectSummary
  | DecisionView
  | AuthorizationSummary
  | OperationSummary
  | ActionView
  | QueryMeta
  | ActionQueryResponse
  | DecisionQueryResponse
  | ActionListResponse
  | DecisionInboxResponse
  | ActionAcceptedResponse
  | DecisionSubmittedResponse
  | DecisionWithdrawnResponse
  | EventChangeSummary
  | JobEnvelope
  | InlineArtifactStoredResponse
  | PackInspectionJobRef
  | RequestContextRef
  | AuthorizedContextRef
  | CredentialRef
  | JobRef
  | WaitRef
  | StoredObjectRef
  | PortCallContext
  | IdentityVerifyRequest
  | VerifiedIdentity
  | EnqueueJobRequest
  | EnqueuedJob
  | ScheduleWakeupRequest
  | ScheduledWakeup
  | CancelWakeupRequest
  | CancelledWakeup
  | SignalWaitRequest
  | SignalledWait
  | InspectDeliveryRequest
  | DeliveryInspection
  | DrainQueueRequest
  | DrainReport
  | ObjectDescriptor
  | PutObjectRequest
  | ReadObjectRequest
  | ReadObjectDescriptor
  | StatObjectRequest
  | DeleteObjectRequest
  | DeletedObject
  | ObjectTypeRegistration
  | PurposeRegistration
  | ActionTypeRegistration
  | CatalogExtension
  | PackPath
  | PackFileEntry
  | PackCapabilityReference
  | PackCapabilityRequirement
  | PackResources
  | PackManifest
  | ConformanceCaseResult
  | ConformanceCapabilityClaim
  | ConformanceEnvironment
  | ConformanceReport
  | PackValidationReport
  | PackDeploymentPolicy
  | PackSignerPolicy
  | PackProvenancePolicy
  | PackConformancePolicy
  | PackGovernanceSnapshot
  | SignedTrustPolicyDocument
  | PackDataDefinition
  | PackDataInventory
  | PackDataChange
  | PackDataImpact
  | PackSchemaOwnership
  | PackMigrationStep
  | PackMigrationEvidence
  | PackMigrationAttemptRecord
  | PackMigrationObservationRecord
  | PackMigrationExecutionResult
  | PackMigrationExecutionRecord
  | PackMigrationStructureBinding
  | PackMigrationStructureReport
  | PackMigrationDataBinding
  | PackMigrationDataReport
  | PackMigrationDataObservation
  | PackMigrationStructureObservation
  | PackMigrationStateObservation
  | PackMigrationDataObservationResult
  | PackMigrationStructureObservationResult
  | OrganizationRecord
  | PrincipalRecord
  | MembershipRecord
  | GrantRecord
  | LedgerRecord
  | ReservationRecord
  | AuditRecord
  | CommandReceipt
  | ArtifactRecord
  | FenceRecord
  | LedgerEntryRecord
  | ConfigureLedgerPayload
  | ReserveAllPayload
  | ConsumeReservationPayload
  | ReleaseReservationPayload
  | IdentityLocationRecord
  | RevokeGrantPayload
  | WorkspaceRecord
  | ReleaseRecord
  | StaticAssignmentRecord
  | ConfigureStaticReleasePayload
  | ResolveStaticPinsPayload
  | StopStaticAssignmentPayload
  | StoreInlineArtifactPayload
  | TombstoneArtifactPayload
  | CommitmentRecord
  | SettlementRecord
  | OpenCommitmentPayload
  | SettleCommitmentPayload
  | AdjustCommitmentPayload
  | BeginCloseCommitmentPayload
  | CloseCommitmentPayload
  | ResponsibilityAssignmentRecord
  | ResponsibilitySeat
  | ResponsibilitySlot
  | ResponsibilityRequestRecord
  | DecisionRecord
  | RequestCompletionEvidence
  | OpenResponsibilityRequestPayload
  | AssignResponsibilityPayload
  | IssueExecutionAuthorityPayload
  | OperationRecord
  | OperationReceiptRecord
  | OperationReconciliationRecord
  | ActionIntentRecord
  | PolicyDecision
  | PolicyEvaluationRecord
  | RevokeExecutionAuthorityPayload
  | LifecyclePurposeNames
  | PinActionPayload
  | CompiledPolicyManifest
  | PolicyVersionRecord
  | PolicyBindingRecord
  | ConfigurePolicyPayload
  | ActivateMandatoryPolicyPayload
  | ActionPolicyInput
  | ResourceLedgerBinding
  | ResourceEnvelopeRecord
  | ConfigureResourceEnvelopePayload
  | AuthorizationSnapshotRecord
  | PurposeRecord
  | ConnectionRecord
  | ConfigurePurposePayload
  | ConfigureConnectionPayload
  | RevokeDirectoryRecordPayload
  | WorkLeaseRecord
  | ClaimWorkLeasePayload
  | RenewWorkLeasePayload
  | ReleaseWorkLeasePayload
  | ResourceFenceRecord
  | DispatchPermitRecord
  | AttemptRecord
  | AttemptObservationRecord
  | IssueDispatchPermitPayload
  | DispatchExitRecord
  | ClaimDispatchExitPayload
  | NormalizedOperationObservation
  | RecordOperationReceiptPayload
  | CompareOperationPayload
  | ApplyReconciliationPayload
  | RecoverOperationPayload
  | RecoverRunPayload
  | ActionResultRecord
  | AggregateActionPayload
  | CleanupActionPayload
  | ActionCleanupRecord
  | RefreshActionPayload
  | TransportCaptureRecord
  | CaptureTransportPayload
  | InboxRecord
  | ConsumeEventPayload
  | OutboxRoutingRecord
  | OutboxDeliveryRecord
  | OutboxPublicationRecord
  | PrepareOutboxPayload
  | RecordOutboxDeliveryPayload
  | RegisterDurableWaitPayload
  | DurableWaitSource
  | DurableWaitRecord
  | DurableWakeupRecord
  | RecheckDurableWaitPayload
  | CancelDurableWaitPayload
  | WaitPortReceiptRecord
  | ExecuteWaitPortPayload
  | ActionWaitRecord
  | NotifyActionWaitPayload
  | OperationWaitRecord
  | NotifyOperationWaitPayload
  | ClaimQueryExitPayload
  | QueryExitRecord
  | QueryCaptureRecord
  | CaptureQueryPayload
  | ScopeAuthorityDraft
  | ScopeAuthorityPolicyInput
  | CreateScopeAuthorityPayload
  | OutboxConsumptionRecord
  | RecordOutboxConsumptionPayload
  | ExceptionRecord
  | OpenTerminalExceptionPayload
  | RevokeResponsibilityPayload
  | DecisionWithdrawalRecord
  | ReviseResponsibilityRoutePayload
  | ResponsibilityRouteRevisionRecord
  | DecisionEffectIntentRecord
  | DecisionEffectReceiptRecord
  | ActionAuthorizationRequestRecord
  | RecordPackValidationPayload
  | PublishPackTrustPolicyPayload
  | LocalPackStagingReceipt
  | StagePackPayload
  | InstalledPackRecord
  | PackDataImpactRecord
  | RecordPackDataImpactPayload
  | PackInspectionJobRecord
  | RequestPackInspectionPayload
  | StartPackInspectionPayload
  | ExpirePackInspectionPayload
  | PackInspectionTimeoutEvidence
  | CompletePackInspectionPayload
  | PackInspectionBlockEvidence
  | WaitPackInspectionPayload
  | PackInspectionWaitingEvidence
  | CancelPackInspectionPayload
  | PackInspectionCancellationEvidence
  | PackInspectionRetryExhaustedEvidence
  | PackInspectionDeliveryRecord
  | AcceptPackInspectionDeliveryPayload
  | PackInspectionLeaseLossEvidence
  | FailLostPackInspectionPayload
  | DatabaseDiagnosticResult
  | ProjectionHealthResult
  | CliDoctorProjectionResult
  | CliDoctorDataResult
  | PackInspectionDiagnostic
  | PackInspectionDiagnosticResponse
  | CliInspectionDiagnosticResult
  | PackInspectionFailureEvidence
  | FailPackInspectionPayload
  | PackMigrationNonApplicabilityReport
  | PackEnableProposal
  | RecordPackConformancePayload
  | RequestPackEnablePayload
  | PackDeploymentRevisionRecord
  | EnablePackPayload
  | PackEnableRecord
  | PackCapabilityBinding
  | PackCapabilityRegistration
  | RegisterPackCapabilitiesPayload
  | PackCapabilitySetRecord
  | PackCapabilityAvailability
  | PackCapabilityCandidate
  | PackCapabilityQueryResult
  | SuspendPackPayload
  | PackSuspensionRecord
  | RetirePackPayload
  | PackRetirementRecord
  | CompatibleQueryEvidence
  | RecordCompatibleQueryEvidencePayload
  | MissionConditionInput
  | CreateMissionPayload
  | MissionConditionRecord
  | MissionRecord
  | ActivateMissionPayload
  | SubmitTriggerPayload
  | MissionTriggerRecord
  | MissionBlockerRecord
  | RefreshMissionSummaryPayload
  | ProjectionRefreshReceipt
  | PauseMissionPayload
  | CancelMissionPayload
  | ResumeMissionPayload
  | ReviseMissionGoalPayload
  | CloseMissionPayload
  | BlockMissionPayload
  | ResolveBlockerPayload
  | MissionView
  | MissionListResult
  | RunRecord
  | StartRunPayload
  | CompleteRunPayload
  | CancelRunPayload
  | TaskRecord
  | RunView
  | RunListResult
  | ToolCallInspection
  | ContextManifest
  | VerificationReport
  | SubmitVerificationPayload
  | ToolCapability
  | ToolBinding
  | ToolCallRecord
  | InvokeToolPayload
  | ToolCallResponse
  | ModelRoute
  | ModelCallRecord
  | ProjectionEnvelope
  | MissionSummaryProjection
  | CaptureSignalPayload
  | LearningSignalRecord
  | AgentTaskContract
  | RuntimeEvent
  | ProjectionQueryResult
  | ProjectionListResult
  | ProjectionChangedEvent
  | ActionTimelineProjection
  | ResponsibilityInboxProjection
  | InvocationHandle
  | BuildMissionSummaryPayload
  | ResolvedDevelopmentConfig
  | CreateMissionCommand
  | CreateMissionHttpRequest
  | ActivateMissionCommand
  | ActivateMissionHttpRequest
  | SubmitTriggerCommand
  | SubmitTriggerHttpRequest
  | PauseMissionCommand
  | PauseMissionHttpRequest
  | CancelMissionCommand
  | CancelMissionHttpRequest
  | ResumeMissionCommand
  | ResumeMissionHttpRequest
  | ReviseMissionGoalCommand
  | ReviseMissionGoalHttpRequest
  | CloseMissionCommand
  | CloseMissionHttpRequest
  | BlockMissionCommand
  | BlockMissionHttpRequest
  | ResolveBlockerCommand
  | ResolveBlockerHttpRequest
  | FailPackInspectionCommand
  | FailLostPackInspectionCommand
  | AcceptPackInspectionDeliveryCommand
  | CancelPackInspectionCommand
  | WaitPackInspectionCommand
  | CompletePackInspectionCommand
  | ExpirePackInspectionCommand
  | StartPackInspectionCommand
  | RequestPackInspectionCommand
  | RecordPackDataImpactCommand
  | RegisterPackCapabilitiesCommand
  | RecordCompatibleQueryEvidenceCommand
  | RetirePackCommand
  | SuspendPackCommand
  | EnablePackCommand
  | RequestPackEnableCommand
  | RecordPackConformanceCommand
  | StagePackCommand
  | PublishPackTrustPolicyCommand
  | RecordPackValidationCommand
  | ReviseResponsibilityRouteCommand
  | RevokeResponsibilityCommand
  | ExpireResponsibilityRequestCommand
  | RetryResponsibilityRouteCommand
  | OpenTerminalExceptionCommand
  | CreateScopeAuthorityCommand
  | EvaluateScopeAuthorityCommand
  | CaptureQueryCommand
  | ClaimQueryExitCommand
  | NotifyOperationWaitCommand
  | ExecuteWaitPortCommand
  | NotifyActionWaitCommand
  | RegisterDurableWaitCommand
  | RecheckDurableWaitCommand
  | CancelDurableWaitCommand
  | PrepareOutboxCommand
  | RecordOutboxConsumptionCommand
  | RecordOutboxDeliveryCommand
  | ConsumeEventCommand
  | BuildMissionSummaryCommand
  | RefreshMissionSummaryCommand
  | RefreshMissionSummaryHttpRequest
  | RefreshActionAuthorizationCommand
  | CleanupActionCommand
  | AggregateActionCommand
  | RecoverOperationCommand
  | ApplyReconciliationCommand
  | CompareOperationCommand
  | CaptureTransportCommand
  | RecordOperationReceiptCommand
  | ClaimDispatchExitCommand
  | IssueDispatchPermitCommand
  | ProposeActionCommand
  | ProposeActionHttpRequest
  | CancelActionCommand
  | CancelActionHttpRequest
  | RequestAuthorizationCommand
  | RequestAuthorizationHttpRequest
  | SubmitDecisionCommand
  | SubmitDecisionHttpRequest
  | WithdrawDecisionCommand
  | WithdrawDecisionHttpRequest
  | ValidateActionCommand
  | RegisterOperationPlanCommand
  | ConfigureLedgerCommand
  | ReserveAllCommand
  | ConsumeReservationCommand
  | ReleaseReservationCommand
  | RevokeGrantCommand
  | ConfigureStaticReleaseCommand
  | ResolveStaticPinsCommand
  | StopStaticAssignmentCommand
  | StoreInlineArtifactCommand
  | StoreInlineArtifactHttpRequest
  | TombstoneArtifactCommand
  | OpenCommitmentCommand
  | SettleCommitmentCommand
  | AdjustCommitmentCommand
  | BeginCloseCommitmentCommand
  | CloseCommitmentCommand
  | AssignResponsibilityCommand
  | OpenResponsibilityRequestCommand
  | IssueExecutionAuthorityCommand
  | RevokeExecutionAuthorityCommand
  | PinActionCommand
  | ConfigurePolicyCommand
  | ActivateMandatoryPolicyCommand
  | ConfigureResourceEnvelopeCommand
  | ConfigurePurposeCommand
  | ConfigureConnectionCommand
  | RevokePurposeCommand
  | RevokeConnectionCommand
  | ClaimWorkLeaseCommand
  | RenewWorkLeaseCommand
  | ReleaseWorkLeaseCommand
  | StartRunCommand
  | StartRunHttpRequest
  | CompleteRunCommand
  | CompleteRunHttpRequest
  | CancelRunCommand
  | CancelRunHttpRequest
  | RecoverRunCommand
  | SubmitVerificationCommand
  | SubmitVerificationHttpRequest
  | InvokeToolCommand
  | InvokeToolHttpRequest
  | CaptureSignalCommand
  | CaptureSignalHttpRequest
  | CommandEnvelope
  | QueryPackCapabilitiesQuery
  | GetMissionQuery
  | ListMissionsQuery
  | GetRunQuery
  | GetToolCallQuery
  | ListRunsQuery
  | GetContextQuery
  | GetProjectionQuery
  | ListProjectionQuery
  | GetActionQuery
  | ListActionsQuery
  | GetDecisionQuery
  | ListInboxQuery
  | InspectPackInspectionJobQuery
  | EventEnvelope
  | MissionState
  | RunState
  | ActionState
  | ActionOutcome
  | ActionPosition
  | OperationState
  | OperationOutcome
  | OperationPosition
  | DecisionState
  | DecisionEffectState
  | ResponsibilityRequestState
  | GrantState
  | ExecutionAuthorityState
  | ReservationState
  | CommitmentState
  | LedgerState
  | ReleaseState
  | InstalledPackState
  | ArtifactState
  | AccessRecordState
  | DurableWaitState
  | ExternalObservationState
  | AssignmentState
  | AttemptState
  | PackInspectionJobState
  | ErrorResponse
  | IdentityProviderVerifyResult
  | DurableExecutionEnqueueResult
  | DurableExecutionScheduleWakeupResult
  | DurableExecutionCancelWakeupResult
  | DurableExecutionSignalResult
  | DurableExecutionInspectResult
  | DurableExecutionDrainResult
  | ObjectStorePutResult
  | ObjectStoreReadResult
  | ObjectStoreStatResult
  | ObjectStoreDeleteResult;
export type UUID = string;
export type Version = number;
export type RegisteredName = string;
export type ExactVersion = string;
export type Digest = string;
export type Time = string;
export type Decimal = string;
export type AuthorityRef =
  | {
      type: "abh.mission-authority";
      id: UUID;
      version: Version;
    }
  | {
      type: "abh.execution-authority";
      id: UUID;
      version: Version;
    };
export type SubjectRef =
  | {
      type: "abh.run";
      id: UUID;
      version: Version;
    }
  | {
      type: "abh.action";
      id: UUID;
      version: Version;
    };
export type AuthenticationStrength =
  | {
      level: "SingleFactor";
    }
  | {
      level: "MultiFactor";
      mfaVerifiedAt: Time;
    }
  | {
      level: "Workload";
    };
export type ExecutionAuthorityBinding =
  | {
      kind: "Scope";
    }
  | {
      kind: "Action";
      actionRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      payloadDigest: Digest;
    };
export type ExecutionAuthorityState = "Active" | "Revoked" | "Expired";
export type IdempotencyKey = string;
export type NodeKey = string;
export type Reason = string;
export type NonnegativeDecimal = Decimal;
export type ActionPosition =
  | {
      lifecycle: "Proposed";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Validated";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Authorized";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Executing";
      outcome: "Pending" | "Unknown";
    }
  | {
      lifecycle: "Reconciling";
      outcome: "Pending" | "Unknown";
    }
  | {
      lifecycle: "Closed";
      outcome: "Succeeded" | "PartiallySucceeded" | "Failed";
    }
  | {
      lifecycle: "Rejected";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Expired";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Cancelled";
      outcome: "NotStarted";
    };
export type DecisionResponse = "Approved" | "Rejected";
export type SubmitDecisionPayload =
  | {
      packageDigest: Digest;
      response: "Approved";
      /**
       * @minItems 0
       * @maxItems 100
       */
      conditionRefs: {
        type: "abh.condition";
        id: UUID;
        version: Version;
      }[];
      reason?: Reason;
      reauthProofRef?: {
        type: "abh.reauth-proof";
        id: UUID;
        version: Version;
      };
    }
  | {
      packageDigest: Digest;
      response: "Rejected";
      /**
       * @minItems 0
       * @maxItems 0
       */
      conditionRefs: {
        type: "abh.condition";
        id: UUID;
        version: Version;
      }[];
      reason: Reason;
      reauthProofRef?: {
        type: "abh.reauth-proof";
        id: UUID;
        version: Version;
      };
    };
export type DecisionEffectState = "Pending" | "Applied" | "Blocked" | "Abandoned";
export type DecisionState = "Pending" | "Approved" | "Rejected" | "Expired" | "Superseded" | "Withdrawn";
export type OperationPosition =
  | {
      lifecycle: "Pending";
      outcome: "NotStarted";
    }
  | {
      lifecycle: "Dispatching";
      outcome: "Pending" | "Unknown";
    }
  | {
      lifecycle: "Observing";
      outcome: "Pending" | "Unknown";
    }
  | {
      lifecycle: "Closed";
      outcome: "Succeeded" | "Failed";
    }
  | {
      lifecycle: "Cancelled";
      outcome: "NotStarted";
    };
export type PackPath = string;
export type PackResources =
  | {
      enforcement: "None";
    }
  | {
      enforcement: "HostProfile";
      profileRef: EntityRef;
    }
  | {
      enforcement: "IsolatedLimits";
      cpuMillis: number;
      memoryBytes: number;
      processes: number;
      temporaryDiskBytes: number;
      outputBytes: number;
      wallTimeMs: number;
    };
export type AccessRecordState = "Active" | "Revoked" | "Expired";
export type GrantState = "Active" | "Revoked" | "Expired";
export type LedgerState = "Open" | "Frozen" | "Closed";
export type ReservationState = "Held" | "Consumed" | "Committed" | "Released" | "Expired";
export type ArtifactState = "Staged" | "Available" | "Quarantined" | "Tombstoned";
/**
 * @minItems 1
 * @maxItems 32
 */
export type LifecyclePurposeNames = RegisteredName[];
export type ReleaseState = "Draft" | "Ready" | "Retired" | "Revoked";
export type AssignmentState = "Shadow" | "Canary" | "Active" | "Paused" | "Retired";
export type CommitmentState = "Open" | "Closing" | "Closed";
export type ResponsibilityRequestState = "Unresolved" | "Open" | "Closed" | "Withdrawn";
export type PolicyVersionRecord = PolicyVersionRecord1;
export type AttemptState = "Created" | "Sent" | "Responded" | "TransportFailed" | "Interrupted";
/**
 * Exact packageDigest of the Pack subject; not this proposal digest.
 */
export type Digest1 = string;
export type PackInspectionJobState = "Pending" | "Running" | "Waiting" | "Succeeded" | "Failed" | "Cancelled";
export type DatabaseDiagnosticResult = DatabaseDiagnosticResult1;
export type CliDoctorProjectionResult = CliDoctorProjectionResult1;
export type CliDoctorDataResult = CliDoctorDataResult1;
export type PackInspectionDiagnostic = PackInspectionDiagnostic1;
export type CliInspectionDiagnosticResult = CliInspectionDiagnosticResult1;
/**
 * Checked no-change migration applicability report. Current signature, source and staged-content verification remain Owner obligations.
 */
export type PackMigrationNonApplicabilityReport = PackDataImpactRecord & {
  baseline: {
    complete: true;
    [k: string]: unknown;
  };
  target: {
    complete: true;
    [k: string]: unknown;
  };
  impact: {
    status: "NotApplicable";
    /**
     * @maxItems 0
     */
    changes: unknown[];
    /**
     * @maxItems 0
     */
    migrationRefs: unknown[];
    /**
     * @maxItems 0
     */
    reasons: unknown[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
};
export type CommandEnvelope =
  | CreateMissionCommand
  | ActivateMissionCommand
  | SubmitTriggerCommand
  | PauseMissionCommand
  | CancelMissionCommand
  | ResumeMissionCommand
  | ReviseMissionGoalCommand
  | CloseMissionCommand
  | BlockMissionCommand
  | ResolveBlockerCommand
  | FailPackInspectionCommand
  | FailLostPackInspectionCommand
  | AcceptPackInspectionDeliveryCommand
  | CancelPackInspectionCommand
  | WaitPackInspectionCommand
  | CompletePackInspectionCommand
  | ExpirePackInspectionCommand
  | StartPackInspectionCommand
  | RequestPackInspectionCommand
  | RecordPackDataImpactCommand
  | RegisterPackCapabilitiesCommand
  | RecordCompatibleQueryEvidenceCommand
  | RetirePackCommand
  | SuspendPackCommand
  | EnablePackCommand
  | RequestPackEnableCommand
  | RecordPackConformanceCommand
  | StagePackCommand
  | PublishPackTrustPolicyCommand
  | RecordPackValidationCommand
  | ReviseResponsibilityRouteCommand
  | RevokeResponsibilityCommand
  | ExpireResponsibilityRequestCommand
  | RetryResponsibilityRouteCommand
  | OpenTerminalExceptionCommand
  | CreateScopeAuthorityCommand
  | EvaluateScopeAuthorityCommand
  | CaptureQueryCommand
  | ClaimQueryExitCommand
  | NotifyOperationWaitCommand
  | ExecuteWaitPortCommand
  | NotifyActionWaitCommand
  | RegisterDurableWaitCommand
  | RecheckDurableWaitCommand
  | CancelDurableWaitCommand
  | PrepareOutboxCommand
  | RecordOutboxConsumptionCommand
  | RecordOutboxDeliveryCommand
  | ConsumeEventCommand
  | BuildMissionSummaryCommand
  | RefreshMissionSummaryCommand
  | RefreshActionAuthorizationCommand
  | CleanupActionCommand
  | AggregateActionCommand
  | RecoverOperationCommand
  | ApplyReconciliationCommand
  | CompareOperationCommand
  | CaptureTransportCommand
  | RecordOperationReceiptCommand
  | ClaimDispatchExitCommand
  | IssueDispatchPermitCommand
  | ProposeActionCommand
  | CancelActionCommand
  | RequestAuthorizationCommand
  | SubmitDecisionCommand
  | WithdrawDecisionCommand
  | ValidateActionCommand
  | RegisterOperationPlanCommand
  | ConfigureLedgerCommand
  | ReserveAllCommand
  | ConsumeReservationCommand
  | ReleaseReservationCommand
  | RevokeGrantCommand
  | ConfigureStaticReleaseCommand
  | ResolveStaticPinsCommand
  | StopStaticAssignmentCommand
  | StoreInlineArtifactCommand
  | TombstoneArtifactCommand
  | OpenCommitmentCommand
  | SettleCommitmentCommand
  | AdjustCommitmentCommand
  | BeginCloseCommitmentCommand
  | CloseCommitmentCommand
  | AssignResponsibilityCommand
  | OpenResponsibilityRequestCommand
  | IssueExecutionAuthorityCommand
  | RevokeExecutionAuthorityCommand
  | PinActionCommand
  | ConfigurePolicyCommand
  | ActivateMandatoryPolicyCommand
  | ConfigureResourceEnvelopeCommand
  | ConfigurePurposeCommand
  | ConfigureConnectionCommand
  | RevokePurposeCommand
  | RevokeConnectionCommand
  | ClaimWorkLeaseCommand
  | RenewWorkLeaseCommand
  | ReleaseWorkLeaseCommand
  | StartRunCommand
  | CompleteRunCommand
  | CancelRunCommand
  | RecoverRunCommand
  | SubmitVerificationCommand
  | InvokeToolCommand
  | CaptureSignalCommand;
export type MissionState = "Draft" | "Active" | "Paused" | "Blocked" | "Completed" | "Cancelled";
export type ActionState =
  | "Proposed"
  | "Validated"
  | "Authorized"
  | "Executing"
  | "Reconciling"
  | "Closed"
  | "Rejected"
  | "Expired"
  | "Cancelled";
export type ActionOutcome = "NotStarted" | "Pending" | "Unknown" | "Succeeded" | "PartiallySucceeded" | "Failed";
export type EventEnvelope =
  | {
      eventId: UUID;
      type: "abh.access-record.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.access-record";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.access-record.revoke";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.access-record";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action-authorization-request.accepted";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action-authorization-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action-cleanup.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action-cleanup";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action-result.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action-result";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action-wait.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action-wait.notified";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.advance";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.authorization-refreshed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.authorize";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.close";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.dispatch";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.pinned";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.plan-registered";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.reauthorize";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.reconcile";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.reject";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.action.validate";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.action";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.artifact.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.artifact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.artifact.publish";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.artifact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.artifact.quarantine";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.artifact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.artifact.restore";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.artifact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.artifact.tombstone";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.artifact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.pause";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.promote-active";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.promote-canary";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.resume-active";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.resume-canary";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.resume-shadow";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.retire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.assignment.selection-changed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt-observation.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt-observation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt.interrupted";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt.responded";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt.sent";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.attempt.transport-failed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.attempt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.authorization-snapshot.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.authorization-snapshot";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.commitment.balance-changed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.commitment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.commitment.close";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.commitment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.commitment.close-requested";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.commitment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.commitment.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.commitment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.connection.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.connection";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.connection.revoked";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.connection";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision-effect.abandon";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision-effect";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision-effect.applied";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision-effect";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision-effect.apply";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision-effect";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision-effect.block";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision-effect";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision-effect.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision-effect";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.approve";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.reject";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.supersede";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.decision.withdraw";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.decision";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.dispatch-exit.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.dispatch-exit";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.dispatch-permit.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.dispatch-permit";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.durable-wait.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.durable-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.durable-wait.observed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.durable-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.durable-wait.registered";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.durable-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.durable-wait.succeed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.durable-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.durable-wakeup.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.durable-wakeup";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.exception.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.exception";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.execution-authority.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.execution-authority";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.execution-authority.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.execution-authority";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.execution-authority.revoke";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.execution-authority";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.external-observation.normalize";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.external-observation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.external-observation.quarantine";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.external-observation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.external-observation.release";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.external-observation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.fence.advanced";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.fence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.grant.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.grant";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.grant.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.grant";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.grant.revoke";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.grant";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.inbox.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.inbox";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.installed-pack.enable";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.installed-pack";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.installed-pack.retire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.installed-pack";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.installed-pack.suspend";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.installed-pack";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.ledger.balance-changed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.ledger";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.ledger.close";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.ledger";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.ledger.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.ledger";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.ledger.freeze";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.ledger";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.ledger.unfreeze";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.ledger";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.membership.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.membership";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission-conditions.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission-conditions";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.activate";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.block";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.complete";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.pause";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.projection-refresh-requested";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.resolve";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.mission.resume";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.mission";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation-plan.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation-plan";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation-receipt.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation-receipt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation-wait.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation-wait.notified";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation-wait";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.close";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.dispatch";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.observe";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.operation.retry";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.operation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.organization.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.organization";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.outbox-consumption.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.outbox-consumption";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.outbox-delivery.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.outbox-delivery";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.outbox-publication.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.outbox-publication";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.outbox-routing.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.outbox-routing";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-capability-set.registered";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-capability-set";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-delivery.accepted";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-delivery";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.fail";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.requested";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.start";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.succeed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack-inspection-job.wait";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-inspection-job";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack.data-impact-recorded";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-data-impact";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack.enabled";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.installed-pack";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack.staged";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.installed-pack";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack.trust-policy-published";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-trust-policy";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pack.validation-recorded";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pack-validation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.pin-set.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.pin-set";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.policy-binding.activated";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.policy-binding";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.policy-evaluation.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.policy-evaluation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.policy-version.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.policy-version";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.principal.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.principal";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.purpose.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.purpose";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.purpose.revoked";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.purpose";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.query-capture.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.query-capture";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.query-exit.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.query-exit";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reconciliation.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reconciliation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.release.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.release";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.release.ready";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.release";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.release.retire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.release";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.release.revoke";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.release";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.request-completion-evidence.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.request-completion-evidence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.commit";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.consume";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.expire";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.extended";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.reservation.release";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.reservation";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.resource-envelope.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.resource-envelope";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.resource-fence.blocked";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.resource-fence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.resource-fence.cleared";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.resource-fence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.resource-fence.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.resource-fence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.resource-fence.occupied";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.resource-fence";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-assignment.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-assignment.revoked";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-assignment";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.close";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.route";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.route-revised";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.unroute";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.responsibility-request.withdraw";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.responsibility-request";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.cancel";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.complete";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.completed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.pause";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.recovered";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.resume";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.start";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.wait";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.run.wake";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.run";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.settlement.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.settlement";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.task.cancelled";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.task";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.transport-capture.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.transport-capture";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.verification.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.verification-report";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.wait-port-receipt.created";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.wait-port-receipt";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.work-lease.claimed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.work-lease";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.work-lease.released";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.work-lease";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    }
  | {
      eventId: UUID;
      type: "abh.work-lease.renewed";
      schemaVersion: "0.1.0";
      aggregateRef: {
        type: "abh.work-lease";
        id: UUID;
        version: Version;
      };
      aggregateVersion: Version;
      eventOrdinal: number;
      occurredAt: Time;
      correlationId: UUID;
      causationId: UUID;
      actorRef: Actor;
      actingOrganizationId: UUID;
      resourceOrganizationId: UUID;
      workspaceId?: UUID;
      payload: EventChangeSummary;
    };
export type RunState = "Queued" | "Running" | "Waiting" | "Paused" | "Completed" | "Failed" | "Cancelled";
export type OperationState = "Pending" | "Dispatching" | "Observing" | "Closed" | "Cancelled";
export type OperationOutcome = "NotStarted" | "Pending" | "Unknown" | "Succeeded" | "Failed";
export type InstalledPackState = "Staged" | "Enabled" | "Suspended" | "Retired";
export type DurableWaitState = "Pending" | "Succeeded" | "Cancelled";
export type ExternalObservationState = "Received" | "Normalized" | "Quarantined";
export type IdentityProviderVerifyResult =
  | {
      status: "Completed";
      data: VerifiedIdentity;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    };
export type DurableExecutionEnqueueResult =
  | {
      status: "Completed";
      data: EnqueuedJob;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: JobRef;
    };
export type DurableExecutionScheduleWakeupResult =
  | {
      status: "Completed";
      data: ScheduledWakeup;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: WaitRef;
    };
export type DurableExecutionCancelWakeupResult =
  | {
      status: "Completed";
      data: CancelledWakeup;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: WaitRef;
    };
export type DurableExecutionSignalResult =
  | {
      status: "Completed";
      data: SignalledWait;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: WaitRef;
    };
export type DurableExecutionInspectResult =
  | {
      status: "Completed";
      data: DeliveryInspection;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    };
export type DurableExecutionDrainResult =
  | {
      status: "Completed";
      data: DrainReport;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    };
export type ObjectStorePutResult =
  | {
      status: "Completed";
      data: ObjectDescriptor;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: ArtifactRef;
    };
export type ObjectStoreReadResult =
  | {
      status: "Completed";
      data: ReadObjectDescriptor;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    };
export type ObjectStoreStatResult =
  | {
      status: "Completed";
      data: ObjectDescriptor;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    };
export type ObjectStoreDeleteResult =
  | {
      status: "Completed";
      data: DeletedObject;
    }
  | {
      status: "Cancelled";
      effect: "None";
    }
  | {
      status: "Rejected";
      error: ErrorResponse;
    }
  | {
      status: "Tracked";
      trackingRef: StoredObjectRef;
    };

export interface Money {
  amount: Decimal;
  currency: string;
}
export interface EntityRef {
  type: RegisteredName;
  id: UUID;
  version: Version;
}
export interface EntitySelector {
  type: RegisteredName;
  id: UUID;
}
export interface CapabilityRef {
  kind:
    | "Agent"
    | "Prompt"
    | "Workflow"
    | "Tool"
    | "ModelRoute"
    | "BehaviorPolicy"
    | "Connector"
    | "Compiler"
    | "RuntimeAdapter";
  id: RegisteredName;
  version: ExactVersion;
  digest: Digest;
}
export interface Actor {
  type: "Human" | "AgentInvocation" | "Service" | "ExternalPlatform";
  id: UUID;
  responsibilityRef?: EntityRef;
}
export interface Target {
  objectRef: EntityRef;
  action: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
}
/**
 * Server-created identity context. Structural validation does not authenticate or authorize a caller.
 */
export interface RequestContext {
  requestId: UUID;
  correlationId: UUID;
  causationId?: UUID;
  traceId?: string;
  actingOrganizationId: UUID;
  resourceOrganizationId: UUID;
  workspaceId?: UUID;
  actor: Actor;
  purposeOfUse: RegisteredName;
  authnStrength: AuthenticationStrength;
  sessionEpoch: number;
  scopeEpoch: number;
  executionAuthorityRef?: AuthorityRef;
  originatingRequestRef?: EntityRef;
  contextExpiresAt: Time;
  receivedAt: Time;
  locale?: string;
  businessTimezone?: string;
}
export interface AuthorizedRequestContext {
  requestId: UUID;
  correlationId: UUID;
  causationId?: UUID;
  traceId?: string;
  actingOrganizationId: UUID;
  resourceOrganizationId: UUID;
  workspaceId?: UUID;
  actor: Actor;
  purposeOfUse: RegisteredName;
  authnStrength: AuthenticationStrength;
  sessionEpoch: number;
  scopeEpoch: number;
  executionAuthorityRef?: AuthorityRef;
  originatingRequestRef?: EntityRef;
  contextExpiresAt: Time;
  receivedAt: Time;
  locale?: string;
  businessTimezone?: string;
  authorizationSnapshotId: UUID;
}
export interface ExecutionAuthority {
  authorityRef: {
    type: "abh.execution-authority";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  allowedProposerRefs: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  }[];
  binding: ExecutionAuthorityBinding;
  /**
   * @minItems 1
   * @maxItems 100
   */
  grantRefs: {
    type: "abh.grant";
    id: UUID;
    version: Version;
  }[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeRefs: {
    type: "abh.purpose";
    id: UUID;
    version: Version;
  }[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  actionTypes: RegisteredName[];
  resourceEnvelopeRef: {
    type: "abh.resource-envelope";
    id: UUID;
    version: Version;
  };
  validFrom: Time;
  validUntil: Time;
  /**
   * @minItems 0
   * @maxItems 100
   */
  stopConditions: EntityRef[];
  issuanceEvidenceRef:
    | {
        type: "abh.request-completion-evidence";
        id: UUID;
        version: Version;
      }
    | {
        type: "abh.policy-evaluation";
        id: UUID;
        version: Version;
      };
  effectKey: string;
  issuedBy: Actor;
  /**
   * @minItems 1
   * @maxItems 100
   */
  sourceVersionRefs: EntityRef[];
  issuanceDigest: Digest;
  supersedesAuthorityRef?: {
    type: "abh.execution-authority";
    id: UUID;
    version: Version;
  };
  status: ExecutionAuthorityState;
}
export interface ResolveAndPinRequest {
  subjectRef: SubjectRef;
  subjectInputDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 32
   */
  requiredBehaviorSlots: RegisteredName[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  verifiedScope: EntityRef[];
  requestContextRef: {
    type: "abh.request-context";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  preparationAuthorityRefs: (
    | AuthorityRef
    | {
        type: "abh.grant";
        id: UUID;
        version: Version;
      }
  )[];
}
export interface ExecutionPin {
  behaviorSlot: RegisteredName;
  assignmentRef: {
    type: "abh.assignment";
    id: UUID;
    version: Version;
  };
  releaseRef: {
    type: "abh.release";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  capabilityExactRefs: CapabilityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  versionVector: EntityRef[];
  allocationRef?: {
    type: "abh.allocation";
    id: UUID;
    version: Version;
  };
}
export interface PinSet {
  pinSetRef: {
    type: "abh.pin-set";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  subjectRef: SubjectRef;
  subjectInputDigest: Digest;
  requiredSlotsDigest: Digest;
  digest: Digest;
  /**
   * @minItems 1
   * @maxItems 32
   */
  pins: ExecutionPin[];
}
export interface DevelopmentConfig {
  deployment: {
    profile: "Development";
  };
  identity: {
    provider: "Fake";
  };
  database: {
    runtimeUrlRef: string;
    queueUrlRef: string;
    statementTimeoutMs?: number;
    lockTimeoutMs?: number;
  };
  runtime: {
    businessEntry: string;
    mode: "ActionOnly";
    action?: {
      maxOperations?: number;
      maxDependencies?: number;
      intentExpirySeconds?: number;
    };
    queue?: {
      publishBatch?: number;
      pollIntervalMs?: number;
    };
    reconciliation?: {
      initialDelaySeconds?: number;
      maxDelaySeconds?: number;
    };
  };
  web: {
    enabled: false;
  };
  observability?: {
    projectTelemetry?: false;
  };
}
export interface ActionRef {
  type: "abh.action";
  id: UUID;
  version: Version;
}
export interface OperationRef {
  type: "abh.operation";
  id: UUID;
  version: Version;
}
export interface PlanRef {
  type: "abh.operation-plan";
  id: UUID;
  version: Version;
}
export interface DecisionRef {
  type: "abh.decision";
  id: UUID;
  version: Version;
}
export interface DecisionEffectRef {
  type: "abh.decision-effect";
  id: UUID;
  version: Version;
}
export interface CommandRef {
  type: "abh.command";
  id: UUID;
  version: Version;
}
export interface ArtifactRef {
  type: "abh.artifact";
  id: UUID;
  version: Version;
}
export interface PinSetRef {
  type: "abh.pin-set";
  id: UUID;
  version: Version;
}
export interface RequestRef {
  type: "abh.responsibility-request";
  id: UUID;
  version: Version;
}
export interface ResourceRequirement {
  resourceRef: {
    type: "abh.resource";
    id: UUID;
    version: Version;
  };
  quantity: NonnegativeDecimal;
  unit: RegisteredName;
}
export interface ImpactUpperBound {
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  resourceRequirements: ResourceRequirement[];
  /**
   * @minItems 0
   * @maxItems 20
   */
  maxMoney: {
    amount: NonnegativeDecimal;
    currency: string;
  }[];
  description: string;
}
export interface ProposeActionPayload {
  actionType: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  targetRefs: EntityRef[];
  payloadRef: ArtifactRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  sourceVersionRefs: EntityRef[];
  sourceProposalRef: EntityRef;
}
export interface ActionProposal {
  actionType: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  targetRefs: EntityRef[];
  payloadRef: ArtifactRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  sourceVersionRefs: EntityRef[];
  sourceProposalRef: EntityRef;
  completionPolicyRef: EntityRef;
  /**
   * @minItems 0
   * @maxItems 100
   */
  resourceRequirements: ResourceRequirement[];
}
export interface CancelActionPayload {
  reason: Reason;
}
export interface RequestAuthorizationPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  authorityRefs?: AuthorityRef[];
}
export interface ValidateActionPayload {
  domainValidationRef: EntityRef;
}
export interface RegisterOperationPlanPayload {
  pinSetRef: PinSetRef;
  pinSetDigest: Digest;
  planRef: PlanRef;
  planDigest: Digest;
  scopeProofRef: EntityRef;
}
export interface OperationInputBinding {
  inputPath: string;
  parentNodeKey: NodeKey;
  outputName: RegisteredName;
  valueType: RegisteredName;
}
export interface OperationPlanNode {
  nodeKey: NodeKey;
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  accountRef: EntityRef;
  resourceKey: RegisteredName;
  operationType: RegisteredName;
  payloadRef: ArtifactRef;
  payloadDigest: Digest;
  connectorRef: CapabilityRef & {
    kind: "Connector";
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  completionPolicyRef: EntityRef;
  /**
   * @minItems 0
   * @maxItems 100
   */
  resourceRequirements: ResourceRequirement[];
  /**
   * @minItems 0
   * @maxItems 32
   */
  dependsOn: NodeKey[];
  /**
   * @minItems 0
   * @maxItems 32
   */
  inputBindings: OperationInputBinding[];
  expectedExternalVersion?: string;
}
export interface OperationPlan {
  planRef: PlanRef;
  actionRef: ActionRef;
  planVersion: Version;
  pinSetRef: PinSetRef;
  pinSetDigest: Digest;
  validatedAgainstPayloadDigest: Digest;
  compilerRef: CapabilityRef & {
    kind: "Compiler";
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  connectorRefs: (CapabilityRef & {
    kind: "Connector";
    [k: string]: unknown;
  })[];
  scopeProofRef: EntityRef;
  completionPolicyRef: EntityRef;
  impactUpperBound: ImpactUpperBound;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  nodes: OperationPlanNode[];
  digest: Digest;
}
export interface ActionRecord {
  actionRef: ActionRef;
  resourceOrganizationId: UUID;
  missionRef?: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  runRef?: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  sourceCommandRef: CommandRef;
  proposedBy: Actor;
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  executionAuthorityRef?: AuthorityRef;
  pinSetRef?: PinSetRef;
  planRef?: PlanRef;
  actionType: RegisteredName;
  payloadArtifactRef: ArtifactRef;
  payloadDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  targetRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  inputVersionRefs: EntityRef[];
  completionPolicyRef: EntityRef;
  riskClass: RegisteredName;
  position: ActionPosition;
  cancellationRequestedAt?: Time;
  authorizationSnapshotRef?: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  resultRef?: {
    type: "abh.action-result";
    id: UUID;
    version: Version;
  };
}
export interface DecisionPackage {
  requestRef: RequestRef;
  routeRevision: Version;
  slotId: NodeKey;
  subjectRef: EntityRef;
  proposalDigest: Digest;
  question: string;
  recommendation: string;
  /**
   * @minItems 0
   * @maxItems 20
   */
  alternatives: string[];
  impactUpperBound: ImpactUpperBound;
  /**
   * @minItems 0
   * @maxItems 32
   */
  risks: string[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  validUntil: Time;
  /**
   * @minItems 1
   * @maxItems 2
   */
  allowedResponses: DecisionResponse[];
  packageDigest: Digest;
}
export interface WithdrawDecisionPayload {
  reason: Reason;
}
export interface DecisionEffectSummary {
  effectRef: DecisionEffectRef;
  status: DecisionEffectState;
  receiptRef?: EntityRef;
  failureRef?: EntityRef;
}
export interface DecisionView {
  decisionRef: DecisionRef;
  package: DecisionPackage;
  status: DecisionState;
  /**
   * @minItems 0
   * @maxItems 100
   */
  effectSummaries: DecisionEffectSummary[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  availableActions: RegisteredName[];
}
export interface AuthorizationSummary {
  authorityRef?: AuthorityRef;
  snapshotRef?: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  expiresAt?: Time;
  requestRef?: RequestRef;
}
export interface OperationSummary {
  operationRef: OperationRef;
  position: OperationPosition;
}
export interface ActionView {
  actionRef: ActionRef;
  actionType: RegisteredName;
  position: ActionPosition;
  authorizationSummary: AuthorizationSummary;
  /**
   * @minItems 0
   * @maxItems 1000
   */
  operationSummary: OperationSummary[];
  /**
   * @minItems 0
   * @maxItems 1000
   */
  unresolvedRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  availableActions: RegisteredName[];
}
export interface QueryMeta {
  nextCursor?: string;
  asOf: Time;
  watermark: string;
  stale: boolean;
}
export interface ActionQueryResponse {
  success: true;
  data: ActionView;
  meta: QueryMeta;
}
export interface DecisionQueryResponse {
  success: true;
  data: DecisionView;
  meta: QueryMeta;
}
export interface ActionListResponse {
  success: true;
  /**
   * @minItems 0
   * @maxItems 100
   */
  data: ActionView[];
  meta: QueryMeta;
}
export interface DecisionInboxResponse {
  success: true;
  /**
   * @minItems 0
   * @maxItems 100
   */
  data: DecisionView[];
  meta: QueryMeta;
}
export interface ActionAcceptedResponse {
  success: true;
  data: {
    objectRef: ActionRef;
    commandId: UUID;
    trackingRef: ActionRef;
  };
}
export interface DecisionSubmittedResponse {
  success: true;
  data: {
    objectRef: DecisionRef;
    commandId: UUID;
    status: DecisionResponse;
    /**
     * @minItems 0
     * @maxItems 100
     */
    effectTrackingRefs: DecisionEffectRef[];
  };
}
export interface DecisionWithdrawnResponse {
  success: true;
  data: {
    objectRef: DecisionRef;
    commandId: UUID;
    status: "Withdrawn";
  };
}
export interface EventChangeSummary {
  /**
   * @minItems 1
   * @maxItems 100
   */
  changedFields: string[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  factRefs: EntityRef[];
}
export interface JobEnvelope {
  jobType:
    | "abh.action.advance"
    | "abh.operation.reconcile"
    | "abh.decision.apply-effect"
    | "abh.operation.notify-wait"
    | "abh.pack-inspection-job.advance";
  targetRef: ActionRef | OperationRef | DecisionRef | PackInspectionJobRef;
  commandRef: CommandRef;
  dedupeKey: IdempotencyKey;
  notBefore: Time;
  deadline: Time;
  authorityRef?: AuthorityRef;
  causeRef: EntityRef;
}
export interface PackInspectionJobRef {
  type: "abh.pack-inspection-job";
  id: UUID;
  version: Version;
}
export interface InlineArtifactStoredResponse {
  success: true;
  data: {
    objectRef: {
      type: "abh.artifact";
      id: UUID;
      version: 2;
    };
    commandId: UUID;
  };
}
export interface RequestContextRef {
  type: "abh.request-context";
  id: UUID;
  version: Version;
}
export interface AuthorizedContextRef {
  type: "abh.authorized-context";
  id: UUID;
  version: Version;
}
export interface CredentialRef {
  type: "abh.credential";
  id: UUID;
  version: Version;
}
export interface JobRef {
  type: "abh.job";
  id: UUID;
  version: Version;
}
export interface WaitRef {
  type: "abh.durable-wait";
  id: UUID;
  version: Version;
}
export interface StoredObjectRef {
  type: "abh.stored-object";
  id: UUID;
  version: Version;
}
export interface PortCallContext {
  callId: UUID;
  requestContextRef: RequestContextRef;
  target: Target;
  deadline: Time;
}
export interface IdentityVerifyRequest {
  callId: UUID;
  credentialRef: CredentialRef;
  issuer: string;
  audience: string;
  deadline: Time;
}
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  audience: string;
  identityKind: "Human" | "Service";
  authnStrength: AuthenticationStrength;
  credentialEpoch: number;
  verifiedAt: Time;
  expiresAt: Time;
  evidenceRef: {
    type: "abh.identity-evidence";
    id: UUID;
    version: Version;
  };
}
export interface EnqueueJobRequest {
  context: PortCallContext;
  job: JobEnvelope;
}
export interface EnqueuedJob {
  jobRef: JobRef;
}
export interface ScheduleWakeupRequest {
  context: PortCallContext;
  ownerRef: EntityRef;
  waitKey: IdempotencyKey;
  dueAt: Time;
  causeRef: EntityRef;
}
export interface ScheduledWakeup {
  waitRef: WaitRef;
}
export interface CancelWakeupRequest {
  context: PortCallContext;
  waitRef: WaitRef;
  expectedVersion: Version;
  reason: Reason;
}
export interface CancelledWakeup {
  waitRef: WaitRef;
  disposition: "Prevented" | "AlreadyClaimed" | "AlreadyTerminal";
  receiptRef: EntityRef;
}
export interface SignalWaitRequest {
  context: PortCallContext;
  ownerRef: EntityRef;
  committedEventRef: {
    type: "abh.event";
    id: UUID;
    version: Version;
  };
  waitKey: IdempotencyKey;
}
export interface SignalledWait {
  waitRef: WaitRef;
  wakeupRef: EntityRef;
}
export interface InspectDeliveryRequest {
  context: PortCallContext;
  subjectRef: JobRef | WaitRef;
}
export interface DeliveryInspection {
  subjectRef: JobRef | WaitRef;
  queueAgeMs: number;
  deliveryCount: number;
  lastErrorCategory?:
    | "Validation"
    | "Authentication"
    | "Authorization"
    | "NotFound"
    | "Conflict"
    | "Precondition"
    | "Capacity"
    | "Dependency"
    | "Internal";
  ownerResultRef?: EntityRef;
}
export interface DrainQueueRequest {
  context: PortCallContext;
  /**
   * @minItems 1
   * @maxItems 4
   */
  queueClasses: ("control" | "reconcile" | "interactive" | "background")[];
}
export interface DrainReport {
  drained: boolean;
  /**
   * @minItems 0
   * @maxItems 1000
   */
  remainingRefs: EntityRef[];
  completedAt: Time;
}
export interface ObjectDescriptor {
  objectRef: StoredObjectRef;
  digest: Digest;
  sizeBytes: number;
  mediaType: string;
}
export interface PutObjectRequest {
  context: PortCallContext;
  authorizedContextRef: AuthorizedContextRef;
  stagedArtifactRef: ArtifactRef;
  digest: Digest;
  sizeBytes: number;
  mediaType: string;
  idempotencyKey: IdempotencyKey;
}
export interface ReadObjectRequest {
  context: PortCallContext;
  authorizedContextRef: AuthorizedContextRef;
  objectRef: StoredObjectRef;
  range?: {
    start: number;
    endInclusive: number;
  };
}
export interface ReadObjectDescriptor {
  object: ObjectDescriptor;
  range?: {
    start: number;
    endInclusive: number;
  };
}
export interface StatObjectRequest {
  context: PortCallContext;
  authorizedContextRef: AuthorizedContextRef;
  objectRef: StoredObjectRef;
}
export interface DeleteObjectRequest {
  context: PortCallContext;
  authorizedContextRef: AuthorizedContextRef;
  objectRef: StoredObjectRef;
  deletionProofRef: {
    type: "abh.deletion-proof";
    id: UUID;
    version: Version;
  };
  idempotencyKey: IdempotencyKey;
}
export interface DeletedObject {
  objectRef: StoredObjectRef;
  receiptRef: EntityRef;
}
export interface ObjectTypeRegistration {
  name: RegisteredName;
  scopeKind: "None" | "Organization" | "Workspace" | "Object";
  description: string;
}
export interface PurposeRegistration {
  name: RegisteredName;
  description: string;
}
export interface ActionTypeRegistration {
  name: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  targetTypes: RegisteredName[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeNames: RegisteredName[];
  description: string;
}
export interface CatalogExtension {
  namespace: string;
  version: ExactVersion;
  /**
   * @minItems 0
   * @maxItems 100
   */
  objectTypes: ObjectTypeRegistration[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  actions: ActionTypeRegistration[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  purposes: PurposeRegistration[];
}
export interface PackFileEntry {
  ref: PackPath;
  digest: Digest;
  mediaType: string;
  sizeBytes: number;
}
export interface PackCapabilityReference {
  kind: RegisteredName;
  id: RegisteredName;
  version: ExactVersion;
}
export interface PackCapabilityRequirement {
  kind: RegisteredName;
  id: RegisteredName;
  versionRange: string;
}
export interface PackManifest {
  apiVersion: "abh.open/v1";
  kind: "DomainPack" | "ConnectorPack" | "RuntimeAdapter" | "WorkbenchExtension";
  metadata: {
    id: string;
    version: ExactVersion;
    license: string;
  };
  compatibility: {
    abh: string;
  };
  trust: {
    mode: "Declarative" | "TrustedCode" | "Isolated";
  };
  capabilities: {
    /**
     * @maxItems 1000
     */
    provides: PackCapabilityReference[];
    /**
     * @maxItems 1000
     */
    requires: PackCapabilityRequirement[];
  };
  permissions: {
    /**
     * @maxItems 1000
     */
    dataClasses: RegisteredName[];
    /**
     * @maxItems 1000
     */
    purposes: RegisteredName[];
    /**
     * @maxItems 1000
     */
    commands: RegisteredName[];
    /**
     * @maxItems 1000
     */
    toolCapabilities: RegisteredName[];
    /**
     * @maxItems 1000
     */
    networkEgress: string[];
    /**
     * @maxItems 1000
     */
    secretClasses: RegisteredName[];
  };
  resources: PackResources;
  /**
   * @maxItems 1000
   */
  artifacts: PackFileEntry[];
  /**
   * @maxItems 1000
   */
  migrations: PackFileEntry[];
  conformance: {
    suiteVersion: ExactVersion;
  };
  integrity: {
    manifestDigest: Digest;
    artifactSetDigest: Digest;
    packageDigest: Digest;
    signatureFormat: "application/vnd.dev.sigstore.bundle.v0.3+json";
    signatureRef: PackPath;
    provenanceRef: PackPath;
    conformanceRef: PackPath;
  };
}
export interface ConformanceCaseResult {
  caseId: RegisteredName;
  status: "Passed" | "Failed" | "Skipped" | "NotRun";
  /**
   * @maxItems 100
   */
  artifactRefs: EntityRef[];
  reason: string | null;
}
export interface ConformanceCapabilityClaim {
  kind: RegisteredName;
  id: RegisteredName;
  version: ExactVersion;
  claimed: boolean;
}
export interface ConformanceEnvironment {
  profile: "Core" | "Domain" | "Connector" | "Adapter" | "Workbench";
  environmentDigest: Digest;
  fixtureSetDigest: Digest;
  seed: string;
}
export interface ConformanceReport {
  subjectDigest: Digest;
  suiteVersion: ExactVersion;
  status: "Complete" | "Incomplete";
  /**
   * @maxItems 10000
   */
  caseResults: ConformanceCaseResult[];
  /**
   * @maxItems 1000
   */
  claimedCapabilities: ConformanceCapabilityClaim[];
  /**
   * @maxItems 1000
   */
  knownDeviations: {
    caseId: RegisteredName;
    reason: string;
  }[];
  environment: ConformanceEnvironment;
  startedAt: Time;
  finishedAt: Time;
  /**
   * @maxItems 1000
   */
  artifactRefs: EntityRef[];
  reportDigest: Digest;
  signatureRef: PackPath;
}
export interface PackValidationReport {
  packId: RegisteredName;
  packVersion: ExactVersion;
  subjectDigest: Digest;
  manifestDigest: Digest;
  artifactSetDigest: Digest;
  deploymentPolicyDigest: Digest;
  signatureBundleDigest: Digest;
  provenanceBundleDigest: Digest;
  conformanceBundleDigest: Digest;
  conformanceReportDigest: Digest;
  validatedAt: Time;
  validUntil: Time;
  profile: "LocalOfflinePublicKey";
  reportDigest: Digest;
}
export interface PackDeploymentPolicy {
  abhVersion: ExactVersion;
  packId: RegisteredName;
  /**
   * @maxItems 3
   */
  allowedModes: ("Declarative" | "TrustedCode" | "Isolated")[];
  /**
   * @maxItems 1000
   */
  allowedLicenses: string[];
  permissions: {
    /**
     * @maxItems 1000
     */
    dataClasses: RegisteredName[];
    /**
     * @maxItems 1000
     */
    purposes: RegisteredName[];
    /**
     * @maxItems 1000
     */
    commands: RegisteredName[];
    /**
     * @maxItems 1000
     */
    toolCapabilities: RegisteredName[];
    /**
     * @maxItems 1000
     */
    networkEgress: string[];
    /**
     * @maxItems 1000
     */
    secretClasses: RegisteredName[];
  };
  /**
   * @maxItems 1000
   */
  hostProfileRefs: EntityRef[];
  /**
   * @maxItems 1000
   */
  sharedNamespaces: RegisteredName[];
  isolated?: {
    available: boolean;
    limits: {
      cpuMillis: number;
      memoryBytes: number;
      processes: number;
      temporaryDiskBytes: number;
      outputBytes: number;
      wallTimeMs: number;
    };
  };
}
export interface PackSignerPolicy {
  executable: string;
  mode: "OfflinePublicKey";
  publicKeyPem: string;
  packId: RegisteredName;
}
export interface PackProvenancePolicy {
  executable: string;
  mode: "OfflinePublicKey";
  publicKeyPem: string;
  packId: RegisteredName;
  subjectName: string;
  builderId: string;
  buildType: string;
  source: {
    uri: string;
    digest: {
      [k: string]: string;
    };
  };
}
export interface PackConformancePolicy {
  executable: string;
  mode: "OfflinePublicKey";
  publicKeyPem: string;
  packId: RegisteredName;
  subjectName: string;
  suiteVersion: ExactVersion;
  environment: ConformanceEnvironment;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  cases: {
    caseId: RegisteredName;
    status: "Passed" | "Skipped";
  }[];
  /**
   * @maxItems 1000
   */
  claimedCapabilities: ConformanceCapabilityClaim[];
  maxAgeMs: number;
}
export interface PackGovernanceSnapshot {
  policyRef: {
    type: "abh.pack-trust-policy";
    id: UUID;
    version: Version;
  };
  policy: PackDeploymentPolicy;
  trust: {
    signer: PackSignerPolicy;
    provenance: PackProvenancePolicy;
    conformance: PackConformancePolicy;
  };
  /**
   * @maxItems 10000
   */
  revokedPackIds: RegisteredName[];
  /**
   * @maxItems 10000
   */
  revokedDigests: Digest[];
  /**
   * @maxItems 10000
   */
  reservedVersions: {
    packId: RegisteredName;
    version: ExactVersion;
    packageDigest: Digest;
  }[];
}
export interface SignedTrustPolicyDocument {
  organizationId: UUID;
  issuedAt: Time;
  expiresAt: Time;
  snapshot: PackGovernanceSnapshot;
}
export interface PackDataDefinition {
  kind: "Schema" | "Projection" | "DataTransform";
  id: RegisteredName;
  digest: Digest;
}
export interface PackDataInventory {
  complete: boolean;
  /**
   * @maxItems 10000
   */
  entries: PackDataDefinition[];
}
export interface PackDataChange {
  kind: "Schema" | "Projection" | "DataTransform";
  id: RegisteredName;
  change: "Added" | "Changed" | "Removed";
  beforeDigest?: Digest;
  afterDigest?: Digest;
}
export interface PackDataImpact {
  subjectDigest: Digest;
  baselineDigest: Digest;
  targetDigest: Digest;
  status: "NotApplicable" | "Required" | "Incomplete";
  /**
   * @maxItems 20000
   */
  changes: PackDataChange[];
  /**
   * @maxItems 10000
   */
  migrationRefs: PackPath[];
  /**
   * @maxItems 3
   */
  reasons: ("InventoryIncomplete" | "DefinitionsChanged" | "DeclaredMigrations")[];
}
export interface PackSchemaOwnership {
  packId: RegisteredName;
  schemaName: string;
  databaseRole: string;
}
export interface PackMigrationStep {
  ref: PackPath;
  digest: Digest;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  schemas: string[];
  databaseRole: string;
  phase: "Expand" | "Backfill" | "Contract";
  transactional: boolean;
  /**
   * @minItems 1
   * @maxItems 4
   */
  operations: ("Create" | "Alter" | "Drop" | "DataWrite")[];
  reviewRef: EntityRef;
  dryRunRef: EntityRef;
  safetyPointRef: EntityRef;
  recoveryPlanRef: EntityRef;
  compatibilityRef: EntityRef;
  retirementRef?: EntityRef;
}
export interface PackMigrationEvidence {
  organizationId: UUID;
  packageDigest: Digest;
  stepDigest: Digest;
  environmentDigest: Digest;
  deploymentVersion: number;
  kind: "Review" | "DryRun" | "SafetyPoint" | "RecoveryPlan" | "Compatibility" | "Retirement";
  status: "Passed" | "Failed";
  issuedAt: Time;
  expiresAt: Time;
  /**
   * @minItems 1
   * @maxItems 100
   */
  supportingRefs: EntityRef[];
}
export interface PackMigrationAttemptRecord {
  attemptRef: {
    type: "abh.pack-migration-attempt";
    id: UUID;
    version: 1;
  };
  organizationId: UUID;
  packId: string;
  packVersion: ExactVersion;
  packageDigest: Digest;
  step: PackMigrationStep;
  stepDigest: Digest;
  environmentDigest: Digest;
  deploymentVersion: number;
  impactRef: EntityRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  claimedAt: Time;
}
export interface PackMigrationObservationRecord {
  observationRef: {
    type: "abh.pack-migration-observation";
    id: UUID;
    version: 1;
  };
  attemptRef: {
    type: "abh.pack-migration-attempt";
    id: UUID;
    version: 1;
  };
  kind: "CommitAcknowledged" | "OutcomeUnknown";
  evidenceRef: EntityRef;
  observedAt: Time;
}
export interface PackMigrationExecutionResult {
  kind: "CommitAcknowledged" | "OutcomeUnknown";
  sqlStarted: boolean;
  connectionClosed: boolean;
}
export interface PackMigrationExecutionRecord {
  attempt: PackMigrationAttemptRecord;
  result: PackMigrationExecutionResult;
  observedAt: Time;
}
/**
 * Exact organization, package, migration plan and expected structure binding; not migration completion authority.
 */
export interface PackMigrationStructureBinding {
  organizationId: UUID;
  packId: string;
  packVersion: ExactVersion;
  packageDigest: Digest;
  planDigest: Digest;
  expectedDigest: Digest;
}
/**
 * Signed structural expectation metadata. Does not assert actual database correctness or authorize Enable.
 */
export interface PackMigrationStructureReport {
  binding: PackMigrationStructureBinding;
  environmentDigest: Digest;
  deploymentVersion: number;
  issuedAt: Time;
  expiresAt: Time;
}
/**
 * Exact organization, package, migration plan and declared data invariant binding; not complete domain verification or Enable authority.
 */
export interface PackMigrationDataBinding {
  kind: "DataInvariants";
  organizationId: UUID;
  packId: string;
  packVersion: ExactVersion;
  packageDigest: Digest;
  planDigest: Digest;
  expectedDigest: Digest;
}
/**
 * Signed declared data invariant expectation metadata. Does not assert actual data correctness or authorize Enable.
 */
export interface PackMigrationDataReport {
  binding: PackMigrationDataBinding;
  environmentDigest: Digest;
  deploymentVersion: number;
  issuedAt: Time;
  expiresAt: Time;
}
/**
 * Actual declared data invariant observation. Signature describes the expected report, not a signature over actual rows. Validation checks representation and consistency only, never live database facts, provenance or Enable authorization.
 */
export interface PackMigrationDataObservation {
  result: PackMigrationDataObservationResult;
  observedAt: Time;
}
export interface PackMigrationDataObservationResult {
  matched: boolean;
  expectedDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  results: {
    schema: string;
    table: string;
    /**
     * Exact nonnegative PostgreSQL bigint count; never a floating-point number.
     */
    rowCount: string;
    /**
     * @minItems 0
     * @maxItems 100
     */
    nulls: {
      column: string;
      /**
       * Exact nonnegative PostgreSQL bigint count; never a floating-point number.
       */
      count: string;
    }[];
    /**
     * @minItems 0
     * @maxItems 20
     */
    duplicates: {
      /**
       * @minItems 1
       * @maxItems 16
       */
      columns: string[];
      /**
       * Exact nonnegative PostgreSQL bigint count; never a floating-point number.
       */
      groups: string;
    }[];
    matched: boolean;
  }[];
  binding: PackMigrationDataBinding;
  reportRef: EntityRef;
  bundleRef: EntityRef;
  signature: {
    report: PackMigrationDataReport;
    keyDigest: Digest;
    bundleDigest: Digest;
    verifiedAt: Time;
  };
}
/**
 * Actual bounded structural or combined inspection evidence. Validation proves representation and consistency only, not database facts, producer provenance, complete migration verification or Enable authority.
 */
export interface PackMigrationStructureObservation {
  result: PackMigrationStructureObservationResult;
  observedAt: Time;
}
export interface PackMigrationStructureObservationResult {
  matched: boolean;
  /**
   * @minItems 0
   * @maxItems 1000000
   */
  requiresAdditionalVerification: {
    schema: string;
    name: string;
    kind: "v" | "m" | "f";
  }[];
  expectedDigest: Digest;
  inventory: {
    matched: boolean;
    expectedDigest: Digest;
    /**
     * @minItems 1
     * @maxItems 100
     */
    results: {
      schema: string;
      /**
       * @minItems 0
       * @maxItems 10000
       */
      actual: {
        name: string;
        kind: "r" | "p" | "v" | "m" | "f" | "S";
      }[];
      /**
       * @minItems 0
       * @maxItems 10000
       */
      missing: {
        name: string;
        kind: "r" | "p" | "v" | "m" | "f" | "S";
      }[];
      /**
       * @minItems 0
       * @maxItems 10000
       */
      unexpected: {
        name: string;
        kind: "r" | "p" | "v" | "m" | "f" | "S";
      }[];
      /**
       * @minItems 0
       * @maxItems 10000
       */
      changed: {
        name: string;
        expectedKind: "r" | "p" | "v" | "m" | "f" | "S";
        actualKind: "r" | "p" | "v" | "m" | "f" | "S";
      }[];
    }[];
  };
  tables: {
    matched: boolean;
    expectedDigest: Digest;
    /**
     * @minItems 1
     * @maxItems 100
     */
    results: {
      schema: string;
      name: string;
      actual: {
        schema: string;
        name: string;
        owner: string;
        kind: "r" | "p";
        rls: boolean;
        forceRls: boolean;
        partition: {
          key: string | null;
          bound: string | null;
          /**
           * @minItems 0
           * @maxItems 100
           */
          parents: {
            schema: string;
            name: string;
            detachPending: boolean;
          }[];
        };
        /**
         * @minItems 0
         * @maxItems 1600
         */
        columns: {
          name: string;
          typeSchema: string;
          typeName: string;
          typeModifier: number;
          notNull: boolean;
          identity: "" | "a" | "d";
          generated: "" | "s";
          defaultExpression: string | null;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        indexes: {
          name: string;
          definition: string;
          valid: boolean;
          ready: boolean;
          live: boolean;
          unique: boolean;
          primary: boolean;
          replicaIdentity: boolean;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        policies: {
          name: string;
          command: "*" | "r" | "a" | "w" | "d";
          permissive: boolean;
          /**
           * @minItems 1
           * @maxItems 1000
           */
          roles: string[];
          using: string | null;
          check: string | null;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        triggers: {
          name: string;
          definition: string;
          enabled: "O" | "D" | "R" | "A";
          functionDigest: Digest;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        constraints: {
          name: string;
          type: "c" | "f" | "p" | "u" | "t" | "x";
          definition: string;
          validated: boolean;
          deferrable: boolean;
          initiallyDeferred: boolean;
        }[];
      } | null;
      /**
       * @minItems 0
       * @maxItems 11
       */
      differences: (
        | "existence"
        | "owner"
        | "kind"
        | "rls"
        | "forceRls"
        | "columns"
        | "constraints"
        | "indexes"
        | "policies"
        | "triggers"
        | "partition"
      )[];
    }[];
  } | null;
  sequences: {
    matched: boolean;
    expectedDigest: Digest;
    /**
     * @minItems 1
     * @maxItems 100
     */
    results: {
      schema: string;
      name: string;
      actual: {
        schema: string;
        name: string;
        owner: string;
        typeSchema: string;
        typeName: "int2" | "int4" | "int8";
        start: string;
        increment: string;
        minimum: string;
        maximum: string;
        cache: string;
        cycle: boolean;
        ownedBy: {
          schema: string;
          table: string;
          column: string;
          dependency: "a" | "i";
        } | null;
      } | null;
      /**
       * @minItems 0
       * @maxItems 11
       */
      differences: (
        | "existence"
        | "owner"
        | "typeSchema"
        | "typeName"
        | "start"
        | "increment"
        | "minimum"
        | "maximum"
        | "cache"
        | "cycle"
        | "ownedBy"
      )[];
    }[];
  } | null;
  views: {
    matched: boolean;
    expectedDigest: Digest;
    /**
     * @minItems 1
     * @maxItems 100
     */
    results: {
      schema: string;
      name: string;
      actual: {
        schema: string;
        name: string;
        owner: string;
        kind: "v" | "m";
        definition: string;
        /**
         * @minItems 0
         * @maxItems 1000
         */
        options: string[];
        populated: boolean;
        /**
         * @minItems 0
         * @maxItems 1000
         */
        indexes: {
          name: string;
          definition: string;
          valid: boolean;
          ready: boolean;
          live: boolean;
          unique: boolean;
          primary: boolean;
          replicaIdentity: boolean;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        triggers: {
          name: string;
          definition: string;
          enabled: "O" | "D" | "R" | "A";
          functionDigest: Digest;
        }[];
        /**
         * @minItems 0
         * @maxItems 1000
         */
        rules: {
          name: string;
          definition: string;
          enabled: "O" | "D" | "R" | "A";
        }[];
        /**
         * @minItems 0
         * @maxItems 1600
         */
        columns: {
          name: string;
          typeSchema: string;
          typeName: string;
          typeModifier: number;
        }[];
      } | null;
      /**
       * @minItems 0
       * @maxItems 10
       */
      differences: (
        | "existence"
        | "owner"
        | "kind"
        | "definition"
        | "options"
        | "populated"
        | "columns"
        | "indexes"
        | "triggers"
        | "rules"
      )[];
    }[];
  } | null;
  acl: {
    matched: boolean;
    expectedDigest: Digest;
    /**
     * @minItems 1
     * @maxItems 100
     */
    results: {
      schema: string;
      name: string;
      kind: "r" | "p" | "v" | "m" | "f" | "S";
      /**
       * @minItems 0
       * @maxItems 10000
       */
      actual: {
        column: string | null;
        grantor: string;
        grantee: string;
        privilege: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER" | "USAGE";
        grantable: boolean;
      }[];
      /**
       * @minItems 0
       * @maxItems 10000
       */
      missing: {
        column: string | null;
        grantor: string;
        grantee: string;
        privilege: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER" | "USAGE";
        grantable: boolean;
      }[];
      /**
       * @minItems 0
       * @maxItems 10000
       */
      unexpected: {
        column: string | null;
        grantor: string;
        grantee: string;
        privilege: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER" | "USAGE";
        grantable: boolean;
      }[];
    }[];
  } | null;
  binding: PackMigrationStructureBinding;
  reportRef: EntityRef;
  bundleRef: EntityRef;
  signature: {
    report: PackMigrationStructureReport;
    keyDigest: Digest;
    bundleDigest: Digest;
    verifiedAt: Time;
  };
}
/**
 * Actual bounded structural or combined inspection evidence. Validation proves representation and consistency only, not database facts, producer provenance, complete migration verification or Enable authority.
 */
export interface PackMigrationStateObservation {
  result: {
    matched: boolean;
    structure: PackMigrationStructureObservationResult;
    data: PackMigrationDataObservationResult;
  };
  observedAt: Time;
}
export interface OrganizationRecord {
  organizationRef: {
    type: "abh.organization";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  name: string;
  homeRegion: string;
  status: AccessRecordState;
}
export interface PrincipalRecord {
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  displayName: string;
  identityKind: "Human" | "Service";
  status: AccessRecordState;
  credentialEpoch: number;
}
export interface MembershipRecord {
  membershipRef: {
    type: "abh.membership";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  status: AccessRecordState;
  membershipEpoch: Version;
}
export interface GrantRecord {
  grantRef: {
    type: "abh.grant";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  actionTypes: RegisteredName[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeNames: RegisteredName[];
  validFrom: Time;
  validUntil: Time;
  issuanceEvidenceRef: EntityRef;
  status: GrantState;
}
export interface LedgerRecord {
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  scopeRef: EntityRef;
  resourceType: RegisteredName;
  meteringMode: "cumulative" | "capacity";
  unit: RegisteredName;
  currency?: string;
  periodRef: {
    type: "abh.period";
    id: UUID;
    version: Version;
  };
  limit: NonnegativeDecimal;
  confirmedUsage: NonnegativeDecimal;
  heldReservation: NonnegativeDecimal;
  openCommitment: NonnegativeDecimal;
  status: LedgerState;
}
export interface ReservationRecord {
  reservationRef: {
    type: "abh.reservation";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  requestRef: EntityRef;
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  amount: NonnegativeDecimal;
  expiresAt: Time;
  bindingRef: EntityRef;
  status: ReservationState;
}
export interface AuditRecord {
  auditRef: {
    type: "abh.audit";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actingOrganizationId: UUID;
  actor: Actor;
  action: RegisteredName;
  targetRef: EntityRef;
  outcome: RegisteredName;
  /**
   * @minItems 0
   * @maxItems 100
   */
  relatedRefs: EntityRef[];
  digest: Digest;
  recordedAt: Time;
  correlationId: UUID;
}
export interface CommandReceipt {
  commandRef: CommandRef;
  resourceOrganizationId: UUID;
  actorPrincipalId: UUID;
  commandType: RegisteredName;
  idempotencyKey: IdempotencyKey;
  inputDigest: Digest;
  resultRef: EntityRef;
  committedAt: Time;
}
export interface ArtifactRecord {
  artifactRef: ArtifactRef;
  resourceOrganizationId: UUID;
  ownerRef: EntityRef;
  mediaType: string;
  sizeBytes: number;
  contentDigest: Digest;
  status: ArtifactState;
  dataClass: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeNames: RegisteredName[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  sourceRefs: EntityRef[];
  region: string;
  retentionPolicyRef: EntityRef;
}
export interface FenceRecord {
  fenceRef: {
    type: "abh.fence";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  scopeRef: EntityRef;
  epoch: Version;
  stopFlag: boolean;
}
export interface LedgerEntryRecord {
  entryRef: {
    type: "abh.ledger-entry";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  entryKey: IdempotencyKey;
  kind:
    | "Configure"
    | "Reserve"
    | "Consume"
    | "Release"
    | "OpenCommitment"
    | "AdjustCommitment"
    | "Settle"
    | "Correct"
    | "Freeze";
  limitDelta: Decimal;
  usageDelta: Decimal;
  heldDelta: Decimal;
  commitmentDelta: Decimal;
  sourceRef: EntityRef;
  /**
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  effectiveAt: Time;
  recordedAt: Time;
}
export interface ConfigureLedgerPayload {
  scopeRef: EntityRef;
  resourceType: RegisteredName;
  meteringMode: "cumulative" | "capacity";
  unit: RegisteredName;
  currency?: string;
  periodRef: {
    type: "abh.period";
    id: UUID;
    version: Version;
  };
  limit: NonnegativeDecimal;
  /**
   * @minItems 1
   * @maxItems 100
   */
  approvalRefs: EntityRef[];
  purposeNames?: LifecyclePurposeNames;
}
export interface ReserveAllPayload {
  requestRef: EntityRef;
  bindingRef: EntityRef;
  authorityRef: AuthorityRef;
  expiresAt: Time;
  /**
   * @minItems 1
   * @maxItems 64
   */
  requirements: LedgerReservationRequirement[];
}
export interface LedgerReservationRequirement {
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  amount: NonnegativeDecimal;
}
export interface ConsumeReservationPayload {
  actualUsage: NonnegativeDecimal;
  receiptRef: EntityRef;
}
export interface ReleaseReservationPayload {
  noEffectOrCompletionEvidenceRef: EntityRef;
}
export interface IdentityLocationRecord {
  identityDigest: Digest;
  resourceOrganizationId: UUID;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
}
export interface RevokeGrantPayload {
  reason: Reason;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface WorkspaceRecord {
  workspaceRef: {
    type: "abh.workspace";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  /**
   * @minItems 2
   * @maxItems 100
   */
  participantOrganizationRefs: {
    type: "abh.organization";
    id: UUID;
    version: Version;
  }[];
  scopeContractRef: EntityRef;
  /**
   * @minItems 2
   * @maxItems 100
   */
  consentEvidenceRefs: EntityRef[];
  status: AccessRecordState;
  scopeEpoch: Version;
  validUntil: Time;
}
export interface ReleaseRecord {
  releaseRef: {
    type: "abh.release";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  /**
   * @minItems 1
   * @maxItems 32
   */
  assets: ReleaseBehaviorAsset[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  gateRefs: EntityRef[];
  compatibilityRef: EntityRef;
  status: ReleaseState;
}
export interface ReleaseBehaviorAsset {
  behaviorSlot: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  capabilityExactRefs: CapabilityRef[];
}
export interface StaticAssignmentRecord {
  assignmentRef: {
    type: "abh.assignment";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  releaseRef: {
    type: "abh.release";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  scopeTier: "Object" | "Workspace" | "Organization" | "DomainDefault";
  status: AssignmentState;
  selectable: boolean;
  executionAllowed: boolean;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface ConfigureStaticReleasePayload {
  release: ReleaseRecord;
  assignment: StaticAssignmentRecord;
  purposeNames?: LifecyclePurposeNames;
}
export interface ResolveStaticPinsPayload {
  subjectRef: SubjectRef;
  subjectInputDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 32
   */
  requiredBehaviorSlots: RegisteredName[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  verifiedScope: EntityRef[];
  requestContextRef: {
    type: "abh.request-context";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  preparationAuthorityRefs: (
    | AuthorityRef
    | {
        type: "abh.grant";
        id: UUID;
        version: Version;
      }
  )[];
}
export interface StopStaticAssignmentPayload {
  evidenceRef: EntityRef;
  reason: Reason;
}
export interface StoreInlineArtifactPayload {
  ownerRef: EntityRef;
  mediaType: string;
  dataClass: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeNames: RegisteredName[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  sourceRefs: EntityRef[];
  region: string;
  retentionPolicyRef: EntityRef;
  content: string;
}
export interface TombstoneArtifactPayload {
  reason: Reason;
  evidenceRef: EntityRef;
}
export interface CommitmentRecord {
  commitmentRef: {
    type: "abh.commitment";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  subjectRef: EntityRef;
  policyRef: EntityRef;
  upperBound: NonnegativeDecimal;
  remaining: NonnegativeDecimal;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  status: CommitmentState;
}
export interface SettlementRecord {
  settlementRef: {
    type: "abh.settlement";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  commitmentRef: {
    type: "abh.commitment";
    id: UUID;
    version: Version;
  };
  sourceRef: EntityRef;
  usageAmount: NonnegativeDecimal;
  commitmentDelta: Decimal;
  inputDigest: Digest;
  recordedAt: Time;
  overrunAmount: NonnegativeDecimal;
}
export interface OpenCommitmentPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  reservationRefs: {
    type: "abh.reservation";
    id: UUID;
    version: Version;
  }[];
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  subjectRef: EntityRef;
  policyRef: EntityRef;
  upperBound: NonnegativeDecimal;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface SettleCommitmentPayload {
  sourceRef: EntityRef;
  actualUsage: NonnegativeDecimal;
}
export interface AdjustCommitmentPayload {
  newUpperBound: NonnegativeDecimal;
  evidenceRef: EntityRef;
}
export interface BeginCloseCommitmentPayload {
  tailBound: NonnegativeDecimal;
  evidenceRef: EntityRef;
}
export interface CloseCommitmentPayload {
  evidenceRef: EntityRef;
}
export interface ResponsibilityAssignmentRecord {
  responsibilityRef: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  responsibilityType: "Goal" | "Authorization" | "Correction" | "Exception";
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  validFrom: Time;
  validUntil: Time;
  templateRef: EntityRef;
  status: AccessRecordState;
}
export interface ResponsibilitySeat {
  seatId: NodeKey;
  /**
   * @minItems 1
   * @maxItems 100
   */
  responsibilityRefs: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  }[];
}
export interface ResponsibilitySlot {
  slotId: NodeKey;
  responsibilityType: "Goal" | "Authorization" | "Correction" | "Exception";
  responsibleOrganizationId: UUID;
  selectionMode: "ANY" | "ALL";
  required: boolean;
  /**
   * @minItems 1
   * @maxItems 32
   */
  seats: ResponsibilitySeat[];
  /**
   * @minItems 0
   * @maxItems 32
   */
  dependsOnSlotIds: NodeKey[];
}
export interface ResponsibilityRequestRecord {
  requestRef: RequestRef;
  resourceOrganizationId: UUID;
  kind: "Goal" | "Authorization" | "Correction" | "Exception";
  subjectRef: EntityRef;
  proposalDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 32
   */
  requiredSlots: ResponsibilitySlot[];
  routeRevision: Version;
  /**
   * @minItems 0
   * @maxItems 100
   */
  decisionRefs: DecisionRef[];
  expiresAt: Time;
  status: ResponsibilityRequestState;
}
export interface DecisionRecord {
  decisionRef: DecisionRef;
  resourceOrganizationId: UUID;
  package: DecisionPackage;
  seatId: NodeKey;
  /**
   * @minItems 1
   * @maxItems 100
   */
  candidateResponsibilityRefs: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  }[];
  status: DecisionState;
  respondedBy?: Actor;
  responsibilityRef?: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  decisionGrantRefs?: {
    type: "abh.grant";
    id: UUID;
    version: Version;
  }[];
  submission?: SubmitDecisionPayload;
  decidedAt?: Time;
}
export interface RequestCompletionEvidence {
  completionEvidenceRef: {
    type: "abh.request-completion-evidence";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  requestRef: RequestRef;
  routeRevision: Version;
  subjectRef: EntityRef;
  proposalDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  decisionRefs: DecisionRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  conditionRefs: {
    type: "abh.condition";
    id: UUID;
    version: Version;
  }[];
  recordedAt: Time;
}
export interface OpenResponsibilityRequestPayload {
  request: ResponsibilityRequestRecord;
  /**
   * @minItems 1
   * @maxItems 100
   */
  packages: DecisionPackage[];
}
export interface AssignResponsibilityPayload {
  responsibilityRef: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  responsibilityType: "Goal" | "Authorization" | "Correction" | "Exception";
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  validFrom: Time;
  validUntil: Time;
  templateRef: EntityRef;
  status: AccessRecordState;
}
export interface IssueExecutionAuthorityPayload {
  authority: ExecutionAuthority;
  serviceGrant: GrantRecord;
}
export interface OperationRecord {
  operationRef: OperationRef;
  resourceOrganizationId: UUID;
  actionRef: ActionRef;
  planRef: PlanRef;
  nodeKey: NodeKey;
  providerIdempotencyKey: IdempotencyKey;
  position: OperationPosition;
  attemptCount: number;
  reconciliationRef?: EntityRef;
}
export interface OperationReceiptRecord {
  receiptRef: {
    type: "abh.operation-receipt";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  operationRef: OperationRef;
  receiptKey: IdempotencyKey;
  rawArtifactRef: ArtifactRef;
  normalizedObservationRef: EntityRef;
  observedAt: Time;
  inputDigest: Digest;
}
export interface OperationReconciliationRecord {
  reconciliationRef: {
    type: "abh.reconciliation";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  operationRef: OperationRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  observationRefs: EntityRef[];
  comparisonRuleRef: EntityRef;
  verdict: "ConfirmedSuccess" | "ConfirmedNoEffect" | "Pending" | "Ambiguous" | "Conflicting";
  reason: Reason;
  recordedAt: Time;
  /**
   * @minItems 1
   * @maxItems 100
   */
  receiptRefs: EntityRef[];
  planRef: PlanRef;
  payloadDigest: Digest;
  digest: Digest;
  confirmedExternal?: {
    externalId: string;
    sourceVersion: string;
  };
  permitRef: {
    type: "abh.dispatch-permit";
    id: UUID;
    version: Version;
  };
}
export interface ActionIntentRecord {
  actionRef: ActionRef;
  resourceOrganizationId: UUID;
  proposal: ActionProposal;
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  payloadDigest: Digest;
  riskClass: RegisteredName;
  impactUpperBound: ImpactUpperBound;
  /**
   * @minItems 1
   * @maxItems 32
   */
  requiredBehaviorSlots: RegisteredName[];
  maxOperations: number;
  expiresAt: Time;
  digest: Digest;
  purposeNames: LifecyclePurposeNames;
}
export interface PolicyDecision {
  allow: boolean;
  /**
   * @minItems 0
   * @maxItems 100
   */
  obligationRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 32
   */
  reasonCodes: RegisteredName[];
}
export interface PolicyEvaluationRecord {
  evaluationRef: {
    type: "abh.policy-evaluation";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  targetRef: EntityRef;
  inputDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  policyVersionRefs: EntityRef[];
  kind: "Mandatory" | "Behavior";
  decision: PolicyDecision;
  evaluatedAt: Time;
}
export interface RevokeExecutionAuthorityPayload {
  reason: Reason;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface PinActionPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  preparationAuthorityRefs: EntityRef[];
}
export interface CompiledPolicyManifest {
  formatVersion: "0.1.0";
  wasmDigest: Digest;
  sourceDigest: Digest;
  compilerName: "OPA";
  compilerVersion: ExactVersion;
  compilerDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 32
   */
  entrypoints: string[];
}
export interface PolicyVersionRecord1 {
  policyVersionRef: {
    type: "abh.policy-version";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  kind: "Mandatory" | "Behavior";
  artifactRef: ArtifactRef;
  manifestDigest: Digest;
  wasmDigest: Digest;
  entrypoint: string;
  inputSchemaName: "ActionPolicyInput" | "ScopeAuthorityPolicyInput";
  ownerRef: EntityRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  releaseEvidenceRefs: EntityRef[];
  behaviorCapabilityRef?: CapabilityRef & {
    kind: "BehaviorPolicy";
    [k: string]: unknown;
  };
  digest: Digest;
}
export interface PolicyBindingRecord {
  bindingRef: {
    type: "abh.policy-binding";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  policyVersionRef: {
    type: "abh.policy-version";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  inputSchemaName: "ActionPolicyInput" | "ScopeAuthorityPolicyInput";
}
export interface ConfigurePolicyPayload {
  policy: PolicyVersionRecord;
  purposeNames: LifecyclePurposeNames;
}
export interface ActivateMandatoryPolicyPayload {
  policyVersionRef: {
    type: "abh.policy-version";
    id: UUID;
    version: Version;
  };
  expectedBindingVersion?: Version;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  purposeNames: LifecyclePurposeNames;
}
export interface ActionPolicyInput {
  schemaVersion: "0.1.0";
  resourceOrganizationId: UUID;
  checkedAt: Time;
  action: ActionRecord;
  intentDigest: Digest;
  planDigest: Digest;
  executionAuthority: ExecutionAuthority;
  /**
   * @minItems 1
   * @maxItems 100
   */
  grants: GrantRecord[];
  purposeOfUse: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  fences: FenceRecord[];
  impactUpperBound: ImpactUpperBound;
  /**
   * @minItems 1
   * @maxItems 100
   */
  inputVersionRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  ledgers: LedgerRecord[];
  dispatch?: {
    operationRef: OperationRef;
    payloadDigest: Digest;
    /**
     * @minItems 0
     * @maxItems 100
     */
    dependencyRefs: EntityRef[];
  };
}
export interface ResourceLedgerBinding {
  resourceRef: {
    type: "abh.resource";
    id: UUID;
    version: Version;
  };
  ledgerRef: {
    type: "abh.ledger";
    id: UUID;
    version: Version;
  };
  unit: RegisteredName;
  maxQuantity: NonnegativeDecimal;
}
export interface ResourceEnvelopeRecord {
  envelopeRef: {
    type: "abh.resource-envelope";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 64
   */
  bindings: ResourceLedgerBinding[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  purposeNames: LifecyclePurposeNames;
  digest: Digest;
}
export interface ConfigureResourceEnvelopePayload {
  envelope: ResourceEnvelopeRecord;
}
export interface AuthorizationSnapshotRecord {
  snapshotRef: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actorRef: Actor;
  actionRef: ActionRef;
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  authorityRef: AuthorityRef;
  purposeOfUse: RegisteredName;
  intentDigest: Digest;
  payloadDigest: Digest;
  pinSetRef: PinSetRef;
  pinSetDigest: Digest;
  planRef: PlanRef;
  planDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 100
   */
  sourceVersionRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  grantRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  epochVector: FenceRecord[];
  /**
   * @minItems 2
   * @maxItems 100
   */
  policyEvaluationRefs: EntityRef[];
  policyBindingRef: {
    type: "abh.policy-binding";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 0
   * @maxItems 100
   */
  reservationRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  commitmentRefs: EntityRef[];
  issuedAt: Time;
  validUntil: Time;
  digest: Digest;
  resourceOriginSnapshotRef: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  previousSnapshotRef?: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
}
export interface PurposeRecord {
  purposeRef: {
    type: "abh.purpose";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  name: RegisteredName;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  status: AccessRecordState;
}
export interface ConnectionRecord {
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  providerName: RegisteredName;
  providerTenantId: string;
  /**
   * @minItems 1
   * @maxItems 100
   */
  accountRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  connectorRefs: (CapabilityRef & {
    kind: "Connector";
    [k: string]: unknown;
  })[];
  secretRef: {
    type: "abh.secret";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  purposeNames: LifecyclePurposeNames;
  status: AccessRecordState;
}
export interface ConfigurePurposePayload {
  purpose: PurposeRecord;
}
export interface ConfigureConnectionPayload {
  connection: ConnectionRecord;
}
export interface RevokeDirectoryRecordPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  reason: Reason;
}
export interface WorkLeaseRecord {
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  targetRef: EntityRef;
  workerId: UUID;
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  fencingToken: Version;
  leaseUntil: Time;
}
export interface ClaimWorkLeasePayload {
  targetRef: EntityRef;
  workerId: UUID;
  leaseSeconds: number;
}
export interface RenewWorkLeasePayload {
  workerId: UUID;
  fencingToken: Version;
  leaseSeconds: number;
}
export interface ReleaseWorkLeasePayload {
  workerId: UUID;
  fencingToken: Version;
}
export interface ResourceFenceRecord {
  fenceRef: {
    type: "abh.resource-fence";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  accountRef: EntityRef;
  resourceKey: RegisteredName;
  fencingToken: Version;
  unresolvedOperationRef?: OperationRef;
  blockedByReportRef?: {
    type: "abh.reconciliation";
    id: UUID;
    version: Version;
  };
}
export interface DispatchPermitRecord {
  permitRef: {
    type: "abh.dispatch-permit";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actionRef: ActionRef;
  operationRef: OperationRef;
  attemptRef: {
    type: "abh.attempt";
    id: UUID;
    version: Version;
  };
  ordinal: number;
  snapshotRef: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  leaseFencingToken: Version;
  resourceFenceRef: {
    type: "abh.resource-fence";
    id: UUID;
    version: Version;
  };
  resourceFencingToken: Version;
  connectorRef: CapabilityRef & {
    kind: "Connector";
    [k: string]: unknown;
  };
  payloadRef: ArtifactRef;
  payloadDigest: Digest;
  providerIdempotencyKey: IdempotencyKey;
  /**
   * @minItems 2
   * @maxItems 100
   */
  policyEvaluationRefs: {
    type: "abh.policy-evaluation";
    id: UUID;
    version: Version;
  }[];
  issuedAt: Time;
  expiresAt: Time;
  digest: Digest;
  /**
   * @minItems 0
   * @maxItems 100
   */
  dependencyRefs: EntityRef[];
}
export interface AttemptRecord {
  attemptRef: {
    type: "abh.attempt";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  operationRef: OperationRef;
  ordinal: number;
  permitRef: {
    type: "abh.dispatch-permit";
    id: UUID;
    version: Version;
  };
  providerIdempotencyKey: IdempotencyKey;
  createdAt: Time;
}
export interface AttemptObservationRecord {
  observationRef: {
    type: "abh.attempt-observation";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  attemptRef: {
    type: "abh.attempt";
    id: UUID;
    version: Version;
  };
  sequence: Version;
  status: AttemptState;
  observedAt: Time;
  /**
   * @minItems 0
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface IssueDispatchPermitPayload {
  snapshotRef: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  leaseFencingToken: Version;
}
export interface DispatchExitRecord {
  exitRef: {
    type: "abh.dispatch-exit";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  permitRef: {
    type: "abh.dispatch-permit";
    id: UUID;
    version: Version;
  };
  attemptRef: {
    type: "abh.attempt";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  leaseFencingToken: Version;
  /**
   * @minItems 2
   * @maxItems 100
   */
  policyEvaluationRefs: {
    type: "abh.policy-evaluation";
    id: UUID;
    version: Version;
  }[];
  expiresAt: Time;
  claimedAt: Time;
}
export interface ClaimDispatchExitPayload {
  workerId: UUID;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  leaseFencingToken: Version;
}
export interface NormalizedOperationObservation {
  resourceOrganizationId: UUID;
  operationId: UUID;
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  accountRef: EntityRef;
  connectorRef: CapabilityRef & {
    kind: "Connector";
    [k: string]: unknown;
  };
  providerIdempotencyKey: IdempotencyKey;
  sourceKey: string;
  sourceVersion: string;
  source:
    | {
        kind: "Response";
        attemptRef: {
          type: "abh.attempt";
          id: UUID;
          version: Version;
        };
      }
    | {
        kind: "Query";
        queryAuthorityRef: AuthorityRef;
        coverage: "Partial" | "Complete";
        visibleThrough: Time;
        noEffectEvidenceRef?: EntityRef;
      };
  observedAt: Time;
  /**
   * @minItems 0
   * @maxItems 100
   */
  matches: {
    externalId: string;
    sourceVersion: string;
    payloadDigest: Digest;
    effect: "Applied" | "NoEffect" | "Pending";
  }[];
}
export interface RecordOperationReceiptPayload {
  receiptKey: IdempotencyKey;
  rawArtifactRef: ArtifactRef;
  normalizedArtifactRef: ArtifactRef;
}
export interface CompareOperationPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  receiptRefs: EntityRef[];
}
export interface ApplyReconciliationPayload {
  reportRef: EntityRef;
  workerId: UUID;
  leaseRef: EntityRef;
  leaseFencingToken: Version;
}
export interface RecoverOperationPayload {
  workerId: UUID;
  leaseRef: EntityRef;
  leaseFencingToken: Version;
}
export interface RecoverRunPayload {
  workerId: UUID;
  causeRef: EntityRef;
  leaseRef: EntityRef;
  leaseFencingToken: Version;
}
export interface ActionResultRecord {
  resultRef: {
    type: "abh.action-result";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actionRef: ActionRef;
  planRef: PlanRef;
  aggregationRuleRef: EntityRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  operationVersionRefs: OperationRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  reconciliationRefs: EntityRef[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  resourceSettlements: {
    reservationRef: EntityRef;
    actualUsage: NonnegativeDecimal;
    evidenceRef: EntityRef;
  }[];
  outcome: "Succeeded" | "PartiallySucceeded" | "Failed";
  recordedAt: Time;
  digest: Digest;
}
export interface AggregateActionPayload {
  /**
   * @minItems 1
   * @maxItems 100
   */
  operationVersionRefs: OperationRef[];
}
export interface CleanupActionPayload {
  mode: "Cancel" | "Reauthorize" | "Expire";
  reason: Reason;
}
export interface ActionCleanupRecord {
  cleanupRef: {
    type: "abh.action-cleanup";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actionRef: ActionRef;
  snapshotRef: {
    type: "abh.authorization-snapshot";
    id: UUID;
    version: Version;
  };
  planRef: PlanRef;
  mode: "Cancel" | "Reauthorize" | "Expire";
  reason: Reason;
  /**
   * @minItems 0
   * @maxItems 100
   */
  releasedReservationRefs: EntityRef[];
  checkedAt: Time;
  digest: Digest;
}
export interface RefreshActionPayload {}
export interface TransportCaptureRecord {
  captureRef: {
    type: "abh.transport-capture";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  attemptRef: {
    type: "abh.attempt";
    id: UUID;
    version: Version;
  };
  exitRef: {
    type: "abh.dispatch-exit";
    id: UUID;
    version: Version;
  };
  transportStatus: "Responded" | "TransportFailed" | "Interrupted";
  normalization: "Normalized" | "Unsupported" | "NotApplicable";
  observationRef: {
    type: "abh.attempt-observation";
    id: UUID;
    version: Version;
  };
  observedAt: Time;
  rawArtifactRef?: ArtifactRef;
  receiptRef?: {
    type: "abh.operation-receipt";
    id: UUID;
    version: Version;
  };
  digest: Digest;
}
export interface CaptureTransportPayload {
  permitRef: {
    type: "abh.dispatch-permit";
    id: UUID;
    version: Version;
  };
}
export interface InboxRecord {
  inboxRef: {
    type: "abh.inbox";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  consumerId: RegisteredName;
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
  sourceAggregateRef: EntityRef;
  sourceEventOrdinal: number;
  resultRef: EntityRef;
  handledAt: Time;
  digest: Digest;
}
export interface ConsumeEventPayload {
  consumerId: RegisteredName;
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
}
export interface OutboxRoutingRecord {
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
  routingRuleRef: EntityRef;
  /**
   * @minItems 1
   * @maxItems 100
   */
  deliveries: {
    consumerId: RegisteredName;
    consumerRef: EntityRef;
    job: JobEnvelope;
  }[];
  preparedAt: Time;
  digest: Digest;
}
export interface OutboxDeliveryRecord {
  deliveryRef: {
    type: "abh.outbox-delivery";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
  consumerId: RegisteredName;
  jobRef: JobRef;
  recordedAt: Time;
  digest: Digest;
}
export interface OutboxPublicationRecord {
  publicationRef: {
    type: "abh.outbox-publication";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  deliveryRefs: {
    type: "abh.outbox-delivery";
    id: UUID;
    version: Version;
  }[];
  recordedAt: Time;
  digest: Digest;
}
export interface PrepareOutboxPayload {
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
}
export interface RecordOutboxDeliveryPayload {
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
  consumerId: RegisteredName;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseFencingToken: Version;
}
export interface RegisterDurableWaitPayload {
  ownerRef: EntityRef;
  waitKey: IdempotencyKey;
  dueAt: Time;
  causeRef: EntityRef;
  authorityRef: EntityRef;
  conditionRef: EntityRef;
  sourceRef: EntityRef;
}
export interface DurableWaitSource {
  sourceRef: EntityRef;
  eventOrdinal: number;
  satisfied: boolean;
  /**
   * @minItems 1
   * @maxItems 32
   */
  evidenceRefs: EntityRef[];
}
export interface DurableWaitRecord {
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  ownerRef: EntityRef;
  waitKey: IdempotencyKey;
  dueAt: Time;
  causeRef: EntityRef;
  authorityRef: EntityRef;
  conditionRef: EntityRef;
  sourceRef: EntityRef;
  registrationDigest: Digest;
  waitingIntentRef: EntityRef;
  status: "Pending" | "Succeeded" | "Cancelled";
  source: DurableWaitSource;
  registeredAt: Time;
  resolvedAt?: Time;
  wakeupRef?: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
  cancelReason?: Reason;
  digest: Digest;
}
export interface DurableWakeupRecord {
  wakeupRef: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  ownerRef: EntityRef;
  authorityRef: EntityRef;
  reason: "Condition" | "Deadline";
  source: DurableWaitSource;
  triggerEventRef?: {
    type: "abh.event";
    id: UUID;
    version: Version;
  };
  createdAt: Time;
  digest: Digest;
}
export interface RecheckDurableWaitPayload {
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  triggerEventRef?: {
    type: "abh.event";
    id: UUID;
    version: Version;
  };
}
export interface CancelDurableWaitPayload {
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  expectedVersion: Version;
  reason: Reason;
}
export interface WaitPortReceiptRecord {
  receiptRef: {
    type: "abh.wait-port-receipt";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  method: "scheduleWakeup" | "cancelWakeup" | "signal";
  inputDigest: Digest;
  result: ScheduledWakeup | CancelledWakeup | SignalledWait;
  recordedAt: Time;
  digest: Digest;
  triggerEventRef?: {
    type: "abh.event";
    id: UUID;
    version: Version;
  };
}
export interface ExecuteWaitPortPayload {
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  method: "scheduleWakeup" | "cancelWakeup" | "signal";
  inputDigest: Digest;
}
export interface ActionWaitRecord {
  bindingRef: {
    type: "abh.action-wait";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actionRef: {
    type: "abh.action";
    id: UUID;
    version: Version;
  };
  requestRef: {
    type: "abh.responsibility-request";
    id: UUID;
    version: Version;
  };
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  authorityRef: EntityRef;
  payloadDigest: Digest;
  outcome: "Waiting" | "SourceClosed" | "Deadline" | "Cancelled";
  wakeupRef?: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
  recordedAt: Time;
  digest: Digest;
  cancelledWaitRef?: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
}
export interface NotifyActionWaitPayload {
  bindingRef: {
    type: "abh.action-wait";
    id: UUID;
    version: Version;
  };
  wakeupRef: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
}
export interface OperationWaitRecord {
  bindingRef: {
    type: "abh.operation-wait";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  actionRef: {
    type: "abh.action";
    id: UUID;
    version: Version;
  };
  waitRef: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  authorityRef: EntityRef;
  payloadDigest: Digest;
  outcome: "Waiting" | "SourceClosed" | "Deadline" | "Cancelled";
  wakeupRef?: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
  recordedAt: Time;
  digest: Digest;
  cancelledWaitRef?: {
    type: "abh.durable-wait";
    id: UUID;
    version: Version;
  };
  operationRef: {
    type: "abh.operation";
    id: UUID;
    version: Version;
  };
}
export interface NotifyOperationWaitPayload {
  bindingRef: {
    type: "abh.operation-wait";
    id: UUID;
    version: Version;
  };
  wakeupRef: {
    type: "abh.durable-wakeup";
    id: UUID;
    version: Version;
  };
}
export interface ClaimQueryExitPayload {
  operationRef: {
    type: "abh.operation";
    id: UUID;
    version: Version;
  };
  queryAuthorityRef: {
    type: "abh.execution-authority";
    id: UUID;
    version: Version;
  };
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseFencingToken: Version;
}
export interface QueryExitRecord {
  exitRef: {
    type: "abh.query-exit";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  operationRef: {
    type: "abh.operation";
    id: UUID;
    version: Version;
  };
  actionRef: {
    type: "abh.action";
    id: UUID;
    version: Version;
  };
  queryAuthorityRef: {
    type: "abh.execution-authority";
    id: UUID;
    version: Version;
  };
  authorityDigest: Digest;
  queryPolicyRef: EntityRef;
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  accountRef: EntityRef;
  connectorRef: CapabilityRef;
  providerIdempotencyKey: string;
  payloadDigest: Digest;
  leaseRef: {
    type: "abh.work-lease";
    id: UUID;
    version: Version;
  };
  workerId: UUID;
  leaseFencingToken: Version;
  /**
   * @minItems 1
   * @maxItems 16
   */
  reservationRefs: {
    type: "abh.reservation";
    id: UUID;
    version: Version;
  }[];
  claimedAt: Time;
  expiresAt: Time;
  digest: Digest;
  queryConnectorRef?: CapabilityRef;
  compatibilityEvidenceRef?: ArtifactRef;
  compatibilityEvidenceDigest?: Digest;
}
export interface QueryCaptureRecord {
  captureRef: {
    type: "abh.query-capture";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  exitRef: {
    type: "abh.query-exit";
    id: UUID;
    version: Version;
  };
  transportStatus: "Responded" | "TransportFailed" | "Interrupted";
  normalization: "Normalized" | "Unsupported" | "NotApplicable";
  observedAt: Time;
  rawArtifactRef?: ArtifactRef;
  receiptRef?: {
    type: "abh.operation-receipt";
    id: UUID;
    version: Version;
  };
  digest: Digest;
  operationRef: {
    type: "abh.operation";
    id: UUID;
    version: Version;
  };
}
export interface CaptureQueryPayload {
  exitRef: {
    type: "abh.query-exit";
    id: UUID;
    version: Version;
  };
}
export interface ScopeAuthorityDraft {
  executionPrincipalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  allowedProposerRefs: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  }[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  grantRefs: {
    type: "abh.grant";
    id: UUID;
    version: Version;
  }[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  scopeRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  purposeRefs: {
    type: "abh.purpose";
    id: UUID;
    version: Version;
  }[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  actionTypes: RegisteredName[];
  resourceEnvelopeRef: {
    type: "abh.resource-envelope";
    id: UUID;
    version: Version;
  };
  validFrom: Time;
  validUntil: Time;
  /**
   * @minItems 0
   * @maxItems 100
   */
  stopConditions: EntityRef[];
  effectKey: string;
}
export interface ScopeAuthorityPolicyInput {
  schemaVersion: "0.1.0";
  resourceOrganizationId: UUID;
  purposeOfUse: RegisteredName;
  actor: Actor;
  draft: ScopeAuthorityDraft;
  /**
   * @minItems 1
   * @maxItems 100
   */
  grants: GrantRecord[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  sourceVersionRefs: EntityRef[];
  resourceEnvelope: ResourceEnvelopeRecord;
}
export interface CreateScopeAuthorityPayload {
  draft: ScopeAuthorityDraft;
  evaluationRef: {
    type: "abh.policy-evaluation";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  managementGrantRefs: EntityRef[];
}
export interface OutboxConsumptionRecord {
  resourceOrganizationId: UUID;
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  recordedAt: Time;
  digest: Digest;
  consumptionRef: {
    type: "abh.outbox-consumption";
    id: UUID;
    version: Version;
  };
  publicationRef: {
    type: "abh.outbox-publication";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  inboxRefs: {
    type: "abh.inbox";
    id: UUID;
    version: Version;
  }[];
}
export interface RecordOutboxConsumptionPayload {
  routingRef: {
    type: "abh.outbox-routing";
    id: UUID;
    version: Version;
  };
}
export interface ExceptionRecord {
  exceptionRef: {
    type: "abh.exception";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  sourceRef: OperationRef;
  reportRef: {
    type: "abh.reconciliation";
    id: UUID;
    version: Version;
  };
  category: "TerminalContradiction";
  severity: "High";
  impactUpperBound: ImpactUpperBound;
  /**
   * @minItems 1
   * @maxItems 100
   */
  blockedScopeRefs: EntityRef[];
  /**
   * @minItems 1
   * @maxItems 100
   */
  requiredResponsibilityRefs: EntityRef[];
  requestRef: RequestRef;
  proposalDigest: Digest;
  recordedAt: Time;
  digest: Digest;
}
export interface OpenTerminalExceptionPayload {
  reportRef: {
    type: "abh.reconciliation";
    id: UUID;
    version: Version;
  };
  responsibility: OpenResponsibilityRequestPayload;
}
export interface RevokeResponsibilityPayload {
  assignmentRef: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  };
  replacementRef?: {
    type: "abh.responsibility-assignment";
    id: UUID;
    version: Version;
  };
  reason: string;
  /**
   * @minItems 1
   * @maxItems 50
   */
  evidenceRefs: EntityRef[];
}
export interface DecisionWithdrawalRecord {
  commandRef: CommandRef;
  requestRef: RequestRef;
  decisionRef: DecisionRef;
  reason: Reason;
  /**
   * @minItems 1
   * @maxItems 50
   */
  evidenceRefs: EntityRef[];
  recordedAt: Time;
}
export interface ReviseResponsibilityRoutePayload {
  expectedRequestRef: RequestRef;
  proposal: OpenResponsibilityRequestPayload;
  /**
   * @minItems 1
   * @maxItems 32
   */
  frozenPolicyRefs: EntityRef[];
  directoryRef: EntityRef;
  /**
   * @minItems 1
   * @maxItems 50
   */
  evidenceRefs: EntityRef[];
  reason: Reason;
}
export interface ResponsibilityRouteRevisionRecord {
  previousRequest: ResponsibilityRequestRecord;
  change: ReviseResponsibilityRoutePayload;
}
export interface DecisionEffectIntentRecord {
  effectRef: DecisionEffectRef;
  resourceOrganizationId: UUID;
  requestRef: RequestRef;
  routeRevision: Version;
  effectKey: string;
  /**
   * @minItems 1
   * @maxItems 100
   */
  decisionRefs: DecisionRef[];
  completionEvidenceRef: {
    type: "abh.request-completion-evidence";
    id: UUID;
    version: Version;
  };
  targetOwner: "Control" | "Domain";
  targetRef: EntityRef;
  commandRef: {
    type: "abh.command";
    id: UUID;
    version: Version;
  };
  originatingCommandRef: {
    type: "abh.command";
    id: UUID;
    version: Version;
  };
  status: "Pending";
  recordedAt: Time;
}
export interface DecisionEffectReceiptRecord {
  receiptRef: {
    type: "abh.command";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  effectRef: DecisionEffectRef;
  requestRef: RequestRef;
  completionEvidenceRef: {
    type: "abh.request-completion-evidence";
    id: UUID;
    version: Version;
  };
  authorityRef: {
    type: "abh.execution-authority";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 1
   */
  grantRefs: {
    type: "abh.grant";
    id: UUID;
    version: Version;
  }[];
  inputDigest: Digest;
  status: "Applied";
  appliedAt: Time;
}
export interface ActionAuthorizationRequestRecord {
  requestRef: {
    type: "abh.action-authorization-request";
    id: UUID;
    version: 1;
  };
  resourceOrganizationId: UUID;
  actionRef: ActionRef;
  sourceCommandRef: CommandRef;
  requestedBy: Actor;
  executionPrincipalRef: EntityRef;
  payload: RequestAuthorizationPayload;
  inputDigest: Digest;
  acceptedAt: Time;
  digest: Digest;
}
export interface RecordPackValidationPayload {
  reportDigest: Digest;
  governanceRef: EntityRef;
  governanceDigest: Digest;
}
export interface PublishPackTrustPolicyPayload {
  documentDigest: Digest;
  signerKeyDigest: Digest;
  expectedVersion: number;
}
export interface LocalPackStagingReceipt {
  id: UUID;
  metadataDigest: Digest;
}
export interface StagePackPayload {
  validationRef: EntityRef & {
    type?: "abh.pack-validation";
    version?: 1;
    [k: string]: unknown;
  };
  snapshot: LocalPackStagingReceipt;
  expectedDeploymentVersion: number;
}
export interface InstalledPackRecord {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  manifest: PackManifest;
  snapshot: LocalPackStagingReceipt;
  validationRef: EntityRef & {
    type?: "abh.pack-validation";
    version?: 1;
    [k: string]: unknown;
  };
  reportDigest: Digest;
  governanceRef: EntityRef & {
    type?: "abh.pack-trust-policy";
    [k: string]: unknown;
  };
  governanceDigest: Digest;
  deploymentVersion: Version;
  status: "Staged" | "Enabled" | "Suspended" | "Retired";
  stagedAt: Time;
  enablement?: PackEnableRecord;
  suspension?: PackSuspensionRecord;
  retirement?: PackRetirementRecord;
}
export interface PackEnableRecord {
  proposal: PackEnableProposal;
  approvalRef: EntityRef & {
    type?: "abh.request-completion-evidence";
    [k: string]: unknown;
  };
  previousPackRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  enabledPackRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  deploymentVersion: Version;
  enabledAt: Time;
}
/**
 * Exact deployment-governance approval subject. Shape and digest do not prove approval or installation eligibility.
 */
export interface PackEnableProposal {
  action: "EnablePack";
  resourceOrganizationId: UUID;
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  expectedDeploymentVersion: Version;
  environmentDigest: Digest;
  validationRef: EntityRef & {
    type?: "abh.pack-validation";
    [k: string]: unknown;
  };
  governanceRef: EntityRef & {
    type?: "abh.pack-trust-policy";
    [k: string]: unknown;
  };
  governanceDigest: Digest;
  ctkRef: EntityRef & {
    type?: "abh.artifact";
    [k: string]: unknown;
  };
  impactRef: EntityRef & {
    type?: "abh.pack-data-impact";
    [k: string]: unknown;
  };
  migrationVerificationRef: EntityRef & {
    type?: "abh.artifact";
    [k: string]: unknown;
  };
  impactUpperBound: ImpactUpperBound;
  expiresAt: Time;
  proposalDigest: Digest;
  subjectDigest: Digest1;
  capabilitySetRef: EntityRef & {
    type?: "abh.pack-capability-set";
    [k: string]: unknown;
  };
  capabilitySetDigest: Digest;
}
export interface PackSuspensionRecord {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  expectedDeploymentVersion: Version;
  reason: Reason;
  emergency: boolean;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  suspendedAt: Time;
}
export interface PackRetirementRecord {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  expectedDeploymentVersion: Version;
  reason: Reason;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  referenceReviewRef: ArtifactRef;
  rollbackWindowEndsAt: Time;
  retiredPackRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  deploymentVersion: Version;
  retiredAt: Time;
}
export interface PackDataImpactRecord {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    version?: 1;
    [k: string]: unknown;
  };
  deploymentVersion: Version;
  compilerRef: CapabilityRef;
  environmentDigest: Digest;
  baselineSourceRef: EntityRef;
  targetSourceRef: EntityRef;
  baseline: PackDataInventory;
  target: PackDataInventory;
  impact: PackDataImpact;
  issuedAt: Time;
  expiresAt: Time;
}
export interface RecordPackDataImpactPayload {
  report: PackDataImpactRecord;
}
export interface PackInspectionJobRecord {
  jobRef: {
    type: "abh.pack-inspection-job";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  packRef: {
    type: "abh.installed-pack";
    id: UUID;
    version: 1;
  };
  packageDigest: Digest;
  environmentDigest: Digest;
  deploymentVersion: Version;
  kind: "StructureAndDataInspection";
  status: PackInspectionJobState;
  requestedBy: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  commandId: UUID;
  idempotencyKey: string;
  requestedAt: Time;
  updatedAt: Time;
  expiresAt: Time;
  budget: {
    maxAttempts: number;
    attempts: number;
    maxDurationMs: number;
    elapsedMs: number;
  };
  lease?: {
    leaseRef: {
      type: "abh.work-lease";
      id: UUID;
      version: Version;
    };
    workerId: UUID;
    fencingToken: number;
  };
  observation?: {
    artifactRef: {
      type: "abh.artifact";
      id: UUID;
      version: Version;
    };
    matched: boolean;
  };
  diagnostic?: {
    code:
      | "Missing"
      | "Ambiguous"
      | "ObservationAmbiguous"
      | "ObservationSearchIncomplete"
      | "LeaseBusy"
      | "BudgetExhausted"
      | "Expired"
      | "InspectionFailed"
      | "Cancelled";
    /**
     * @minItems 1
     * @maxItems 32
     */
    evidenceRefs: {
      type: "abh.artifact";
      id: UUID;
      version: Version;
    }[];
  };
}
export interface RequestPackInspectionPayload {
  packRef: {
    type: "abh.installed-pack";
    id: UUID;
    version: 1;
  };
  packageDigest: Digest;
  environmentDigest: Digest;
  deploymentVersion: Version;
  expiresAt: Time;
  maxAttempts: number;
  maxDurationMs: number;
}
export interface StartPackInspectionPayload {
  lease: {
    leaseRef: {
      type: "abh.work-lease";
      id: UUID;
      version: Version;
    };
    workerId: UUID;
    fencingToken: number;
  };
}
export interface ExpirePackInspectionPayload {
  dataClass: RegisteredName;
  region: string;
  retentionPolicyRef: EntityRef;
}
export interface PackInspectionTimeoutEvidence {
  job: PackInspectionJobRecord;
  assessedAt: Time;
  elapsedMs: number;
  cause: "Expired" | "BudgetExhausted";
}
export interface CompletePackInspectionPayload {
  lease: {
    leaseRef: {
      type: "abh.work-lease";
      id: UUID;
      version: Version;
    };
    workerId: UUID;
    fencingToken: number;
  };
  observationRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
}
export interface PackInspectionBlockEvidence {
  resourceOrganizationId: UUID;
  packRef: {
    type: "abh.installed-pack";
    id: UUID;
    version: 1;
  };
  packageDigest: Digest;
  environmentDigest: Digest;
  deploymentVersion: Version;
  principalRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  observedAt: Time;
  reason: "Missing" | "Ambiguous" | "ObservationAmbiguous" | "ObservationSearchIncomplete";
}
export interface WaitPackInspectionPayload {
  dataClass: RegisteredName;
  region: string;
  retentionPolicyRef: EntityRef;
  lease: {
    leaseRef: {
      type: "abh.work-lease";
      id: UUID;
      version: Version;
    };
    workerId: UUID;
    fencingToken: number;
  };
}
export interface PackInspectionWaitingEvidence {
  job: PackInspectionJobRecord;
  block: PackInspectionBlockEvidence;
  assessedAt: Time;
  elapsedMs: number;
}
export interface CancelPackInspectionPayload {
  dataClass: RegisteredName;
  region: string;
  retentionPolicyRef: EntityRef;
  reason: "OperatorRequested" | "Superseded" | "Shutdown";
  basisRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
}
export interface PackInspectionCancellationEvidence {
  job: PackInspectionJobRecord;
  assessedAt: Time;
  elapsedMs: number;
  disposition: "Cancelled" | "BudgetExhausted";
  reason: "OperatorRequested" | "Superseded" | "Shutdown";
  basisRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  actorRef: {
    type: "abh.principal";
    id: UUID;
    version: Version;
  };
  commandId: UUID;
}
export interface PackInspectionRetryExhaustedEvidence {
  job: PackInspectionJobRecord;
  block: PackInspectionBlockEvidence;
  assessedAt: Time;
  elapsedMs: number;
  cause: "AttemptsExhausted";
}
export interface PackInspectionDeliveryRecord {
  deliveryRef: {
    type: "abh.pack-inspection-delivery";
    id: UUID;
    version: 1;
  };
  resourceOrganizationId: UUID;
  jobRef: PackInspectionJobRef;
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
  sourceCommandRef: {
    type: "abh.command";
    id: UUID;
    version: 1;
  };
  acceptedAt: Time;
  digest: Digest;
}
export interface AcceptPackInspectionDeliveryPayload {
  jobRef: PackInspectionJobRef;
  eventRef: {
    type: "abh.event";
    id: UUID;
    version: 1;
  };
  eventDigest: Digest;
}
export interface PackInspectionLeaseLossEvidence {
  job: PackInspectionJobRecord;
  observedLease: WorkLeaseRecord;
  assessedAt: Time;
  elapsedMs: number;
  cause: "Expired" | "Replaced";
  disposition: "InspectionFailed" | "BudgetExhausted" | "Expired";
}
export interface FailLostPackInspectionPayload {
  dataClass: RegisteredName;
  region: string;
  retentionPolicyRef: EntityRef;
}
export interface DatabaseDiagnosticResult1 {
  checkId: "data.security-manifest";
  status: "Passed" | "Failed";
  errorCode:
    null | "INVALID_ARGUMENT" | "FORBIDDEN" | "PRECONDITION_FAILED" | "DEPENDENCY_TIMEOUT" | "DEPENDENCY_UNAVAILABLE";
  violationCount: number;
}
export interface ProjectionHealthResult {
  checkId: "projection.mission-summary";
  projectionType: "abh.projection.mission-summary";
  subjectId: string;
  present: boolean;
  sourceVersion: number;
  goalRevision: number;
  stopEpoch: number;
  stale: boolean;
  watermarkEventId: null | string;
  watermarkAt: null | string;
  latestEventId: null | string;
  latestEventAt: null | string;
  lagMs: number;
  gapCount: number;
  safeRebuildCommand: "abh.projections.refresh-mission-summary";
}
export interface CliDoctorProjectionResult1 {
  checkId: "projection.mission-summary";
  projectionType: "abh.projection.mission-summary";
  subjectId: string;
  status: "Passed" | "Failed";
  errorCode:
    null | "INVALID_ARGUMENT" | "FORBIDDEN" | "PRECONDITION_FAILED" | "DEPENDENCY_TIMEOUT" | "DEPENDENCY_UNAVAILABLE";
  violationCount: number;
  health: {
    checkId: "projection.mission-summary";
    projectionType: "abh.projection.mission-summary";
    subjectId: string;
    present: boolean;
    sourceVersion: number;
    goalRevision: number;
    stopEpoch: number;
    stale: boolean;
    watermarkEventId: null | string;
    watermarkAt: null | string;
    latestEventId: null | string;
    latestEventAt: null | string;
    lagMs: number;
    gapCount: number;
    safeRebuildCommand: "abh.projections.refresh-mission-summary";
  };
  commandRef: null;
  /**
   * @maxItems 0
   */
  evidenceRefs: EntityRef[];
  remediation: null | string;
}
export interface CliDoctorDataResult1 {
  checkId: "data.security-manifest";
  status: "Passed" | "Failed";
  errorCode:
    null | "INVALID_ARGUMENT" | "FORBIDDEN" | "PRECONDITION_FAILED" | "DEPENDENCY_TIMEOUT" | "DEPENDENCY_UNAVAILABLE";
  violationCount: number;
  commandRef: null;
  /**
   * @maxItems 0
   */
  evidenceRefs: EntityRef[];
  remediation: string | null;
}
export interface PackInspectionDiagnostic1 {
  jobRef: EntityRef & {
    type: "abh.pack-inspection-job";
    [k: string]: unknown;
  };
  status: "Pending" | "Running" | "Waiting" | "Succeeded" | "Failed" | "Cancelled";
  assessedAt: Time;
  nextStep: "AwaitDelivery" | "AttemptExecution" | "ObserveRunning" | "SettleExpired" | "SettleLostLease" | "Terminal";
  deliveryRef?: EntityRef & {
    type: "abh.pack-inspection-delivery";
    [k: string]: unknown;
  };
  leaseRef?: EntityRef & {
    type: "abh.work-lease";
    [k: string]: unknown;
  };
  leaseLoss?: "Expired" | "Replaced";
  /**
   * @maxItems 100
   */
  evidenceRefs: (EntityRef & {
    type: "abh.artifact";
    [k: string]: unknown;
  })[];
  elapsedMs: number;
  remainingDurationMs: number;
  remainingAttempts: number;
}
export interface PackInspectionDiagnosticResponse {
  success: true;
  data: PackInspectionDiagnostic;
  meta: QueryMeta;
}
export interface CliInspectionDiagnosticResult1 {
  commandRef: null;
  checkId: "pack.inspection-job";
  status: "Reported" | "Failed";
  errorCode:
    | null
    | "INVALID_ARGUMENT"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "RESOURCE_NOT_FOUND"
    | "SCHEMA_UNSUPPORTED"
    | "PRECONDITION_FAILED"
    | "DEPENDENCY_TIMEOUT"
    | "DEPENDENCY_UNAVAILABLE";
  /**
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  diagnostic: PackInspectionDiagnostic | null;
  remediation: string;
}
export interface PackInspectionFailureEvidence {
  job: PackInspectionJobRecord;
  assessedAt: Time;
  elapsedMs: number;
  disposition: "InspectionFailed" | "BudgetExhausted" | "Expired";
  phase: "Preparation" | "Inspection" | "Completion";
  classification: "DependencyTimeout" | "Rejected" | "UnexpectedFailure";
  cleanupUnacknowledged: boolean;
}
export interface FailPackInspectionPayload {
  dataClass: RegisteredName;
  region: string;
  retentionPolicyRef: EntityRef;
  lease: {
    leaseRef: {
      type: "abh.work-lease";
      id: UUID;
      version: Version;
    };
    workerId: UUID;
    fencingToken: number;
  };
}
export interface RecordPackConformancePayload {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  retention: {
    dataClass: RegisteredName;
    region: string;
    retentionPolicyRef: EntityRef;
  };
}
export interface RequestPackEnablePayload {
  proposal: PackEnableProposal;
  responsibility: OpenResponsibilityRequestPayload;
}
export interface PackDeploymentRevisionRecord {
  revisionRef: EntityRef & {
    type?: "abh.pack-deployment-revision";
    [k: string]: unknown;
  };
  resourceOrganizationId: UUID;
  deploymentVersion: Version;
  previousDeploymentVersion: number;
  targetRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  recordedAt: Time;
}
export interface EnablePackPayload {
  proposal: PackEnableProposal;
  approvalRef: EntityRef & {
    type?: "abh.request-completion-evidence";
    [k: string]: unknown;
  };
}
export interface PackCapabilityBinding {
  capability: PackCapabilityReference;
  schemaPath: PackPath;
  implementationRef: EntityRef;
  healthRef: EntityRef;
  permissionEnvelope: {
    /**
     * @maxItems 1000
     */
    dataClasses: RegisteredName[];
    /**
     * @maxItems 1000
     */
    purposes: RegisteredName[];
    /**
     * @maxItems 1000
     */
    commands: RegisteredName[];
    /**
     * @maxItems 1000
     */
    toolCapabilities: RegisteredName[];
    /**
     * @maxItems 1000
     */
    networkEgress: string[];
    /**
     * @maxItems 1000
     */
    secretClasses: RegisteredName[];
  };
}
export interface PackCapabilityRegistration {
  capability: PackCapabilityReference;
  schemaPath: PackPath;
  implementationRef: EntityRef;
  healthRef: EntityRef;
  permissionEnvelope: {
    /**
     * @maxItems 1000
     */
    dataClasses: RegisteredName[];
    /**
     * @maxItems 1000
     */
    purposes: RegisteredName[];
    /**
     * @maxItems 1000
     */
    commands: RegisteredName[];
    /**
     * @maxItems 1000
     */
    toolCapabilities: RegisteredName[];
    /**
     * @maxItems 1000
     */
    networkEgress: string[];
    /**
     * @maxItems 1000
     */
    secretClasses: RegisteredName[];
  };
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  subjectDigest: Digest;
  schemaDigest: Digest;
  registrationDigest: Digest;
}
export interface RegisterPackCapabilitiesPayload {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  bindingsDigest: Digest;
}
export interface PackCapabilitySetRecord {
  setRef: EntityRef & {
    type?: "abh.pack-capability-set";
    [k: string]: unknown;
  };
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  /**
   * @maxItems 1000
   */
  registrations: PackCapabilityRegistration[];
  recordedAt: Time;
  setDigest: Digest;
}
export interface PackCapabilityAvailability {
  visible: boolean;
  compatible: boolean;
  healthy: boolean;
}
export interface PackCapabilityCandidate {
  capability: PackCapabilityReference;
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  registrationDigest: Digest;
  schemaDigest: Digest;
  compatible: boolean;
  healthy: boolean;
}
export interface PackCapabilityQueryResult {
  /**
   * @maxItems 100
   */
  candidates: PackCapabilityCandidate[];
  complete: boolean;
}
export interface SuspendPackPayload {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  expectedDeploymentVersion: Version;
  reason: Reason;
  emergency: boolean;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
}
export interface RetirePackPayload {
  packRef: EntityRef & {
    type?: "abh.installed-pack";
    [k: string]: unknown;
  };
  expectedDeploymentVersion: Version;
  reason: Reason;
  /**
   * @minItems 1
   * @maxItems 100
   */
  evidenceRefs: EntityRef[];
  referenceReviewRef: ArtifactRef;
  rollbackWindowEndsAt: Time;
}
export interface CompatibleQueryEvidence {
  kind: "CompatibleQueryEvidence";
  operationRef: {
    type: "abh.operation";
    id: UUID;
    version: Version;
  };
  originalConnectorRef: CapabilityRef & {
    kind?: "Connector";
    [k: string]: unknown;
  };
  queryConnectorRef: CapabilityRef & {
    kind?: "Connector";
    [k: string]: unknown;
  };
  connectionRef: {
    type: "abh.connection";
    id: UUID;
    version: Version;
  };
  accountRef: EntityRef;
  expiresAt: Time;
}
export interface RecordCompatibleQueryEvidencePayload {
  evidence: CompatibleQueryEvidence;
  reviewRef: ArtifactRef;
  retention: {
    dataClass: RegisteredName;
    region: string;
    retentionPolicyRef: EntityRef;
  };
}
export interface MissionConditionInput {
  successConditionRef: EntityRef;
  stopConditionRef: EntityRef;
  triggerPolicyRef: EntityRef;
  resourceEnvelopeRef: EntityRef;
}
export interface CreateMissionPayload {
  goalArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  domainType: RegisteredName;
  workflowRef: CapabilityRef & {
    kind?: "Workflow";
    [k: string]: unknown;
  };
  conditions: MissionConditionInput;
  /**
   * @minItems 1
   * @maxItems 100
   */
  responsibilityScopeRefs: EntityRef[];
}
export interface MissionConditionRecord {
  conditionRef: {
    type: "abh.mission-conditions";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  goalRevision: Version;
  successConditionRef: EntityRef;
  stopConditionRef: EntityRef;
  triggerPolicyRef: EntityRef;
  resourceEnvelopeRef: EntityRef;
  digest: Digest;
}
export interface MissionRecord {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  goalArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  goalDigest: Digest;
  goalRevision: Version;
  domainType: RegisteredName;
  workflowRef: CapabilityRef & {
    kind?: "Workflow";
    [k: string]: unknown;
  };
  conditionRef: {
    type: "abh.mission-conditions";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  responsibilityScopeRefs: EntityRef[];
  status: "Draft" | "Active" | "Paused" | "Blocked" | "Completed" | "Cancelled";
  stopEpoch: number;
  pauseRequested: boolean;
  cleanupStatus: "NotRequired" | "Pending" | "Complete";
  purposeNames: LifecyclePurposeNames;
  createdBy: Actor;
  createdAt: Time;
  updatedAt: Time;
  authorityRef?: {
    type: "abh.mission-authority";
    id: UUID;
    version: Version;
  };
  activeRunRef?: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  businessStageRef?: EntityRef;
  /**
   * @maxItems 100
   */
  resultRefs?: EntityRef[];
}
export interface ActivateMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  authorityRef: {
    type: "abh.mission-authority";
    id: UUID;
    version: Version;
  };
}
export interface SubmitTriggerPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  triggerKey: RegisteredName;
  sourceEventRef: EntityRef;
  sourceWatermark: number;
  kind: "Scheduled" | "DomainEvent" | "Manual" | "Recovery";
}
export interface MissionTriggerRecord {
  triggerKey: RegisteredName;
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  sourceEventRef: EntityRef;
  sourceWatermark: number;
  kind: "Scheduled" | "DomainEvent" | "Manual" | "Recovery";
  disposition: "Accepted" | "Duplicate" | "Obsolete";
}
export interface MissionBlockerRecord {
  blockerRef: {
    type: "abh.mission-blocker";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  blockerType: RegisteredName;
  sourceEvidenceRef: EntityRef;
  required: boolean;
  resolved: boolean;
  resolvedByRef?: EntityRef;
}
export interface RefreshMissionSummaryPayload {
  projectionType: RegisteredName;
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
}
export interface ProjectionRefreshReceipt {
  missionRef: EntityRef;
  commandId: UUID;
  replayed: boolean;
}
export interface PauseMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  reasonCode: RegisteredName;
}
export interface CancelMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  reasonCode: RegisteredName;
  /**
   * @maxItems 100
   */
  evidenceRefs?: EntityRef[];
}
export interface ResumeMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  /**
   * @maxItems 100
   */
  resolvedBlockerRefs?: {
    type: "abh.mission-blocker";
    id: UUID;
    version: Version;
  }[];
}
export interface ReviseMissionGoalPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  goalArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  conditions: MissionConditionInput;
  authorityRef: {
    type: "abh.mission-authority";
    id: UUID;
    version: Version;
  };
}
export interface CloseMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  resultRefs: EntityRef[];
  conditionEvaluationRef: EntityRef;
  outcome: "Completed" | "Cancelled";
}
export interface BlockMissionPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  blockerType: RegisteredName;
  sourceEvidenceRef: EntityRef;
  required: boolean;
}
export interface ResolveBlockerPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  blockerRef: {
    type: "abh.mission-blocker";
    id: UUID;
    version: Version;
  };
  resolutionEvidenceRef: EntityRef;
}
export interface MissionView {
  mission: MissionRecord;
  conditions: MissionConditionRecord;
  /**
   * @maxItems 100
   */
  pendingTriggers: MissionTriggerRecord[];
  /**
   * @maxItems 100
   */
  blockers: MissionBlockerRecord[];
  /**
   * @maxItems 20
   */
  availableActions: string[];
  asOf: Time;
}
export interface MissionListResult {
  /**
   * @maxItems 100
   */
  missions: MissionRecord[];
  cursor?: string;
  asOf: Time;
}
export interface RunRecord {
  runRef: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  triggerKey: RegisteredName;
  goalRevision: Version;
  stopEpoch: number;
  workflowRef: CapabilityRef;
  assignmentSnapshotRef: EntityRef;
  executionMode: "Production" | "Shadow" | "IsolatedEvaluation";
  status: "Queued" | "Running" | "Waiting" | "Paused" | "Completed" | "Failed" | "Cancelled";
  createdBy: Actor;
  createdAt: Time;
  updatedAt: Time;
}
export interface StartRunPayload {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  triggerKey: RegisteredName;
  workflowRef: CapabilityRef;
  authorityRef: {
    type: "abh.mission-authority";
    id: UUID;
    version: Version;
  };
  executionMode: "Production" | "Shadow" | "IsolatedEvaluation";
}
export interface CompleteRunPayload {
  runRef: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  outcome: "Completed" | "Failed" | "Cancelled";
  /**
   * @maxItems 100
   */
  resultRefs?: EntityRef[];
}
export interface CancelRunPayload {
  runRef: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  reasonCode: RegisteredName;
  /**
   * @maxItems 100
   */
  evidenceRefs?: EntityRef[];
}
export interface TaskRecord {
  taskRef: {
    type: "abh.task";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  runRef: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  nodeKey: RegisteredName;
  kind: "Agent" | "Compute" | "StructuredModelJob" | "Wait" | "DomainCommand";
  /**
   * @maxItems 100
   */
  inputRefs: EntityRef[];
  status: "Pending" | "Ready" | "Running" | "Verifying" | "Succeeded" | "Failed" | "Skipped" | "Cancelled";
  required: boolean;
  attemptOrdinal: number;
  createdAt: Time;
  updatedAt: Time;
}
export interface RunView {
  run: RunRecord;
  /**
   * @maxItems 100
   */
  tasks: TaskRecord[];
  asOf: Time;
}
export interface RunListResult {
  /**
   * @maxItems 100
   */
  runs: RunRecord[];
  cursor?: string;
  asOf: Time;
}
export interface ToolCallInspection {
  call: ToolCallRecord;
  trackingRef: EntityRef;
  cost:
    | {
        metered: false;
      }
    | {
        metered: true;
        status: "Held" | "Consumed" | "Released";
        reservationRef: {
          type: "abh.reservation";
          id: UUID;
          version: Version;
        };
      };
  asOf: Time;
}
export interface ToolCallRecord {
  callRef: {
    type: "abh.tool-call";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  bindingRef: {
    type: "abh.tool-binding";
    id: UUID;
    version: Version;
  };
  callKey: RegisteredName;
  argumentDigest: Digest;
  resultArtifactRef?: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  errorDigest?: Digest;
  failureEvidenceRef?: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  costReservationRef?: {
    type: "abh.reservation";
    id: UUID;
    version: Version;
  };
  status: "Pending" | "Completed" | "Failed";
  startedAt: Time;
  completedAt?: Time;
}
export interface ContextManifest {
  contextRef: {
    type: "abh.context";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  taskRef: {
    type: "abh.task";
    id: UUID;
    version: Version;
  };
  goalDigest: Digest;
  manifestDigest: Digest;
  /**
   * @maxItems 100
   */
  inputRefs: EntityRef[];
  purposeOfUse: RegisteredName;
  executionMode: "Production" | "Shadow" | "IsolatedEvaluation";
  createdAt: Time;
}
export interface VerificationReport {
  reportRef: {
    type: "abh.verification-report";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  taskRef: {
    type: "abh.task";
    id: UUID;
    version: Version;
  };
  invocationRef: {
    type: "abh.invocation";
    id: UUID;
    version: Version;
  };
  resultArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  resultDigest: Digest;
  verdict: "Pass" | "Reject" | "NeedsResponsibility" | "Inconclusive";
  verifierRef?: EntityRef;
  /**
   * @maxItems 100
   */
  evidenceRefs?: EntityRef[];
  verifiedAt: Time;
}
export interface SubmitVerificationPayload {
  taskRef: {
    type: "abh.task";
    id: UUID;
    version: Version;
  };
  invocationRef: {
    type: "abh.invocation";
    id: UUID;
    version: Version;
  };
  resultArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  verdict: "Pass" | "Reject" | "NeedsResponsibility" | "Inconclusive";
  /**
   * @maxItems 100
   */
  evidenceRefs?: EntityRef[];
}
export interface ToolCapability {
  capabilityRef: {
    type: "abh.tool-capability";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  toolId: RegisteredName;
  version: Version;
  effectClass: "Read" | "Compute" | "Propose";
  inputSchemaRef: EntityRef;
  outputSchemaRef: EntityRef;
  purposeOfUse: RegisteredName;
  implementationRef?: EntityRef;
}
export interface ToolBinding {
  bindingRef: {
    type: "abh.tool-binding";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  invocationRef: {
    type: "abh.invocation";
    id: UUID;
    version: Version;
  };
  capabilityRef: {
    type: "abh.tool-capability";
    id: UUID;
    version: Version;
  };
  authorizedSnapshotRef: EntityRef;
  callLimit: number;
  deadline?: Time;
  status: "Active" | "Expired" | "Revoked";
}
export interface InvokeToolPayload {
  bindingRef: {
    type: "abh.tool-binding";
    id: UUID;
    version: Version;
  };
  callKey: RegisteredName;
  arguments: {
    [k: string]: unknown;
  };
  /**
   * @maxItems 10
   */
  targetRefs?: EntityRef[];
  budget?: {
    ledgerRef: {
      type: "abh.ledger";
      id: UUID;
      version: Version;
    };
    amount: Decimal;
    expiresAt: Time;
  };
}
export interface ToolCallResponse {
  callRef: {
    type: "abh.tool-call";
    id: UUID;
    version: Version;
  };
  resultArtifactRef?: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  status: "Completed" | "Failed";
  errorDigest?: Digest;
}
export interface ModelRoute {
  routeRef: {
    type: "abh.model-route";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  /**
   * @minItems 1
   * @maxItems 50
   */
  allowedModels: RegisteredName[];
  purposeOfUse: RegisteredName;
  dataClass: RegisteredName;
  region: string;
  maxCostMicros?: number;
}
export interface ModelCallRecord {
  callRef: {
    type: "abh.model-call";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  routeRef: {
    type: "abh.model-route";
    id: UUID;
    version: Version;
  };
  selectedModel: RegisteredName;
  inputManifestRef: {
    type: "abh.context";
    id: UUID;
    version: Version;
  };
  inputDigest: Digest;
  status: "Prepared" | "InFlight" | "Completed" | "Failed";
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimated: boolean;
  };
  createdAt: Time;
  rawResponseRef?: EntityRef;
}
export interface ProjectionEnvelope {
  projectionType: RegisteredName;
  subjectRef: EntityRef;
  resourceOrganizationId: UUID;
  schemaVersion: Version;
  watermark: number;
  stale: boolean;
  data: {
    [k: string]: unknown;
  };
  /**
   * @maxItems 20
   */
  availableActions: string[];
  asOf: Time;
}
export interface MissionSummaryProjection {
  missionRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
  goalDigest: Digest;
  domainType: RegisteredName;
  status: RegisteredName;
  goalRevision: Version;
  activeRunRef?: {
    type: "abh.run";
    id: UUID;
    version: Version;
  };
  pendingTriggerCount: number;
  blockerCount: number;
  businessStageRef?: EntityRef;
  /**
   * @maxItems 100
   */
  resultRefs?: EntityRef[];
  updatedAt: Time;
}
export interface CaptureSignalPayload {
  sourceEventRef: EntityRef;
  signalType: RegisteredName;
  /**
   * @maxItems 100
   */
  artifactRefs: EntityRef[];
  scopeRef: EntityRef;
  purposeOfUse: RegisteredName;
  samplingPolicyRef?: EntityRef;
}
export interface LearningSignalRecord {
  signalRef: {
    type: "abh.learning-signal";
    id: UUID;
    version: Version;
  };
  resourceOrganizationId: UUID;
  sourceEventRef: EntityRef;
  signalType: RegisteredName;
  /**
   * @maxItems 100
   */
  artifactRefs: EntityRef[];
  scopeRef: EntityRef;
  purposeOfUse: RegisteredName;
  quality?: number;
  capturedAt: Time;
}
export interface AgentTaskContract {
  goalArtifactRef: {
    type: "abh.artifact";
    id: UUID;
    version: Version;
  };
  /**
   * @maxItems 100
   */
  inputRefs: EntityRef[];
  definitionRef: EntityRef;
  outputSchemaRef: EntityRef;
  acceptanceRef?: EntityRef;
  modelRouteRef: {
    type: "abh.model-route";
    id: UUID;
    version: Version;
  };
  /**
   * @maxItems 50
   */
  toolBindingRefs: {
    type: "abh.tool-binding";
    id: UUID;
    version: Version;
  }[];
  maxTurns: number;
  maxTokens: number;
  maxCostMicros?: number;
  deadline?: Time;
  contextDigest: Digest;
}
export interface RuntimeEvent {
  invocationRef: {
    type: "abh.invocation";
    id: UUID;
    version: Version;
  };
  sequence: number;
  occurredAt: Time;
  kind: "Started" | "TurnCompleted" | "ToolRequested" | "ToolObserved" | "OutputReady" | "Stopped" | "Failed";
  payloadRef?: EntityRef;
  stopReason?:
    "Completed" | "BudgetExceeded" | "Deadline" | "NoProgress" | "Cancelled" | "DependencyFailure" | "InvalidOutput";
}
export interface ProjectionQueryResult {
  projection: ProjectionEnvelope;
  asOf: Time;
}
export interface ProjectionListResult {
  /**
   * @maxItems 100
   */
  projections: ProjectionEnvelope[];
  cursor?: string;
  asOf: Time;
}
export interface ProjectionChangedEvent {
  subjectRef: EntityRef;
  projectionType: RegisteredName;
  version: Version;
  watermark: number;
  occurredAt: Time;
}
export interface ActionTimelineProjection {
  actionRef: {
    type: "abh.action";
    id: UUID;
    version: Version;
  };
  intentSummary: {
    [k: string]: unknown;
  };
  approvalStatus: string;
  /**
   * @maxItems 100
   */
  operationSummaries: {
    [k: string]: unknown;
  }[];
  unknownCount: number;
  /**
   * @maxItems 100
   */
  compensationRefs?: EntityRef[];
  updatedAt: Time;
}
export interface ResponsibilityInboxProjection {
  requestRef: {
    type: "abh.responsibility-request";
    id: UUID;
    version: Version;
  };
  responsibilityKind: RegisteredName;
  assigneeRef: EntityRef;
  impactSummary: string;
  deadline?: Time;
  /**
   * @maxItems 100
   */
  evidenceRefs?: EntityRef[];
  /**
   * @maxItems 10
   */
  availableResponses: string[];
  updatedAt: Time;
}
export interface InvocationHandle {
  invocationRef: {
    type: "abh.invocation";
    id: UUID;
    version: Version;
  };
  lastEventSequence: number;
  runtimeStatus: "Created" | "Running" | "Waiting" | "Completed" | "Failed" | "Cancelled";
  stopReason?: string;
  usageRef?: EntityRef;
}
export interface BuildMissionSummaryPayload {
  subjectRef: {
    type: "abh.mission";
    id: UUID;
    version: Version;
  };
}
export interface ResolvedDevelopmentConfig {
  deployment: {
    profile: "Development";
  };
  identity: {
    provider: "Fake";
  };
  database: {
    runtimeUrlRef: string;
    queueUrlRef: string;
    statementTimeoutMs: number;
    lockTimeoutMs: number;
  };
  runtime: {
    businessEntry: string;
    mode: "ActionOnly";
    action: {
      maxOperations: number;
      maxDependencies: number;
      intentExpirySeconds: number;
    };
    queue: {
      publishBatch: number;
      pollIntervalMs: number;
    };
    reconciliation: {
      initialDelaySeconds: number;
      maxDelaySeconds: number;
    };
  };
  web: {
    enabled: false;
  };
  observability: {
    projectTelemetry: false;
  };
}
export interface CreateMissionCommand {
  type: "abh.missions.create";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: CreateMissionPayload;
}
export interface CreateMissionHttpRequest {
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: CreateMissionPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface ActivateMissionCommand {
  type: "abh.missions.activate";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ActivateMissionPayload;
  expectedVersion: Version;
}
export interface ActivateMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ActivateMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface SubmitTriggerCommand {
  type: "abh.missions.submit-trigger";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: SubmitTriggerPayload;
}
export interface SubmitTriggerHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: SubmitTriggerPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface PauseMissionCommand {
  type: "abh.missions.pause";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: PauseMissionPayload;
  expectedVersion: Version;
}
export interface PauseMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: PauseMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface CancelMissionCommand {
  type: "abh.missions.cancel";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: CancelMissionPayload;
  expectedVersion: Version;
}
export interface CancelMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: CancelMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface ResumeMissionCommand {
  type: "abh.missions.resume";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ResumeMissionPayload;
  expectedVersion: Version;
}
export interface ResumeMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ResumeMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface ReviseMissionGoalCommand {
  type: "abh.missions.revise-goal";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ReviseMissionGoalPayload;
  expectedVersion: Version;
}
export interface ReviseMissionGoalHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ReviseMissionGoalPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface CloseMissionCommand {
  type: "abh.missions.close";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: CloseMissionPayload;
  expectedVersion: Version;
}
export interface CloseMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: CloseMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface BlockMissionCommand {
  type: "abh.missions.block";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: BlockMissionPayload;
  expectedVersion: Version;
}
export interface BlockMissionHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: BlockMissionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface ResolveBlockerCommand {
  type: "abh.missions.resolve-blocker";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ResolveBlockerPayload;
  expectedVersion: Version;
}
export interface ResolveBlockerHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: ResolveBlockerPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface FailPackInspectionCommand {
  type: "abh.pack-inspection-jobs.fail";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: FailPackInspectionPayload;
  expectedVersion: Version;
}
export interface FailLostPackInspectionCommand {
  type: "abh.pack-inspection-jobs.fail-lost-lease";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: FailLostPackInspectionPayload;
  expectedVersion: Version;
}
export interface AcceptPackInspectionDeliveryCommand {
  type: "abh.pack-inspection-jobs.accept-delivery";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: AcceptPackInspectionDeliveryPayload;
}
export interface CancelPackInspectionCommand {
  type: "abh.pack-inspection-jobs.cancel";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: CancelPackInspectionPayload;
  expectedVersion: Version;
}
export interface WaitPackInspectionCommand {
  type: "abh.pack-inspection-jobs.wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: WaitPackInspectionPayload;
  expectedVersion: Version;
}
export interface CompletePackInspectionCommand {
  type: "abh.pack-inspection-jobs.complete";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: CompletePackInspectionPayload;
  expectedVersion: Version;
}
export interface ExpirePackInspectionCommand {
  type: "abh.pack-inspection-jobs.expire";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: ExpirePackInspectionPayload;
  expectedVersion: Version;
}
export interface StartPackInspectionCommand {
  type: "abh.pack-inspection-jobs.start";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pack-inspection-job";
    id: UUID;
  };
  payload: StartPackInspectionPayload;
  expectedVersion: Version;
}
export interface RequestPackInspectionCommand {
  type: "abh.packs.request-inspection";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RequestPackInspectionPayload;
}
export interface RecordPackDataImpactCommand {
  type: "abh.packs.record-data-impact";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RecordPackDataImpactPayload;
}
export interface RegisterPackCapabilitiesCommand {
  type: "abh.packs.register-capabilities";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RegisterPackCapabilitiesPayload;
}
export interface RecordCompatibleQueryEvidenceCommand {
  type: "abh.operations.record-compatible-query-evidence";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RecordCompatibleQueryEvidencePayload;
}
export interface RetirePackCommand {
  type: "abh.packs.retire";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RetirePackPayload;
}
export interface SuspendPackCommand {
  type: "abh.packs.suspend";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: SuspendPackPayload;
}
export interface EnablePackCommand {
  type: "abh.packs.enable";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: EnablePackPayload;
}
export interface RequestPackEnableCommand {
  type: "abh.packs.request-enable";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RequestPackEnablePayload;
}
export interface RecordPackConformanceCommand {
  type: "abh.packs.record-conformance";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RecordPackConformancePayload;
}
export interface StagePackCommand {
  type: "abh.packs.stage";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: StagePackPayload;
}
export interface PublishPackTrustPolicyCommand {
  type: "abh.packs.publish-trust-policy";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: PublishPackTrustPolicyPayload;
}
export interface RecordPackValidationCommand {
  type: "abh.packs.record-validation";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: RecordPackValidationPayload;
}
export interface ReviseResponsibilityRouteCommand {
  type: "abh.responsibility-requests.revise-route";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-request";
    id: UUID;
  };
  payload: ReviseResponsibilityRoutePayload;
  expectedVersion: Version;
}
export interface RevokeResponsibilityCommand {
  type: "abh.responsibilities.revoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-assignment";
    id: UUID;
  };
  payload: RevokeResponsibilityPayload;
  expectedVersion: Version;
}
export interface ExpireResponsibilityRequestCommand {
  type: "abh.responsibility-requests.expire";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-request";
    id: UUID;
  };
  payload: RequestRef;
  expectedVersion: Version;
}
export interface RetryResponsibilityRouteCommand {
  type: "abh.responsibility-requests.retry-route";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-request";
    id: UUID;
  };
  payload: OpenResponsibilityRequestPayload;
  expectedVersion: Version;
}
export interface OpenTerminalExceptionCommand {
  type: "abh.exceptions.open-terminal";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.reconciliation";
    id: UUID;
  };
  payload: OpenTerminalExceptionPayload;
}
export interface CreateScopeAuthorityCommand {
  type: "abh.execution-authority.create";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.execution-authority";
    id: UUID;
  };
  payload: CreateScopeAuthorityPayload;
}
export interface EvaluateScopeAuthorityCommand {
  type: "abh.execution-authority.evaluate-scope";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.principal";
    id: UUID;
  };
  payload: ScopeAuthorityDraft;
  expectedVersion: Version;
}
export interface CaptureQueryCommand {
  type: "abh.operations.capture-query";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: CaptureQueryPayload;
  expectedVersion: Version;
}
export interface ClaimQueryExitCommand {
  type: "abh.operations.claim-query-exit";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: ClaimQueryExitPayload;
  expectedVersion: Version;
}
export interface NotifyOperationWaitCommand {
  type: "abh.operations.notify-wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation-wait";
    id: UUID;
  };
  payload: NotifyOperationWaitPayload;
  expectedVersion: Version;
}
export interface ExecuteWaitPortCommand {
  type: "abh.runtime.execute-wait-port";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.durable-wait";
    id: UUID;
  };
  payload: ExecuteWaitPortPayload;
  expectedVersion: Version;
}
export interface NotifyActionWaitCommand {
  type: "abh.actions.notify-wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action-wait";
    id: UUID;
  };
  payload: NotifyActionWaitPayload;
  expectedVersion: Version;
}
export interface RegisterDurableWaitCommand {
  type: "abh.runtime.register-wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.durable-wait";
    id: UUID;
  };
  payload: RegisterDurableWaitPayload;
  expectedVersion: Version;
}
export interface RecheckDurableWaitCommand {
  type: "abh.runtime.recheck-wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.durable-wait";
    id: UUID;
  };
  payload: RecheckDurableWaitPayload;
  expectedVersion: Version;
}
export interface CancelDurableWaitCommand {
  type: "abh.runtime.cancel-wait";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.durable-wait";
    id: UUID;
  };
  payload: CancelDurableWaitPayload;
  expectedVersion: Version;
}
export interface PrepareOutboxCommand {
  type: "abh.runtime.prepare-outbox";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.event";
    id: UUID;
  };
  payload: PrepareOutboxPayload;
  expectedVersion: Version;
}
export interface RecordOutboxConsumptionCommand {
  type: "abh.runtime.record-outbox-consumption";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.outbox-routing";
    id: UUID;
  };
  payload: RecordOutboxConsumptionPayload;
  expectedVersion: Version;
}
export interface RecordOutboxDeliveryCommand {
  type: "abh.runtime.record-outbox-delivery";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.outbox-routing";
    id: UUID;
  };
  payload: RecordOutboxDeliveryPayload;
  expectedVersion: Version;
}
export interface ConsumeEventCommand {
  type: "abh.runtime.consume-event";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.event";
    id: UUID;
  };
  payload: ConsumeEventPayload;
  expectedVersion: Version;
}
export interface BuildMissionSummaryCommand {
  type: "abh.projections.build-mission-summary";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: BuildMissionSummaryPayload;
  expectedVersion: Version;
}
export interface RefreshMissionSummaryCommand {
  type: "abh.projections.refresh-mission-summary";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: RefreshMissionSummaryPayload;
}
export interface RefreshMissionSummaryHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: RefreshMissionSummaryPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface RefreshActionAuthorizationCommand {
  type: "abh.actions.refresh-authorization";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: RefreshActionPayload;
  expectedVersion: Version;
}
export interface CleanupActionCommand {
  type: "abh.actions.cleanup";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: CleanupActionPayload;
  expectedVersion: Version;
}
export interface AggregateActionCommand {
  type: "abh.actions.aggregate";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: AggregateActionPayload;
  expectedVersion: Version;
}
export interface RecoverOperationCommand {
  type: "abh.operations.recover";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: RecoverOperationPayload;
  expectedVersion: Version;
}
export interface ApplyReconciliationCommand {
  type: "abh.operations.apply-reconciliation";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: ApplyReconciliationPayload;
  expectedVersion: Version;
}
export interface CompareOperationCommand {
  type: "abh.operations.reconcile";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: CompareOperationPayload;
  expectedVersion: Version;
}
export interface CaptureTransportCommand {
  type: "abh.operations.capture-transport";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: CaptureTransportPayload;
  expectedVersion: Version;
}
export interface RecordOperationReceiptCommand {
  type: "abh.operations.record-receipt";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: RecordOperationReceiptPayload;
  expectedVersion: Version;
}
export interface ClaimDispatchExitCommand {
  type: "abh.operations.claim-exit";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.dispatch-permit";
    id: UUID;
  };
  payload: ClaimDispatchExitPayload;
  expectedVersion: Version;
}
export interface IssueDispatchPermitCommand {
  type: "abh.operations.issue-permit";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.operation";
    id: UUID;
  };
  payload: IssueDispatchPermitPayload;
  expectedVersion: Version;
}
export interface ProposeActionCommand {
  type: "abh.actions.propose";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: ProposeActionPayload;
}
export interface ProposeActionHttpRequest {
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: ProposeActionPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface CancelActionCommand {
  type: "abh.actions.cancel";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: CancelActionPayload;
  expectedVersion: Version;
}
export interface CancelActionHttpRequest {
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: CancelActionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface RequestAuthorizationCommand {
  type: "abh.actions.request-authorization";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: RequestAuthorizationPayload;
  expectedVersion: Version;
}
export interface RequestAuthorizationHttpRequest {
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: RequestAuthorizationPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface SubmitDecisionCommand {
  type: "abh.decisions.submit";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.decision";
    id: UUID;
  };
  payload: SubmitDecisionPayload;
  expectedVersion: Version;
}
export interface SubmitDecisionHttpRequest {
  target: {
    type: "abh.decision";
    id: UUID;
  };
  payload: SubmitDecisionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface WithdrawDecisionCommand {
  type: "abh.decisions.withdraw";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.decision";
    id: UUID;
  };
  payload: WithdrawDecisionPayload;
  expectedVersion: Version;
}
export interface WithdrawDecisionHttpRequest {
  target: {
    type: "abh.decision";
    id: UUID;
  };
  payload: WithdrawDecisionPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface ValidateActionCommand {
  type: "abh.actions.validate";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: ValidateActionPayload;
  expectedVersion: Version;
}
export interface RegisterOperationPlanCommand {
  type: "abh.actions.register-plan";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: RegisterOperationPlanPayload;
  expectedVersion: Version;
}
export interface ConfigureLedgerCommand {
  type: "abh.ledgers.configure";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.ledger";
    id: UUID;
  };
  payload: ConfigureLedgerPayload;
}
export interface ReserveAllCommand {
  type: "abh.reservations.reserve";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.reservation";
    id: UUID;
  };
  payload: ReserveAllPayload;
}
export interface ConsumeReservationCommand {
  type: "abh.reservations.consume";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.reservation";
    id: UUID;
  };
  payload: ConsumeReservationPayload;
  expectedVersion: Version;
}
export interface ReleaseReservationCommand {
  type: "abh.reservations.release";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.reservation";
    id: UUID;
  };
  payload: ReleaseReservationPayload;
  expectedVersion: Version;
}
export interface RevokeGrantCommand {
  type: "abh.grants.revoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.grant";
    id: UUID;
  };
  payload: RevokeGrantPayload;
  expectedVersion: Version;
}
export interface ConfigureStaticReleaseCommand {
  type: "abh.releases.configure-static";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.release";
    id: UUID;
  };
  payload: ConfigureStaticReleasePayload;
}
export interface ResolveStaticPinsCommand {
  type: "abh.releases.resolve-pins";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.pin-set";
    id: UUID;
  };
  payload: ResolveStaticPinsPayload;
}
export interface StopStaticAssignmentCommand {
  type: "abh.assignments.pause";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.assignment";
    id: UUID;
  };
  payload: StopStaticAssignmentPayload;
  expectedVersion: Version;
}
export interface StoreInlineArtifactCommand {
  type: "abh.artifacts.store-inline";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: StoreInlineArtifactPayload;
}
export interface StoreInlineArtifactHttpRequest {
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: StoreInlineArtifactPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface TombstoneArtifactCommand {
  type: "abh.artifacts.tombstone";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.artifact";
    id: UUID;
  };
  payload: TombstoneArtifactPayload;
  expectedVersion: Version;
}
export interface OpenCommitmentCommand {
  type: "abh.commitments.open";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.commitment";
    id: UUID;
  };
  payload: OpenCommitmentPayload;
}
export interface SettleCommitmentCommand {
  type: "abh.commitments.settle";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.commitment";
    id: UUID;
  };
  payload: SettleCommitmentPayload;
  expectedVersion: Version;
}
export interface AdjustCommitmentCommand {
  type: "abh.commitments.adjust";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.commitment";
    id: UUID;
  };
  payload: AdjustCommitmentPayload;
  expectedVersion: Version;
}
export interface BeginCloseCommitmentCommand {
  type: "abh.commitments.begin-close";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.commitment";
    id: UUID;
  };
  payload: BeginCloseCommitmentPayload;
  expectedVersion: Version;
}
export interface CloseCommitmentCommand {
  type: "abh.commitments.close";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.commitment";
    id: UUID;
  };
  payload: CloseCommitmentPayload;
  expectedVersion: Version;
}
export interface AssignResponsibilityCommand {
  type: "abh.responsibilities.assign";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-assignment";
    id: UUID;
  };
  payload: AssignResponsibilityPayload;
}
export interface OpenResponsibilityRequestCommand {
  type: "abh.responsibility-requests.open";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.responsibility-request";
    id: UUID;
  };
  payload: OpenResponsibilityRequestPayload;
}
export interface IssueExecutionAuthorityCommand {
  type: "abh.execution-authority.issue-effect";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.execution-authority";
    id: UUID;
  };
  payload: IssueExecutionAuthorityPayload;
}
export interface RevokeExecutionAuthorityCommand {
  type: "abh.execution-authority.revoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.execution-authority";
    id: UUID;
  };
  payload: RevokeExecutionAuthorityPayload;
  expectedVersion: Version;
}
export interface PinActionCommand {
  type: "abh.actions.pin";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.action";
    id: UUID;
  };
  payload: PinActionPayload;
  expectedVersion: Version;
}
export interface ConfigurePolicyCommand {
  type: "abh.policies.configure";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.policy-version";
    id: UUID;
  };
  payload: ConfigurePolicyPayload;
}
export interface ActivateMandatoryPolicyCommand {
  type: "abh.policies.activate-mandatory";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: ActivateMandatoryPolicyPayload;
}
export interface ConfigureResourceEnvelopeCommand {
  type: "abh.resource-envelopes.configure";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.resource-envelope";
    id: UUID;
  };
  payload: ConfigureResourceEnvelopePayload;
}
export interface ConfigurePurposeCommand {
  type: "abh.purposes.configure";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.purpose";
    id: UUID;
  };
  payload: ConfigurePurposePayload;
}
export interface ConfigureConnectionCommand {
  type: "abh.connections.configure";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.connection";
    id: UUID;
  };
  payload: ConfigureConnectionPayload;
}
export interface RevokePurposeCommand {
  type: "abh.purposes.revoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.purpose";
    id: UUID;
  };
  payload: RevokeDirectoryRecordPayload;
  expectedVersion: Version;
}
export interface RevokeConnectionCommand {
  type: "abh.connections.revoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.connection";
    id: UUID;
  };
  payload: RevokeDirectoryRecordPayload;
  expectedVersion: Version;
}
export interface ClaimWorkLeaseCommand {
  type: "abh.work-leases.claim";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: ClaimWorkLeasePayload;
}
export interface RenewWorkLeaseCommand {
  type: "abh.work-leases.renew";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.work-lease";
    id: UUID;
  };
  payload: RenewWorkLeasePayload;
  expectedVersion: Version;
}
export interface ReleaseWorkLeaseCommand {
  type: "abh.work-leases.release";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.work-lease";
    id: UUID;
  };
  payload: ReleaseWorkLeasePayload;
  expectedVersion: Version;
}
export interface StartRunCommand {
  type: "abh.runs.start";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: StartRunPayload;
}
export interface StartRunHttpRequest {
  target: {
    type: "abh.mission";
    id: UUID;
  };
  payload: StartRunPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface CompleteRunCommand {
  type: "abh.runs.complete";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.run";
    id: UUID;
  };
  payload: CompleteRunPayload;
  expectedVersion: Version;
}
export interface CompleteRunHttpRequest {
  target: {
    type: "abh.run";
    id: UUID;
  };
  payload: CompleteRunPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface CancelRunCommand {
  type: "abh.runs.cancel";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.run";
    id: UUID;
  };
  payload: CancelRunPayload;
  expectedVersion: Version;
}
export interface CancelRunHttpRequest {
  target: {
    type: "abh.run";
    id: UUID;
  };
  payload: CancelRunPayload;
  expectedVersion?: Version;
  idempotencyKey?: IdempotencyKey;
}
export interface RecoverRunCommand {
  type: "abh.runs.recover";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.run";
    id: UUID;
  };
  payload: RecoverRunPayload;
  expectedVersion: Version;
}
export interface SubmitVerificationCommand {
  type: "abh.verification.submit";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.task";
    id: UUID;
  };
  payload: SubmitVerificationPayload;
}
export interface SubmitVerificationHttpRequest {
  target: {
    type: "abh.task";
    id: UUID;
  };
  payload: SubmitVerificationPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface InvokeToolCommand {
  type: "abh.tools.invoke";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.tool-binding";
    id: UUID;
  };
  payload: InvokeToolPayload;
}
export interface InvokeToolHttpRequest {
  target: {
    type: "abh.tool-binding";
    id: UUID;
  };
  payload: InvokeToolPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface CaptureSignalCommand {
  type: "abh.learning.capture-signal";
  schemaVersion: "0.1.0";
  commandId: UUID;
  idempotencyKey: IdempotencyKey;
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: CaptureSignalPayload;
}
export interface CaptureSignalHttpRequest {
  target: {
    type: "abh.organization";
    id: UUID;
  };
  payload: CaptureSignalPayload;
  idempotencyKey?: IdempotencyKey;
}
export interface QueryPackCapabilitiesQuery {
  kind: RegisteredName;
  capabilityId?: RegisteredName;
  version?: ExactVersion;
  versionRange?: string;
  limit: number;
}
export interface GetMissionQuery {
  id: UUID;
}
export interface ListMissionsQuery {
  missionStatus?: MissionState;
  domainType?: RegisteredName;
  workspaceId?: UUID;
  cursor?: string;
  limit?: number;
}
export interface GetRunQuery {
  id: UUID;
}
export interface GetToolCallQuery {
  id: UUID;
}
export interface ListRunsQuery {
  missionStatus?: MissionState;
  missionId?: UUID;
  cursor?: string;
  limit?: number;
}
export interface GetContextQuery {
  id: UUID;
}
export interface GetProjectionQuery {
  id: UUID;
  type: RegisteredName;
  fieldSet?: string;
}
export interface ListProjectionQuery {
  type: RegisteredName;
  missionStatus?: MissionState;
  domainType?: RegisteredName;
  cursor?: string;
  limit?: number;
}
export interface GetActionQuery {
  consistency?: "Strong" | "Projection";
}
export interface ListActionsQuery {
  missionId?: UUID;
  type?: RegisteredName;
  lifecycle?: ActionState;
  outcome?: ActionOutcome;
  cursor?: string;
  limit?: number;
  consistency?: "Strong" | "Projection";
}
export interface GetDecisionQuery {
  id: UUID;
  consistency?: "Strong" | "Projection";
}
export interface ListInboxQuery {
  status?: DecisionState;
  type?: RegisteredName;
  expiry?: Time;
  cursor?: string;
  limit?: number;
  consistency?: "Strong" | "Projection";
}
export interface InspectPackInspectionJobQuery {
  id: UUID;
  consistency?: "Strong" | "Projection";
}
export interface ErrorResponse {
  success: false;
  error:
    | {
        code: "MISSION_DEFINITION_INVALID";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "MISSION_AUTHORITY_MISSING";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "MISSION_BLOCKED";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "GOAL_AUTHORITY_INSUFFICIENT";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "MISSION_EFFECT_PENDING";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "RUN_ALREADY_ACTIVE";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "BLOCKER_EVIDENCE_INVALID";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "LAST_REQUIRED_RESPONSIBILITY";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "INVALID_ARGUMENT";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "SCHEMA_UNSUPPORTED";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "LIMIT_EXCEEDED";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "EXECUTION_AUTHORITY_INVALID";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "UNAUTHENTICATED";
        category: "Authentication";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "CONTEXT_EXPIRED";
        category: "Authentication";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "FORBIDDEN";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "PURPOSE_DENIED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "EPOCH_REVOKED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "EXECUTION_AUTHORITY_SCOPE_EXCEEDED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "POLICY_DENIED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "AUTONOMY_EXCEEDED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "RESOURCE_NOT_FOUND";
        category: "NotFound";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "VERSION_CONFLICT";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "IDEMPOTENCY_CONFLICT";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "ASSIGNMENT_AMBIGUOUS";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "EXECUTION_AUTHORITY_AMBIGUOUS";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "PIN_INPUT_CONFLICT";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "PRECONDITION_FAILED";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "AUTHORITY_REQUIRED";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "CAPABILITY_UNAVAILABLE";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "POLICY_INPUT_MISSING";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "OBLIGATION_CONFLICT";
        category: "Precondition";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "RATE_LIMITED";
        category: "Capacity";
        message: string;
        retryable: boolean;
        correlationId: UUID;
      }
    | {
        code: "RESOURCE_EXHAUSTED";
        category: "Capacity";
        message: string;
        retryable: boolean;
        correlationId: UUID;
      }
    | {
        code: "DEPENDENCY_UNAVAILABLE";
        category: "Dependency";
        message: string;
        retryable: boolean;
        correlationId: UUID;
      }
    | {
        code: "DEPENDENCY_TIMEOUT";
        category: "Dependency";
        message: string;
        retryable: boolean;
        correlationId: UUID;
      }
    | {
        code: "INTERNAL_ERROR";
        category: "Internal";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "TENANT_CONTEXT_REQUIRED";
        category: "Internal";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "ACTION_DOMAIN_INVALID";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "ACTION_PLAN_SCOPE_EXCEEDED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "ACTION_CHILD_VERSION_CONFLICT";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "AUTHORIZATION_REFRESH_DENIED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "DECISION_PACKAGE_INCOMPLETE";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "DECISION_STALE";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "DECIDER_NOT_ELIGIBLE";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "OPERATION_FACT_CONFLICT";
        category: "Conflict";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "RAW_RECEIPT_UNSUPPORTED";
        category: "Validation";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "RELEASE_SCOPE_MISMATCH";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      }
    | {
        code: "LEARNING_PURPOSE_DENIED";
        category: "Authorization";
        message: string;
        retryable: false;
        correlationId: UUID;
      };
}
