/* Generated registration data; installation never grants authority. */
export const coreCatalog = {
  "version": "0.1.0",
  "owner": "ContractMaintainer",
  "namespace": "abh",
  "owners": [
    "ActionEngine",
    "OperationController",
    "HumanGateway",
    "Identity",
    "Control",
    "CapabilityRelease",
    "ArtifactStore",
    "DurableExecution",
    "ResourceLedger",
    "PackLoader",
    "MissionController",
    "RunOrchestrator",
    "ContractMaintainer",
    "ReconciliationService"
  ],
  "objectTypes": [
    {
      "name": "abh.access-record",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.access-record"
    },
    {
      "name": "abh.action",
      "owner": "ActionEngine",
      "scopeKind": "None",
      "description": "abh.action"
    },
    {
      "name": "abh.action-authorization-request",
      "owner": "ActionEngine",
      "scopeKind": "None",
      "description": "Immutable caller request for Action preparation and authorization; never execution authority."
    },
    {
      "name": "abh.action-cleanup",
      "owner": "ActionEngine",
      "scopeKind": "None",
      "description": "Immutable proof of zero-dispatch authorization cleanup."
    },
    {
      "name": "abh.action-result",
      "owner": "ActionEngine",
      "scopeKind": "None",
      "description": "Immutable complete Action result and verified one-shot resource settlement."
    },
    {
      "name": "abh.action-wait",
      "owner": "ActionEngine",
      "scopeKind": "None",
      "description": "Durable waiting evidence."
    },
    {
      "name": "abh.allocation",
      "owner": "CapabilityRelease",
      "scopeKind": "None",
      "description": "abh.allocation"
    },
    {
      "name": "abh.artifact",
      "owner": "ArtifactStore",
      "scopeKind": "None",
      "description": "abh.artifact"
    },
    {
      "name": "abh.assignment",
      "owner": "CapabilityRelease",
      "scopeKind": "None",
      "description": "abh.assignment"
    },
    {
      "name": "abh.attempt",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Immutable identity of one external call."
    },
    {
      "name": "abh.attempt-observation",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Append-only execution-state evidence for an Attempt."
    },
    {
      "name": "abh.audit",
      "owner": "ArtifactStore",
      "scopeKind": "None",
      "description": "abh.audit"
    },
    {
      "name": "abh.authorization-snapshot",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.authorization-snapshot"
    },
    {
      "name": "abh.authorized-context",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.authorized-context"
    },
    {
      "name": "abh.command",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "abh.command"
    },
    {
      "name": "abh.commitment",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.commitment"
    },
    {
      "name": "abh.condition",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.condition"
    },
    {
      "name": "abh.connection",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.connection"
    },
    {
      "name": "abh.credential",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.credential"
    },
    {
      "name": "abh.decision",
      "owner": "HumanGateway",
      "scopeKind": "None",
      "description": "abh.decision"
    },
    {
      "name": "abh.decision-effect",
      "owner": "HumanGateway",
      "scopeKind": "None",
      "description": "abh.decision-effect"
    },
    {
      "name": "abh.deletion-proof",
      "owner": "ArtifactStore",
      "scopeKind": "None",
      "description": "abh.deletion-proof"
    },
    {
      "name": "abh.dispatch-exit",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Durable one-use exit claim; possible transmission remains uncertain until evidence."
    },
    {
      "name": "abh.dispatch-permit",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Short-lived permit for exactly one Attempt and Worker lease."
    },
    {
      "name": "abh.durable-wait",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "abh.durable-wait"
    },
    {
      "name": "abh.durable-wakeup",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable notification to the waiting Owner; does not decide business outcome."
    },
    {
      "name": "abh.event",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "abh.event"
    },
    {
      "name": "abh.exception",
      "owner": "HumanGateway",
      "scopeKind": "Object",
      "description": "Responsibility case bound to immutable contradictory terminal evidence."
    },
    {
      "name": "abh.execution-authority",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.execution-authority"
    },
    {
      "name": "abh.external-observation",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.external-observation"
    },
    {
      "name": "abh.fence",
      "owner": "Control",
      "scopeKind": "Object",
      "description": "Versioned admission and revocation fence."
    },
    {
      "name": "abh.grant",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.grant"
    },
    {
      "name": "abh.identity-evidence",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.identity-evidence"
    },
    {
      "name": "abh.inbox",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable consumer result for one committed source event."
    },
    {
      "name": "abh.installed-pack",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "abh.installed-pack"
    },
    {
      "name": "abh.job",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "abh.job"
    },
    {
      "name": "abh.ledger",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.ledger"
    },
    {
      "name": "abh.ledger-entry",
      "owner": "ResourceLedger",
      "scopeKind": "Object",
      "description": "Immutable exact-decimal ledger change."
    },
    {
      "name": "abh.membership",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.membership"
    },
    {
      "name": "abh.mission",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.mission"
    },
    {
      "name": "abh.mission-authority",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.mission-authority"
    },
    {
      "name": "abh.operation",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "abh.operation"
    },
    {
      "name": "abh.operation-plan",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "abh.operation-plan"
    },
    {
      "name": "abh.operation-receipt",
      "owner": "OperationController",
      "scopeKind": "Object",
      "description": "Immutable external operation evidence."
    },
    {
      "name": "abh.operation-wait",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Operation reconciliation waiting intent and notification."
    },
    {
      "name": "abh.organization",
      "owner": "Identity",
      "scopeKind": "Organization",
      "description": "abh.organization"
    },
    {
      "name": "abh.outbox-consumption",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable evidence that all frozen Outbox consumers committed their Inbox effects."
    },
    {
      "name": "abh.outbox-delivery",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable Outbox delivery evidence."
    },
    {
      "name": "abh.outbox-publication",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable Outbox publication evidence."
    },
    {
      "name": "abh.outbox-routing",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Immutable Outbox routing evidence."
    },
    {
      "name": "abh.pack-trust-policy",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Versioned deployment trust policy for one Pack namespace."
    },
    {
      "name": "abh.pack-validation",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Immutable Pack validation evidence; installation requires current deployment governance."
    },
    {
      "name": "abh.period",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.period"
    },
    {
      "name": "abh.pin-set",
      "owner": "CapabilityRelease",
      "scopeKind": "None",
      "description": "abh.pin-set"
    },
    {
      "name": "abh.policy-binding",
      "owner": "Control",
      "scopeKind": "None",
      "description": "Current organization Mandatory Policy selection."
    },
    {
      "name": "abh.policy-evaluation",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.policy-evaluation"
    },
    {
      "name": "abh.policy-version",
      "owner": "Control",
      "scopeKind": "None",
      "description": "Immutable compiled policy version and provenance."
    },
    {
      "name": "abh.principal",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.principal"
    },
    {
      "name": "abh.purpose",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.purpose"
    },
    {
      "name": "abh.query-capture",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Durable capture of independently authorized read-only query observations."
    },
    {
      "name": "abh.query-exit",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "One-use independently authorized read-only query exit."
    },
    {
      "name": "abh.reauth-proof",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "abh.reauth-proof"
    },
    {
      "name": "abh.reconciliation",
      "owner": "ReconciliationService",
      "scopeKind": "Object",
      "description": "Immutable external operation evidence."
    },
    {
      "name": "abh.release",
      "owner": "CapabilityRelease",
      "scopeKind": "None",
      "description": "abh.release"
    },
    {
      "name": "abh.request-completion-evidence",
      "owner": "HumanGateway",
      "scopeKind": "None",
      "description": "abh.request-completion-evidence"
    },
    {
      "name": "abh.request-context",
      "owner": "Control",
      "scopeKind": "None",
      "description": "abh.request-context"
    },
    {
      "name": "abh.reservation",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.reservation"
    },
    {
      "name": "abh.resource",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.resource"
    },
    {
      "name": "abh.resource-envelope",
      "owner": "ResourceLedger",
      "scopeKind": "None",
      "description": "abh.resource-envelope"
    },
    {
      "name": "abh.resource-fence",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Exclusive unresolved external-operation slot and fencing generation."
    },
    {
      "name": "abh.responsibility-assignment",
      "owner": "HumanGateway",
      "scopeKind": "Object",
      "description": "Current scoped human product responsibility."
    },
    {
      "name": "abh.responsibility-request",
      "owner": "HumanGateway",
      "scopeKind": "None",
      "description": "abh.responsibility-request"
    },
    {
      "name": "abh.run",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.run"
    },
    {
      "name": "abh.secret",
      "owner": "Identity",
      "scopeKind": "None",
      "description": "Secret binding reference; material is held by the Secret adapter."
    },
    {
      "name": "abh.settlement",
      "owner": "ResourceLedger",
      "scopeKind": "Object",
      "description": "Immutable verified source-version settlement."
    },
    {
      "name": "abh.stored-object",
      "owner": "ArtifactStore",
      "scopeKind": "None",
      "description": "abh.stored-object"
    },
    {
      "name": "abh.transport-capture",
      "owner": "OperationController",
      "scopeKind": "None",
      "description": "Immutable transport observation and raw receipt capture for a committed exit."
    },
    {
      "name": "abh.wait-port-receipt",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Durable waiting evidence."
    },
    {
      "name": "abh.work-lease",
      "owner": "DurableExecution",
      "scopeKind": "None",
      "description": "Finite worker ownership; grants no business authority."
    },
    {
      "name": "abh.workspace",
      "owner": "Identity",
      "scopeKind": "Workspace",
      "description": "abh.workspace"
    },
    {
      "name": "abh.pack-data-impact",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Immutable deployment-bound Pack data impact evidence."
    },
    {
      "name": "abh.pack-migration-attempt",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Immutable deployment-global claim for one physical Pack migration; not an execution permit."
    },
    {
      "name": "abh.pack-migration-observation",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Immutable database execution observation; not result verification."
    },
    {
      "name": "abh.pack-inspection-job",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Durable structure and data inspection progress owned by PackLoader."
    },
    {
      "name": "abh.pack-inspection-delivery",
      "owner": "PackLoader",
      "scopeKind": "None",
      "description": "Immutable acceptance of an exact inspection Job lifecycle event; not execution success."
    },
    {
      "name": "abh.pack-deployment-revision",
      "owner": "PackLoader",
      "scopeKind": "Organization",
      "description": "Immutable organization deployment revision binding a committed Pack transition."
    },
    {
      "name": "abh.pack-capability-set",
      "owner": "PackLoader",
      "scopeKind": "Organization",
      "description": "Immutable complete static capability registration set; installation state controls runtime visibility."
    },
    {
      "name": "abh.mission-conditions",
      "owner": "MissionController",
      "description": "Immutable Mission goal condition revision.",
      "scopeKind": "None"
    },
    {
      "name": "abh.mission-blocker",
      "description": "abh.mission-blocker",
      "owner": "MissionController",
      "scopeKind": "None"
    },
    {
      "name": "abh.mission-trigger",
      "description": "abh.mission-trigger",
      "owner": "MissionController",
      "scopeKind": "None"
    },
    {
      "name": "abh.task",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.task"
    },
    {
      "name": "abh.context",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.context"
    },
    {
      "name": "abh.verification-report",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.verification-report"
    },
    {
      "name": "abh.invocation",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.invocation"
    },
    {
      "name": "abh.tool-capability",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.tool-capability"
    },
    {
      "name": "abh.tool-binding",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.tool-binding"
    },
    {
      "name": "abh.tool-call",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.tool-call"
    },
    {
      "name": "abh.model-route",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.model-route"
    },
    {
      "name": "abh.model-call",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.model-call"
    },
    {
      "name": "abh.learning-signal",
      "owner": "MissionController",
      "scopeKind": "None",
      "description": "abh.learning-signal"
    }
  ],
  "purposes": [
    {
      "name": "abh.action.prepare",
      "description": "Validate existing input and prepare a bounded Action."
    },
    {
      "name": "abh.action.execute",
      "description": "Execute an authorized fixed Action plan."
    },
    {
      "name": "abh.operation.reconcile",
      "description": "Read external observations to reconcile prior operations."
    },
    {
      "name": "abh.decision.review",
      "description": "Review and respond to a responsibility decision."
    },
    {
      "name": "abh.artifact.read",
      "description": "Read an artifact for an authorized business purpose."
    },
    {
      "name": "abh.artifact.manage",
      "description": "Stage or delete object content under Artifact Owner authority."
    },
    {
      "name": "abh.runtime.deliver",
      "description": "Deliver committed work and wake its Owner."
    },
    {
      "name": "abh.pack.manage",
      "description": "Validate and record deployment-managed Pack evidence under current governance."
    },
    {
      "name": "abh.mission.manage",
      "description": "Manage long-lived Mission goals and lifecycle under current authority."
    },
    {
      "name": "abh.missions.read",
      "description": "Mission read access"
    },
    {
      "name": "abh.runs.read",
      "description": "Run read access"
    },
    {
      "name": "abh.verification.submit",
      "description": "Submit verification reports"
    },
    {
      "name": "abh.tools.invoke",
      "description": "Invoke registered tools"
    },
    {
      "name": "abh.tools.read",
      "description": "Read tool call inspection"
    },
    {
      "name": "abh.learning.capture",
      "description": "Capture learning signals"
    },
    {
      "name": "abh.projections.read",
      "description": "Read projection data"
    }
  ],
  "actions": [
    {
      "name": "abh.actions.aggregate",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Finalize a complete Action child vector and verified resource settlements."
    },
    {
      "name": "abh.actions.cancel",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "CancelAction"
    },
    {
      "name": "abh.actions.cleanup",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare",
        "abh.operation.reconcile"
      ],
      "description": "Safely clear a zero-dispatch authorization before cancellation, expiry or reauthorization."
    },
    {
      "name": "abh.actions.notify-wait",
      "targetTypes": [
        "abh.action-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Current admission for durable wait integration."
    },
    {
      "name": "abh.actions.pin",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "Pin required Action capabilities using current preparation Grants, without execution authority."
    },
    {
      "name": "abh.actions.propose",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "ProposeAction"
    },
    {
      "name": "abh.actions.read",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "GetAction"
    },
    {
      "name": "abh.actions.register-plan",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "Register a compiled Action plan under current preparation Grant and pinned capabilities."
    },
    {
      "name": "abh.actions.request-authorization",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "RequestAuthorization"
    },
    {
      "name": "abh.actions.validate",
      "targetTypes": [
        "abh.action"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "Validate frozen Action input against current Domain evidence; internal preparation only."
    },
    {
      "name": "abh.artifacts.delete",
      "targetTypes": [
        "abh.stored-object"
      ],
      "purposeNames": [
        "abh.artifact.manage"
      ],
      "description": "ObjectStorePort.delete"
    },
    {
      "name": "abh.artifacts.read",
      "targetTypes": [
        "abh.stored-object"
      ],
      "purposeNames": [
        "abh.artifact.read"
      ],
      "description": "ObjectStorePort.read"
    },
    {
      "name": "abh.artifacts.stat",
      "targetTypes": [
        "abh.stored-object"
      ],
      "purposeNames": [
        "abh.artifact.read"
      ],
      "description": "ObjectStorePort.stat"
    },
    {
      "name": "abh.artifacts.store",
      "targetTypes": [
        "abh.artifact"
      ],
      "purposeNames": [
        "abh.artifact.manage"
      ],
      "description": "ObjectStorePort.put"
    },
    {
      "name": "abh.artifacts.store-inline",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "StoreInlineArtifact"
    },
    {
      "name": "abh.capabilities.read",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.action.execute",
        "abh.action.prepare",
        "abh.operation.reconcile"
      ],
      "description": "QueryPackCapabilities"
    },
    {
      "name": "abh.decisions.read",
      "targetTypes": [
        "abh.decision"
      ],
      "purposeNames": [
        "abh.decision.review",
        "abh.runtime.deliver"
      ],
      "description": "GetDecision"
    },
    {
      "name": "abh.decisions.submit",
      "targetTypes": [
        "abh.decision"
      ],
      "purposeNames": [
        "abh.decision.review"
      ],
      "description": "SubmitDecision"
    },
    {
      "name": "abh.decisions.withdraw",
      "targetTypes": [
        "abh.decision"
      ],
      "purposeNames": [
        "abh.decision.review"
      ],
      "description": "WithdrawDecision"
    },
    {
      "name": "abh.exceptions.open-terminal",
      "targetTypes": [
        "abh.reconciliation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Open a responsibility case for a currently frozen terminal contradiction."
    },
    {
      "name": "abh.execution-authority.create",
      "targetTypes": [
        "abh.execution-authority"
      ],
      "purposeNames": [
        "abh.action.execute",
        "abh.action.prepare",
        "abh.operation.reconcile"
      ],
      "description": "Current management permission for finite execution delegation from Scope policy or complete Action approval."
    },
    {
      "name": "abh.learning.capture",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.learning.capture"
      ],
      "description": "CaptureSignal"
    },
    {
      "name": "abh.missions.activate",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "ActivateMission"
    },
    {
      "name": "abh.missions.block",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "BlockMission"
    },
    {
      "name": "abh.missions.cancel",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "CancelMission"
    },
    {
      "name": "abh.missions.close",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "CloseMission"
    },
    {
      "name": "abh.missions.create",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "CreateMission"
    },
    {
      "name": "abh.missions.pause",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "PauseMission"
    },
    {
      "name": "abh.missions.read",
      "targetTypes": [
        "abh.context",
        "abh.decision",
        "abh.mission"
      ],
      "purposeNames": [
        "abh.decision.review",
        "abh.mission.manage",
        "abh.runtime.deliver"
      ],
      "description": "GetMission"
    },
    {
      "name": "abh.missions.resolve-blocker",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "ResolveBlocker"
    },
    {
      "name": "abh.missions.resume",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "ResumeMission"
    },
    {
      "name": "abh.missions.revise-goal",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "ReviseMissionGoal"
    },
    {
      "name": "abh.missions.submit-trigger",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "SubmitTrigger"
    },
    {
      "name": "abh.operations.apply-reconciliation",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Current Controller applies complete comparison evidence to an existing operation."
    },
    {
      "name": "abh.operations.capture-query",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Capture query evidence with current independent observation permission."
    },
    {
      "name": "abh.operations.capture-transport",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Persist transport evidence without execution authority or outcome changes."
    },
    {
      "name": "abh.operations.claim-query-exit",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Read-only query of an existing dispatched operation with independent authority."
    },
    {
      "name": "abh.operations.notify-wait",
      "targetTypes": [
        "abh.operation-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Record current reconciliation waiting notification."
    },
    {
      "name": "abh.operations.reconcile",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Compare all persisted evidence under a pinned rule; does not dispatch or change an outcome."
    },
    {
      "name": "abh.operations.record-compatible-query-evidence",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Record reviewed exact-operation compatibility evidence without granting a query exit or dispatch authority."
    },
    {
      "name": "abh.operations.record-receipt",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Append authenticated evidence for an existing operation, without outcome mutation or dispatch authority."
    },
    {
      "name": "abh.operations.recover",
      "targetTypes": [
        "abh.operation"
      ],
      "purposeNames": [
        "abh.operation.reconcile"
      ],
      "description": "Recover an expired possible-in-flight Permit as Unknown while retaining its resource responsibility."
    },
    {
      "name": "abh.pack-inspection-jobs.accept-delivery",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Persist a committed inspection lifecycle event in the Inbox transaction without management execution authority."
    },
    {
      "name": "abh.pack-inspection-jobs.cancel",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Cancel inspection under current governance and actual cancellation evidence; preserve exhausted budget as failure."
    },
    {
      "name": "abh.pack-inspection-jobs.complete",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Complete inspection from authentic produced state and an authorized stored observation under a live lease."
    },
    {
      "name": "abh.pack-inspection-jobs.expire",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Fail an expired inspection Job using database-time evidence without requiring a surviving worker lease."
    },
    {
      "name": "abh.pack-inspection-jobs.fail",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Settle an actual failed inspection attempt under its current lease and independent failure authority, retaining cumulative budget."
    },
    {
      "name": "abh.pack-inspection-jobs.fail-lost-lease",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Settle a Running inspection after authoritative expired or replaced lease observation, retaining cumulative budget."
    },
    {
      "name": "abh.pack-inspection-jobs.start",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Start an exact inspection Job under a current fenced work lease and cumulative budget."
    },
    {
      "name": "abh.pack-inspection-jobs.wait",
      "targetTypes": [
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Record a real preparation blocker under current lease and remaining cumulative budget."
    },
    {
      "name": "abh.packs.enable",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Enable an exact Pack after current deployment verification and bound Human approval."
    },
    {
      "name": "abh.packs.publish-trust-policy",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Publish independently signed deployment governance under current administration authority."
    },
    {
      "name": "abh.packs.record-conformance",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Record signed CTK evidence under independent deployment evidence authority."
    },
    {
      "name": "abh.packs.record-data-impact",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "InspectPackInspectionJob"
    },
    {
      "name": "abh.packs.record-validation",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Record verified Pack evidence under deployment administration authority."
    },
    {
      "name": "abh.packs.register-capabilities",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Reserve verified static capability identities for a staged Pack without enabling runtime use."
    },
    {
      "name": "abh.packs.request-enable",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Request Human approval for an exact currently verified Pack deployment proposal."
    },
    {
      "name": "abh.packs.request-inspection",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Request bounded asynchronous inspection of an exact staged installation."
    },
    {
      "name": "abh.packs.retire",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Retire an exact suspended Pack after reference and rollback-window review; retained bytes are not deleted."
    },
    {
      "name": "abh.packs.stage",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Stage verified durable Pack content under current deployment governance."
    },
    {
      "name": "abh.packs.suspend",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.pack.manage"
      ],
      "description": "Suspend an Enabled Pack while retaining all historical references."
    },
    {
      "name": "abh.projections.build-mission-summary",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Reauthorize durable MissionSummary source rebuild under Projection Owner authority."
    },
    {
      "name": "abh.projections.read",
      "targetTypes": [
        "abh.decision",
        "abh.mission"
      ],
      "purposeNames": [
        "abh.decision.review",
        "abh.mission.manage",
        "abh.runtime.deliver"
      ],
      "description": "GetProjection"
    },
    {
      "name": "abh.projections.request-mission-summary",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "RefreshMissionSummary"
    },
    {
      "name": "abh.responsibilities.revoke",
      "targetTypes": [
        "abh.responsibility-assignment"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "Revoke a responsibility assignment after current management and continuity checks."
    },
    {
      "name": "abh.responsibility-requests.expire",
      "targetTypes": [
        "abh.responsibility-request"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Expire overdue responsibility requests and pending decisions without approval effects."
    },
    {
      "name": "abh.responsibility-requests.open",
      "targetTypes": [
        "abh.responsibility-request"
      ],
      "purposeNames": [
        "abh.action.prepare"
      ],
      "description": "Open a governed responsibility request under current routing authority, without approval or execution permission."
    },
    {
      "name": "abh.responsibility-requests.retry-route",
      "targetTypes": [
        "abh.responsibility-request"
      ],
      "purposeNames": [
        "abh.action.prepare",
        "abh.operation.reconcile"
      ],
      "description": "Retry current eligibility for an unchanged Unresolved responsibility request."
    },
    {
      "name": "abh.responsibility-requests.revise-route",
      "targetTypes": [
        "abh.responsibility-request"
      ],
      "purposeNames": [
        "abh.action.prepare",
        "abh.operation.reconcile"
      ],
      "description": "Revise frozen responsibility routing with current governance and source evidence."
    },
    {
      "name": "abh.runs.cancel",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "CancelRun"
    },
    {
      "name": "abh.runs.complete",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "CompleteRun"
    },
    {
      "name": "abh.runs.read",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "GetRun"
    },
    {
      "name": "abh.runs.recover",
      "targetTypes": [
        "abh.run"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Cancel nonterminal Task facts and clear a stale Mission active-run reference after a terminal Run."
    },
    {
      "name": "abh.runs.start",
      "targetTypes": [
        "abh.mission"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "StartRun"
    },
    {
      "name": "abh.runtime.cancel-wait",
      "targetTypes": [
        "abh.durable-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Current server admission for durable waiting."
    },
    {
      "name": "abh.runtime.cancel-wakeup",
      "targetTypes": [
        "abh.durable-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.cancelWakeup"
    },
    {
      "name": "abh.runtime.consume-event",
      "targetTypes": [
        "abh.event"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Consume one committed event with its Owner effect in the same transaction."
    },
    {
      "name": "abh.runtime.drain",
      "targetTypes": [
        "abh.organization"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.drain"
    },
    {
      "name": "abh.runtime.enqueue",
      "targetTypes": [
        "abh.action",
        "abh.decision",
        "abh.operation",
        "abh.pack-inspection-job"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.enqueue"
    },
    {
      "name": "abh.runtime.execute-wait-port",
      "targetTypes": [
        "abh.durable-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Current admission for durable wait integration."
    },
    {
      "name": "abh.runtime.inspect",
      "targetTypes": [
        "abh.durable-wait",
        "abh.job"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.inspect"
    },
    {
      "name": "abh.runtime.prepare-outbox",
      "targetTypes": [
        "abh.event"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Persist frozen Outbox fanout and per-consumer queue publication facts."
    },
    {
      "name": "abh.runtime.recheck-wait",
      "targetTypes": [
        "abh.durable-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Current server admission for durable waiting."
    },
    {
      "name": "abh.runtime.record-outbox-consumption",
      "targetTypes": [
        "abh.outbox-routing"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Record actual Inbox completion for every consumer of a frozen Outbox routing."
    },
    {
      "name": "abh.runtime.record-outbox-delivery",
      "targetTypes": [
        "abh.outbox-routing"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Persist frozen Outbox fanout and per-consumer queue publication facts."
    },
    {
      "name": "abh.runtime.register-wait",
      "targetTypes": [
        "abh.durable-wait"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "Current server admission for durable waiting."
    },
    {
      "name": "abh.runtime.schedule-wakeup",
      "targetTypes": [
        "abh.action",
        "abh.decision",
        "abh.operation"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.scheduleWakeup"
    },
    {
      "name": "abh.runtime.signal",
      "targetTypes": [
        "abh.action",
        "abh.decision",
        "abh.operation"
      ],
      "purposeNames": [
        "abh.runtime.deliver"
      ],
      "description": "DurableExecutionPort.signal"
    },
    {
      "name": "abh.tools.invoke",
      "targetTypes": [
        "abh.tool-binding"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "InvokeTool"
    },
    {
      "name": "abh.tools.read",
      "targetTypes": [
        "abh.tool-call"
      ],
      "purposeNames": [
        "abh.mission.manage"
      ],
      "description": "GetToolCall"
    },
    {
      "name": "abh.verification.submit",
      "targetTypes": [
        "abh.task"
      ],
      "purposeNames": [
        "abh.mission.manage",
        "abh.verification.submit"
      ],
      "description": "SubmitVerification"
    }
  ]
} as const;
