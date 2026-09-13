/* Generated semantic payload field selection. */
export const digestPolicies = {
  "ExecutionAuthority": [
    "resourceOrganizationId",
    "executionPrincipalRef",
    "allowedProposerRefs",
    "binding",
    "grantRefs",
    "scopeRefs",
    "purposeRefs",
    "actionTypes",
    "resourceEnvelopeRef",
    "validFrom",
    "validUntil",
    "stopConditions",
    "issuanceEvidenceRef",
    "effectKey",
    "issuedBy",
    "sourceVersionRefs",
    "supersedesAuthorityRef"
  ],
  "PinSet": [
    "resourceOrganizationId",
    "subjectRef",
    "subjectInputDigest",
    "requiredSlotsDigest",
    "pins"
  ],
  "OperationPlan": [
    "actionRef",
    "planVersion",
    "pinSetRef",
    "pinSetDigest",
    "validatedAgainstPayloadDigest",
    "compilerRef",
    "connectorRefs",
    "scopeProofRef",
    "completionPolicyRef",
    "impactUpperBound",
    "nodes"
  ],
  "DecisionPackage": [
    "requestRef",
    "routeRevision",
    "slotId",
    "subjectRef",
    "proposalDigest",
    "question",
    "recommendation",
    "alternatives",
    "impactUpperBound",
    "risks",
    "evidenceRefs",
    "validUntil",
    "allowedResponses"
  ],
  "ConformanceReport": [
    "subjectDigest",
    "suiteVersion",
    "status",
    "caseResults",
    "claimedCapabilities",
    "knownDeviations",
    "environment",
    "startedAt",
    "finishedAt",
    "artifactRefs"
  ],
  "PackValidationReport": [
    "packId",
    "packVersion",
    "subjectDigest",
    "manifestDigest",
    "artifactSetDigest",
    "deploymentPolicyDigest",
    "signatureBundleDigest",
    "provenanceBundleDigest",
    "conformanceBundleDigest",
    "conformanceReportDigest",
    "validatedAt",
    "validUntil",
    "profile"
  ],
  "PackMigrationStructureReport": [
    "binding",
    "environmentDigest",
    "deploymentVersion",
    "issuedAt",
    "expiresAt"
  ],
  "PackMigrationDataReport": [
    "binding",
    "environmentDigest",
    "deploymentVersion",
    "issuedAt",
    "expiresAt"
  ],
  "PackMigrationDataObservation": [
    "result",
    "observedAt"
  ],
  "PackMigrationStructureObservation": [
    "result",
    "observedAt"
  ],
  "PackMigrationStateObservation": [
    "result",
    "observedAt"
  ],
  "CorrectionRecord": [
    "correctionRef",
    "resourceOrganizationId",
    "subjectRef",
    "subjectVersion",
    "beforeRef",
    "proposedAfterRef",
    "targetOwner",
    "reason",
    "evidenceRefs",
    "responsibilityRef",
    "purpose",
    "receiptRef",
    "proposedBy",
    "proposedAt"
  ],
  "CorrectionApplicationRecord": [
    "applicationRef",
    "resourceOrganizationId",
    "correctionRef",
    "subjectRef",
    "subjectVersionBefore",
    "targetOwner",
    "authorityRef",
    "evidenceRefs",
    "resultRef",
    "resultVersion",
    "receiptRef",
    "appliedBy",
    "appliedAt"
  ],
  "OperationReconciliationRecord": [
    "resourceOrganizationId",
    "operationRef",
    "observationRefs",
    "comparisonRuleRef",
    "verdict",
    "reason",
    "recordedAt",
    "receiptRefs",
    "planRef",
    "payloadDigest",
    "confirmedExternal",
    "permitRef"
  ],
  "ActionIntentRecord": [
    "actionRef",
    "resourceOrganizationId",
    "proposal",
    "executionPrincipalRef",
    "payloadDigest",
    "riskClass",
    "impactUpperBound",
    "requiredBehaviorSlots",
    "maxOperations",
    "expiresAt",
    "purposeNames",
    "safetyStop"
  ],
  "PolicyVersionRecord": [
    "resourceOrganizationId",
    "kind",
    "artifactRef",
    "manifestDigest",
    "wasmDigest",
    "entrypoint",
    "inputSchemaName",
    "ownerRef",
    "releaseEvidenceRefs",
    "behaviorCapabilityRef"
  ],
  "ResourceEnvelopeRecord": [
    "resourceOrganizationId",
    "scopeRefs",
    "bindings",
    "evidenceRefs",
    "purposeNames"
  ],
  "AuthorizationSnapshotRecord": [
    "resourceOrganizationId",
    "actorRef",
    "actionRef",
    "executionPrincipalRef",
    "authorityRef",
    "purposeOfUse",
    "intentDigest",
    "payloadDigest",
    "pinSetRef",
    "pinSetDigest",
    "planRef",
    "planDigest",
    "sourceVersionRefs",
    "grantRefs",
    "epochVector",
    "policyEvaluationRefs",
    "policyBindingRef",
    "reservationRefs",
    "commitmentRefs",
    "issuedAt",
    "validUntil",
    "resourceOriginSnapshotRef",
    "previousSnapshotRef"
  ],
  "DispatchPermitRecord": [
    "permitRef",
    "resourceOrganizationId",
    "actionRef",
    "operationRef",
    "attemptRef",
    "ordinal",
    "snapshotRef",
    "workerId",
    "leaseRef",
    "leaseFencingToken",
    "resourceFenceRef",
    "resourceFencingToken",
    "connectorRef",
    "payloadRef",
    "payloadDigest",
    "providerIdempotencyKey",
    "policyEvaluationRefs",
    "issuedAt",
    "expiresAt",
    "dependencyRefs"
  ],
  "ActionResultRecord": [
    "resourceOrganizationId",
    "actionRef",
    "planRef",
    "aggregationRuleRef",
    "operationVersionRefs",
    "reconciliationRefs",
    "resourceSettlements",
    "outcome",
    "recordedAt"
  ],
  "ActionCleanupRecord": [
    "resourceOrganizationId",
    "actionRef",
    "snapshotRef",
    "planRef",
    "mode",
    "reason",
    "releasedReservationRefs",
    "checkedAt"
  ],
  "TransportCaptureRecord": [
    "resourceOrganizationId",
    "attemptRef",
    "exitRef",
    "transportStatus",
    "normalization",
    "observationRef",
    "observedAt",
    "rawArtifactRef",
    "receiptRef"
  ],
  "InboxRecord": [
    "resourceOrganizationId",
    "consumerId",
    "eventRef",
    "eventDigest",
    "sourceAggregateRef",
    "sourceEventOrdinal",
    "resultRef",
    "handledAt"
  ],
  "OutboxRoutingRecord": [
    "resourceOrganizationId",
    "eventRef",
    "eventDigest",
    "routingRuleRef",
    "deliveries",
    "preparedAt"
  ],
  "OutboxDeliveryRecord": [
    "resourceOrganizationId",
    "routingRef",
    "consumerId",
    "jobRef",
    "recordedAt"
  ],
  "OutboxPublicationRecord": [
    "resourceOrganizationId",
    "routingRef",
    "eventRef",
    "deliveryRefs",
    "recordedAt"
  ],
  "DurableWaitRecord": [
    "waitRef",
    "resourceOrganizationId",
    "ownerRef",
    "waitKey",
    "dueAt",
    "causeRef",
    "authorityRef",
    "conditionRef",
    "sourceRef",
    "registrationDigest",
    "waitingIntentRef",
    "status",
    "source",
    "registeredAt",
    "resolvedAt",
    "wakeupRef",
    "cancelReason"
  ],
  "DurableWakeupRecord": [
    "wakeupRef",
    "resourceOrganizationId",
    "waitRef",
    "ownerRef",
    "authorityRef",
    "reason",
    "source",
    "triggerEventRef",
    "createdAt"
  ],
  "WaitPortReceiptRecord": [
    "receiptRef",
    "resourceOrganizationId",
    "waitRef",
    "method",
    "inputDigest",
    "result",
    "recordedAt",
    "triggerEventRef"
  ],
  "ActionWaitRecord": [
    "bindingRef",
    "resourceOrganizationId",
    "actionRef",
    "requestRef",
    "waitRef",
    "authorityRef",
    "payloadDigest",
    "outcome",
    "wakeupRef",
    "recordedAt",
    "cancelledWaitRef"
  ],
  "OperationWaitRecord": [
    "bindingRef",
    "resourceOrganizationId",
    "actionRef",
    "operationRef",
    "waitRef",
    "authorityRef",
    "payloadDigest",
    "outcome",
    "wakeupRef",
    "recordedAt",
    "cancelledWaitRef"
  ],
  "QueryExitRecord": [
    "exitRef",
    "resourceOrganizationId",
    "operationRef",
    "actionRef",
    "queryAuthorityRef",
    "authorityDigest",
    "queryPolicyRef",
    "connectionRef",
    "accountRef",
    "connectorRef",
    "providerIdempotencyKey",
    "payloadDigest",
    "leaseRef",
    "workerId",
    "leaseFencingToken",
    "reservationRefs",
    "claimedAt",
    "expiresAt",
    "queryConnectorRef",
    "compatibilityEvidenceRef",
    "compatibilityEvidenceDigest"
  ],
  "QueryCaptureRecord": [
    "captureRef",
    "resourceOrganizationId",
    "exitRef",
    "transportStatus",
    "normalization",
    "observedAt",
    "rawArtifactRef",
    "receiptRef",
    "operationRef"
  ],
  "OutboxConsumptionRecord": [
    "resourceOrganizationId",
    "routingRef",
    "eventRef",
    "publicationRef",
    "inboxRefs",
    "recordedAt"
  ],
  "ExceptionRecord": [
    "exceptionRef",
    "resourceOrganizationId",
    "sourceRef",
    "reportRef",
    "category",
    "severity",
    "impactUpperBound",
    "blockedScopeRefs",
    "requiredResponsibilityRefs",
    "requestRef",
    "proposalDigest",
    "recordedAt"
  ],
  "ExceptionResolutionRecord": [
    "resolutionRef",
    "resourceOrganizationId",
    "exceptionRef",
    "sourceRef",
    "reportRef",
    "requestRef",
    "decisionRef",
    "resolutionKind",
    "evidenceRefs",
    "technicalUnknownPreserved",
    "resourceFreezePreserved",
    "resolvedBy",
    "resolvedAt"
  ],
  "ExceptionResolutionEffectRecord": [
    "effectRef",
    "resourceOrganizationId",
    "resolutionRef",
    "exceptionRef",
    "sourceRef",
    "reportRef",
    "correctionApplicationRef",
    "fenceRef",
    "fencingToken",
    "reportBlockReleased",
    "unresolvedOperationPreserved",
    "fencingTokenPreserved",
    "appliedBy",
    "appliedAt"
  ],
  "ExceptionSuccessorDispatchRecord": [
    "resourceOrganizationId",
    "resolutionRef",
    "exceptionRef",
    "sourceRef",
    "reportRef",
    "resolutionKind",
    "successorRef",
    "dispatchedBy",
    "dispatchedAt"
  ],
  "ActionAuthorizationRequestRecord": [
    "requestRef",
    "resourceOrganizationId",
    "actionRef",
    "sourceCommandRef",
    "requestedBy",
    "executionPrincipalRef",
    "payload",
    "inputDigest",
    "acceptedAt"
  ],
  "PackInspectionDeliveryRecord": [
    "deliveryRef",
    "resourceOrganizationId",
    "jobRef",
    "eventRef",
    "eventDigest",
    "sourceCommandRef",
    "acceptedAt"
  ],
  "PackEnableProposal": [
    "action",
    "resourceOrganizationId",
    "packRef",
    "subjectDigest",
    "expectedDeploymentVersion",
    "environmentDigest",
    "validationRef",
    "governanceRef",
    "governanceDigest",
    "capabilitySetRef",
    "capabilitySetDigest",
    "ctkRef",
    "impactRef",
    "migrationVerificationRef",
    "impactUpperBound",
    "expiresAt"
  ],
  "PackCapabilityRegistration": [
    "capability",
    "schemaPath",
    "implementationRef",
    "healthRef",
    "safetyStop",
    "permissionEnvelope",
    "packRef",
    "subjectDigest",
    "schemaDigest"
  ],
  "PackCapabilitySetRecord": [
    "setRef",
    "packRef",
    "registrations",
    "recordedAt"
  ],
  "MissionConditionRecord": [
    "conditionRef",
    "resourceOrganizationId",
    "missionRef",
    "goalRevision",
    "successConditionRef",
    "stopConditionRef",
    "triggerPolicyRef",
    "resourceEnvelopeRef"
  ],
  "MissionTriggerRecord": [
    "triggerKey",
    "missionRef",
    "sourceEventRef",
    "sourceWatermark",
    "kind",
    "disposition"
  ],
  "MissionBlockerRecord": [
    "blockerRef",
    "resourceOrganizationId",
    "missionRef",
    "blockerType",
    "sourceEvidenceRef",
    "required",
    "resolved"
  ],
  "ContextManifest": [
    "contextRef",
    "resourceOrganizationId",
    "taskRef",
    "goalDigest",
    "inputRefs",
    "purposeOfUse",
    "executionMode"
  ],
  "VerificationReport": [
    "reportRef",
    "resourceOrganizationId",
    "taskRef",
    "invocationRef",
    "resultArtifactRef",
    "resultDigest",
    "verdict"
  ],
  "LearningSignalRecord": [
    "signalRef",
    "resourceOrganizationId",
    "sourceEventRef",
    "signalType",
    "scopeRef",
    "purposeOfUse"
  ],
  "LearningCaseRecord": [
    "caseRef",
    "resourceOrganizationId",
    "signalRefs",
    "rootCauseCode",
    "evidenceRefs",
    "counterEvidenceRefs",
    "domainOwnerRef",
    "receiptRef",
    "builtBy",
    "builtAt"
  ],
  "LearningCandidateRecord": [
    "candidateRef",
    "resourceOrganizationId",
    "caseRef",
    "assetKind",
    "baseVersion",
    "candidateArtifactRef",
    "scopeRef",
    "risk",
    "status",
    "producer",
    "receiptRef",
    "createdAt"
  ],
  "EvaluationProfileRecord": [
    "profileRef",
    "resourceOrganizationId",
    "assetKind",
    "risk",
    "suiteRef",
    "datasetSnapshotRef",
    "evaluatorRef",
    "metricThresholdRef",
    "metricThresholds",
    "stoppingRuleRef",
    "assignmentUnit",
    "minimumSamples",
    "confidenceLevel",
    "minimumRelativeLift",
    "approvedBy",
    "approvedAt"
  ],
  "EvaluationRunRecord": [
    "runRef",
    "resourceOrganizationId",
    "candidateRef",
    "profileRef",
    "baselineRef",
    "retryOfRef",
    "assignmentUnit",
    "seed",
    "executionRefs",
    "status",
    "requestedBy",
    "receiptRef",
    "createdAt",
    "expiresAt"
  ],
  "EvaluationResultRecord": [
    "resultRef",
    "resourceOrganizationId",
    "runRef",
    "candidateRef",
    "profileRef",
    "status",
    "artifactRefs",
    "executionRefs",
    "metricValues",
    "completedSamples",
    "failedSamples",
    "dataDigest",
    "baselineMetricValues",
    "baselineCompletedSamples",
    "baselineFailedSamples",
    "evaluatorPrincipal",
    "receiptRef",
    "submittedAt"
  ],
  "EvaluationGateArtifactRecord": [
    "gateRef",
    "resourceOrganizationId",
    "candidateRef",
    "profileRef",
    "evaluationRefs",
    "metricThresholds",
    "metricValues",
    "baselineMetricValues",
    "uncertainty",
    "limitations",
    "findings",
    "verdict",
    "signedBy",
    "createdAt"
  ],
  "CreateMissionCommand": [
    "type",
    "target",
    "payload"
  ],
  "ActivateMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "SubmitTriggerCommand": [
    "type",
    "target",
    "payload"
  ],
  "PauseMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CancelMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ResumeMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ReviseMissionGoalCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CloseMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "BlockMissionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ResolveBlockerCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "FailPackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "FailLostPackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "AcceptPackInspectionDeliveryCommand": [
    "type",
    "target",
    "payload"
  ],
  "CancelPackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "WaitPackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CompletePackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ExpirePackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "StartPackInspectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RequestPackInspectionCommand": [
    "type",
    "target",
    "payload"
  ],
  "RecordPackDataImpactCommand": [
    "type",
    "target",
    "payload"
  ],
  "RegisterPackCapabilitiesCommand": [
    "type",
    "target",
    "payload"
  ],
  "RecordCompatibleQueryEvidenceCommand": [
    "type",
    "target",
    "payload"
  ],
  "RetirePackCommand": [
    "type",
    "target",
    "payload"
  ],
  "SuspendPackCommand": [
    "type",
    "target",
    "payload"
  ],
  "EnablePackCommand": [
    "type",
    "target",
    "payload"
  ],
  "RequestPackEnableCommand": [
    "type",
    "target",
    "payload"
  ],
  "RecordPackConformanceCommand": [
    "type",
    "target",
    "payload"
  ],
  "StagePackCommand": [
    "type",
    "target",
    "payload"
  ],
  "PublishPackTrustPolicyCommand": [
    "type",
    "target",
    "payload"
  ],
  "RecordPackValidationCommand": [
    "type",
    "target",
    "payload"
  ],
  "ReviseResponsibilityRouteCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "DelegateResponsibilitySlotCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "EscalateResponsibilitySlotCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RevokeResponsibilityCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ExpireResponsibilityRequestCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RetryResponsibilityRouteCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "OpenTerminalExceptionCommand": [
    "type",
    "target",
    "payload"
  ],
  "ResolveExceptionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ApplyExceptionResolutionEffectCommand": [
    "type",
    "target",
    "payload"
  ],
  "ProposeCorrectionCommand": [
    "type",
    "target",
    "payload"
  ],
  "ApplyCorrectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CreateScopeAuthorityCommand": [
    "type",
    "target",
    "payload"
  ],
  "EvaluateScopeAuthorityCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CaptureQueryCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ClaimQueryExitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "NotifyOperationWaitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ExecuteWaitPortCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "NotifyActionWaitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RegisterDurableWaitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecheckDurableWaitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CancelDurableWaitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "PrepareOutboxCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecordOutboxConsumptionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecordOutboxDeliveryCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ConsumeEventCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "BuildMissionSummaryCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RefreshMissionSummaryCommand": [
    "type",
    "target",
    "payload"
  ],
  "RefreshActionAuthorizationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CleanupActionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "AggregateActionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecoverOperationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ApplyReconciliationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CompareOperationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CaptureTransportCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecordOperationReceiptCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ClaimDispatchExitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "IssueDispatchPermitCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "SafeRetryOperationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ProposeActionCommand": [
    "type",
    "target",
    "payload"
  ],
  "StartSafetyStopCommand": [
    "type",
    "target",
    "payload"
  ],
  "CancelActionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RequestAuthorizationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "SubmitDecisionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "WithdrawDecisionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ValidateActionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RegisterOperationPlanCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ConfigureLedgerCommand": [
    "type",
    "target",
    "payload"
  ],
  "RegisterLedgerUnitCommand": [
    "type",
    "target",
    "payload"
  ],
  "RegisterLedgerPeriodCommand": [
    "type",
    "target",
    "payload"
  ],
  "ApplyLedgerCorrectionCommand": [
    "type",
    "target",
    "payload"
  ],
  "ReserveAllCommand": [
    "type",
    "target",
    "payload"
  ],
  "ConsumeReservationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ReleaseReservationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RevokeGrantCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ConfigureStaticReleaseCommand": [
    "type",
    "target",
    "payload"
  ],
  "ResolveStaticPinsCommand": [
    "type",
    "target",
    "payload"
  ],
  "StopStaticAssignmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RollbackStaticAssignmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "StoreInlineArtifactCommand": [
    "type",
    "target",
    "payload"
  ],
  "TombstoneArtifactCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "OpenCommitmentCommand": [
    "type",
    "target",
    "payload"
  ],
  "SettleCommitmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "AdjustCommitmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "BeginCloseCommitmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CloseCommitmentCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "AssignResponsibilityCommand": [
    "type",
    "target",
    "payload"
  ],
  "OpenResponsibilityRequestCommand": [
    "type",
    "target",
    "payload"
  ],
  "IssueExecutionAuthorityCommand": [
    "type",
    "target",
    "payload"
  ],
  "RevokeExecutionAuthorityCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "PinActionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ConfigurePolicyCommand": [
    "type",
    "target",
    "payload"
  ],
  "ActivateMandatoryPolicyCommand": [
    "type",
    "target",
    "payload"
  ],
  "ConfigureResourceEnvelopeCommand": [
    "type",
    "target",
    "payload"
  ],
  "ConfigurePurposeCommand": [
    "type",
    "target",
    "payload"
  ],
  "ConfigureConnectionCommand": [
    "type",
    "target",
    "payload"
  ],
  "RevokePurposeCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RevokeConnectionCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ClaimWorkLeaseCommand": [
    "type",
    "target",
    "payload"
  ],
  "RenewWorkLeaseCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ReleaseWorkLeaseCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "StartRunCommand": [
    "type",
    "target",
    "payload"
  ],
  "CompleteRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CancelRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "RecoverRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "StopStalledRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "WakeRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ProposeGraphPatchCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ClaimTaskCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "PrepareInvocationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "FinalizeInvocationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "CompleteInvocationCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ObserveLateInvocationCommand": [
    "type",
    "target",
    "payload"
  ],
  "CommitVerifiedTaskCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "SubmitVerificationCommand": [
    "type",
    "target",
    "payload"
  ],
  "InvokeToolCommand": [
    "type",
    "target",
    "payload"
  ],
  "CaptureSignalCommand": [
    "type",
    "target",
    "payload"
  ],
  "BuildCaseCommand": [
    "type",
    "target",
    "payload"
  ],
  "CreateCandidateCommand": [
    "type",
    "target",
    "payload"
  ],
  "RequestEvaluationCommand": [
    "type",
    "target",
    "payload"
  ],
  "RetryEvaluationCommand": [
    "type",
    "target",
    "payload"
  ],
  "SubmitEvaluationResultCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ExpireEvaluationRunCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "BuildGateCommand": [
    "type",
    "target",
    "payload",
    "expectedVersion"
  ],
  "ConfigureLearningCandidateReleaseCommand": [
    "type",
    "target",
    "payload"
  ]
} as const;
