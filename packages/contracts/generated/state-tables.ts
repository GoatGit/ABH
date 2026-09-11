/* Generated. Guard IDs describe obligations; this table never grants permission. */
export const stateRegistry = {
  "version": "0.1.0",
  "source": "docs/V1/10-ABH详细设计/02-状态与执行契约规范.md",
  "owners": [
    "MissionController",
    "ReconciliationService",
    "ActionEngine",
    "OperationController",
    "HumanGateway",
    "Control",
    "ResourceLedger",
    "CapabilityRelease",
    "PackLoader",
    "ArtifactStore",
    "DurableExecution",
    "Identity"
  ],
  "guards": {
    "mission.activate": {
      "owner": "MissionController",
      "description": "Current Mission authority, registered conditions and runnable Workflow are verified.",
      "implementation": "OwnerRequired"
    },
    "mission.pause": {
      "owner": "MissionController",
      "description": "Current permission and durable stop epoch block new work.",
      "implementation": "OwnerRequired"
    },
    "mission.block": {
      "owner": "MissionController",
      "description": "Actual required blocker evidence prevents progress and advances the stop epoch.",
      "implementation": "OwnerRequired"
    },
    "mission.resume": {
      "owner": "MissionController",
      "description": "All required blockers resolved, pause intent cleared and authority revalidated.",
      "implementation": "OwnerRequired"
    },
    "mission.resolve": {
      "owner": "MissionController",
      "description": "Source Owner resolution proves all required blockers cleared; retain manual pause intent.",
      "implementation": "OwnerRequired"
    },
    "mission.cancel": {
      "owner": "MissionController",
      "description": "Stop epoch advances; unresolved external effects retain cleanup responsibility.",
      "implementation": "OwnerRequired"
    },
    "mission.complete": {
      "owner": "MissionController",
      "description": "Registered result and condition evidence prove completion without unresolved effects.",
      "implementation": "OwnerRequired"
    },
    "packInspectionJob.start": {
      "owner": "PackLoader",
      "description": "Current Pack admission and an acquired fenced lease; cumulative budget remains available.",
      "implementation": "OwnerRequired"
    },
    "packInspectionJob.wait": {
      "owner": "PackLoader",
      "description": "Bounded blocking diagnostic with evidence and cumulative consumed budget.",
      "implementation": "OwnerRequired"
    },
    "packInspectionJob.succeed": {
      "owner": "PackLoader",
      "description": "Authentic persisted inspection observation; matched is independent of technical completion.",
      "implementation": "OwnerRequired"
    },
    "packInspectionJob.fail": {
      "owner": "PackLoader",
      "description": "Formal failure evidence including budget exhaustion.",
      "implementation": "OwnerRequired"
    },
    "packInspectionJob.cancel": {
      "owner": "PackLoader",
      "description": "Authorized cancellation with formal evidence.",
      "implementation": "OwnerRequired"
    },
    "attempt.sent": {
      "owner": "OperationController",
      "description": "Trusted exit reports request transmission; this does not prove provider effect.",
      "implementation": "OwnerRequired"
    },
    "attempt.responded": {
      "owner": "OperationController",
      "description": "Authenticated transport response evidence; outcome is decided by reconciliation.",
      "implementation": "OwnerRequired"
    },
    "attempt.transportFailed": {
      "owner": "OperationController",
      "description": "Transport failure evidence does not establish no effect.",
      "implementation": "OwnerRequired"
    },
    "attempt.interrupted": {
      "owner": "OperationController",
      "description": "Worker interruption without conclusive sending evidence.",
      "implementation": "OwnerRequired"
    },
    "action.validate": {
      "owner": "ActionEngine",
      "description": "Domain validation and frozen payload, target versions and completion policy.",
      "implementation": "OwnerRequired"
    },
    "action.reject": {
      "owner": "ActionEngine",
      "description": "Deterministic rejection evidence.",
      "implementation": "OwnerRequired"
    },
    "action.expire": {
      "owner": "ActionEngine",
      "description": "Intent expiry and proof of zero dispatch.",
      "implementation": "OwnerRequired"
    },
    "action.cancel": {
      "owner": "ActionEngine",
      "description": "Authorized cancellation and proof of zero dispatch.",
      "implementation": "OwnerRequired"
    },
    "action.authorize": {
      "owner": "ActionEngine",
      "description": "Nonempty pinned plan, current Authority, required Decisions, Snapshot and all resource reservations commit atomically.",
      "implementation": "OwnerRequired"
    },
    "action.reauthorize": {
      "owner": "ActionEngine",
      "description": "Zero dispatch; release only proven safe incremental resource holds; preserve prior Snapshot and plan.",
      "implementation": "OwnerRequired"
    },
    "action.dispatch": {
      "owner": "ActionEngine",
      "description": "First Operation obtains a durable Dispatch Permit.",
      "implementation": "OwnerRequired"
    },
    "action.reconcile": {
      "owner": "ActionEngine",
      "description": "Stop new dispatch and cancel undispatched nodes; retain unresolved effects.",
      "implementation": "OwnerRequired"
    },
    "action.close": {
      "owner": "ActionEngine",
      "description": "All dispatched and required child outcomes determined; completion policy applied.",
      "implementation": "OwnerRequired"
    },
    "action.advance": {
      "owner": "ActionEngine",
      "description": "Other eligible operations advance with CAS and current authorization.",
      "implementation": "OwnerRequired"
    },
    "operation.dispatch": {
      "owner": "OperationController",
      "description": "Dependencies, current authorization, resource fence, durable Permit and Attempt exist.",
      "implementation": "OwnerRequired"
    },
    "operation.cancel": {
      "owner": "OperationController",
      "description": "Never dispatched; parent cancellation or dependency failure recorded.",
      "implementation": "OwnerRequired"
    },
    "operation.observe": {
      "owner": "OperationController",
      "description": "Request sent or zero sending cannot be proven; Pending or Unknown.",
      "implementation": "OwnerRequired"
    },
    "operation.retry": {
      "owner": "OperationController",
      "description": "Proven no effect; parent still Executing with no stop request; current authorization and retry budget valid.",
      "implementation": "OwnerRequired"
    },
    "operation.close": {
      "owner": "OperationController",
      "description": "Final receipt or reconciliation proves success or no-effect failure.",
      "implementation": "OwnerRequired"
    },
    "decision.approve": {
      "owner": "HumanGateway",
      "description": "Eligible responsible principal; current grants, complete package, versions, purpose and deadline checked.",
      "implementation": "OwnerRequired"
    },
    "decision.reject": {
      "owner": "HumanGateway",
      "description": "Eligible responsible principal and recorded rejection reason.",
      "implementation": "OwnerRequired"
    },
    "decision.expire": {
      "owner": "HumanGateway",
      "description": "Deadline reached; never default approval.",
      "implementation": "OwnerRequired"
    },
    "decision.supersede": {
      "owner": "HumanGateway",
      "description": "Replacement package and changed subject evidence.",
      "implementation": "OwnerRequired"
    },
    "decision.withdraw": {
      "owner": "HumanGateway",
      "description": "Original subject withdrawn by an authorized caller.",
      "implementation": "OwnerRequired"
    },
    "decisionEffect.apply": {
      "owner": "HumanGateway",
      "description": "Target Owner Receipt covers all required effects; service Grant alone is insufficient without Authority.",
      "implementation": "OwnerRequired"
    },
    "decisionEffect.block": {
      "owner": "HumanGateway",
      "description": "Target Owner could not apply the effect; preserve pending responsibility.",
      "implementation": "OwnerRequired"
    },
    "decisionEffect.abandon": {
      "owner": "HumanGateway",
      "description": "Formal withdrawal and current revalidation evidence.",
      "implementation": "OwnerRequired"
    },
    "responsibilityRequest.route": {
      "owner": "HumanGateway",
      "description": "All mandatory responsibility slots can be routed.",
      "implementation": "OwnerRequired"
    },
    "responsibilityRequest.unroute": {
      "owner": "HumanGateway",
      "description": "A pending slot no longer has a qualified responsible principal.",
      "implementation": "OwnerRequired"
    },
    "responsibilityRequest.close": {
      "owner": "HumanGateway",
      "description": "All mandatory decisions resolved, a definite rejection, or overall deadline reached; expiry cannot grant authority.",
      "implementation": "OwnerRequired"
    },
    "responsibilityRequest.withdraw": {
      "owner": "HumanGateway",
      "description": "Original matter cancelled or replaced.",
      "implementation": "OwnerRequired"
    },
    "grant.revoke": {
      "owner": "Control",
      "description": "Authorized revocation commits fence epoch, state, Audit and Outbox together.",
      "implementation": "OwnerRequired"
    },
    "grant.expire": {
      "owner": "Control",
      "description": "Database clock reaches finite validity bound; live checks reject even before marker update.",
      "implementation": "OwnerRequired"
    },
    "executionAuthority.revoke": {
      "owner": "Control",
      "description": "Authorized revocation commits fence epoch, state, Audit and Outbox together.",
      "implementation": "OwnerRequired"
    },
    "executionAuthority.expire": {
      "owner": "Control",
      "description": "Database clock reaches finite validity bound; live checks reject even before marker update.",
      "implementation": "OwnerRequired"
    },
    "reservation.consume": {
      "owner": "ResourceLedger",
      "description": "Usage evidence submitted atomically.",
      "implementation": "OwnerRequired"
    },
    "reservation.commit": {
      "owner": "ResourceLedger",
      "description": "Hold converted into continuing Commitment in the same transaction.",
      "implementation": "OwnerRequired"
    },
    "reservation.release": {
      "owner": "ResourceLedger",
      "description": "Resource is proven unused and has no uncertain liability.",
      "implementation": "OwnerRequired"
    },
    "reservation.expire": {
      "owner": "ResourceLedger",
      "description": "Expired hold is proven unused; unknown costs cannot be released.",
      "implementation": "OwnerRequired"
    },
    "commitment.closeRequested": {
      "owner": "ResourceLedger",
      "description": "Stop new exposure while retaining unresolved and trailing costs.",
      "implementation": "OwnerRequired"
    },
    "commitment.close": {
      "owner": "ResourceLedger",
      "description": "All liabilities and final observation windows settled.",
      "implementation": "OwnerRequired"
    },
    "ledger.freeze": {
      "owner": "ResourceLedger",
      "description": "Authorized freeze or deterministic resource safety condition.",
      "implementation": "OwnerRequired"
    },
    "ledger.unfreeze": {
      "owner": "ResourceLedger",
      "description": "Current authority and resource constraints allow new admission.",
      "implementation": "OwnerRequired"
    },
    "ledger.close": {
      "owner": "ResourceLedger",
      "description": "Period/business ended; no unsettled hold, commitment or unverified deficit.",
      "implementation": "OwnerRequired"
    },
    "release.ready": {
      "owner": "CapabilityRelease",
      "description": "Installed assets, required gate evidence and compatibility verified.",
      "implementation": "OwnerRequired"
    },
    "release.retire": {
      "owner": "CapabilityRelease",
      "description": "Authorized retirement; existing pinned reads retained.",
      "implementation": "OwnerRequired"
    },
    "release.revoke": {
      "owner": "CapabilityRelease",
      "description": "Safety withdrawal freezes new execution and preserves history.",
      "implementation": "OwnerRequired"
    },
    "installedPack.enable": {
      "owner": "PackLoader",
      "description": "Trust, integrity and compatibility verified.",
      "implementation": "OwnerRequired"
    },
    "installedPack.retire": {
      "owner": "PackLoader",
      "description": "Authorized retirement; active references preserved.",
      "implementation": "OwnerRequired"
    },
    "installedPack.suspend": {
      "owner": "PackLoader",
      "description": "Current deployment policy or safety withdrawal.",
      "implementation": "OwnerRequired"
    },
    "artifact.publish": {
      "owner": "ArtifactStore",
      "description": "Stored content size, hash, scan and purpose validated.",
      "implementation": "OwnerRequired"
    },
    "artifact.quarantine": {
      "owner": "ArtifactStore",
      "description": "Content fails trusted scan, integrity or purpose checks.",
      "implementation": "OwnerRequired"
    },
    "artifact.restore": {
      "owner": "ArtifactStore",
      "description": "Rescan, hash and purpose validated under current rules.",
      "implementation": "OwnerRequired"
    },
    "artifact.tombstone": {
      "owner": "ArtifactStore",
      "description": "Authorized deletion/use revocation with required retention.",
      "implementation": "OwnerRequired"
    },
    "accessRecord.revoke": {
      "owner": "Control",
      "description": "AccessRecord Owner verifies current source evidence and authorization before Active -> Revoked.",
      "implementation": "OwnerRequired"
    },
    "accessRecord.expire": {
      "owner": "Control",
      "description": "AccessRecord Owner verifies current source evidence and authorization before Active -> Expired.",
      "implementation": "OwnerRequired"
    },
    "durableWait.succeed": {
      "owner": "DurableExecution",
      "description": "DurableWait Owner verifies current source evidence and authorization before Pending -> Succeeded.",
      "implementation": "OwnerRequired"
    },
    "durableWait.cancel": {
      "owner": "DurableExecution",
      "description": "DurableWait Owner verifies current source evidence and authorization before Pending -> Cancelled.",
      "implementation": "OwnerRequired"
    },
    "externalObservation.normalize": {
      "owner": "Identity",
      "description": "ExternalObservation Owner verifies current source evidence and authorization before Received -> Normalized.",
      "implementation": "OwnerRequired"
    },
    "externalObservation.quarantine": {
      "owner": "Identity",
      "description": "ExternalObservation Owner verifies current source evidence and authorization before Received -> Quarantined.",
      "implementation": "OwnerRequired"
    },
    "externalObservation.release": {
      "owner": "Identity",
      "description": "ExternalObservation Owner verifies current source evidence and authorization before Quarantined -> Normalized.",
      "implementation": "OwnerRequired"
    },
    "assignment.promoteCanary": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.pause": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.retire": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.promoteActive": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.resumeShadow": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.resumeCanary": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "assignment.resumeActive": {
      "owner": "CapabilityRelease",
      "description": "Release Owner verifies current authority, applicable gates and previous mode; immutable allocations and prior pins remain evidence.",
      "implementation": "OwnerRequired"
    },
    "run.start": {
      "owner": "MissionController",
      "description": "Queued Run is started by the Mission Owner with verified authority and stop epoch.",
      "implementation": "OwnerRequired"
    },
    "run.wait": {
      "owner": "MissionController",
      "description": "Running Run enters Waiting when all ready tasks are pending external signals.",
      "implementation": "OwnerRequired"
    },
    "run.wake": {
      "owner": "MissionController",
      "description": "Waiting Run resumes after a verified wait signal.",
      "implementation": "OwnerRequired"
    },
    "run.complete": {
      "owner": "MissionController",
      "description": "Run reaches a terminal state after all required tasks are resolved.",
      "implementation": "OwnerRequired"
    },
    "run.cancel": {
      "owner": "MissionController",
      "description": "Running Run is cancelled with stop epoch advance.",
      "implementation": "OwnerRequired"
    },
    "run.pause": {
      "owner": "MissionController",
      "description": "Running Run pauses, stopping new tasks and invocation dispatch.",
      "implementation": "OwnerRequired"
    },
    "run.resume": {
      "owner": "MissionController",
      "description": "Paused Run resumes, re-enqueueing for execution.",
      "implementation": "OwnerRequired"
    }
  },
  "machines": {
    "Mission": {
      "owner": "MissionController",
      "states": [
        "Draft",
        "Active",
        "Paused",
        "Blocked",
        "Completed",
        "Cancelled"
      ],
      "terminal": [
        "Completed",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Draft",
          "to": "Active",
          "guardIds": [
            "mission.activate"
          ],
          "event": "abh.mission.activate",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Paused",
          "guardIds": [
            "mission.pause"
          ],
          "event": "abh.mission.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Blocked",
          "guardIds": [
            "mission.block"
          ],
          "event": "abh.mission.block",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Active",
          "guardIds": [
            "mission.resume"
          ],
          "event": "abh.mission.resume",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Blocked",
          "to": "Active",
          "guardIds": [
            "mission.resolve"
          ],
          "event": "abh.mission.resolve",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Blocked",
          "to": "Paused",
          "guardIds": [
            "mission.resolve"
          ],
          "event": "abh.mission.resolve",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Cancelled",
          "guardIds": [
            "mission.cancel"
          ],
          "event": "abh.mission.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Cancelled",
          "guardIds": [
            "mission.cancel"
          ],
          "event": "abh.mission.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Blocked",
          "to": "Cancelled",
          "guardIds": [
            "mission.cancel"
          ],
          "event": "abh.mission.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Completed",
          "guardIds": [
            "mission.complete"
          ],
          "event": "abh.mission.complete",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Run": {
      "owner": "MissionController",
      "states": [
        "Queued",
        "Running",
        "Waiting",
        "Paused",
        "Completed",
        "Failed",
        "Cancelled"
      ],
      "terminal": [
        "Completed",
        "Failed",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Queued",
          "to": "Running",
          "guardIds": [
            "run.start"
          ],
          "event": "abh.run.start",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Waiting",
          "guardIds": [
            "run.wait"
          ],
          "event": "abh.run.wait",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Running",
          "guardIds": [
            "run.wake"
          ],
          "event": "abh.run.wake",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Completed",
          "guardIds": [
            "run.complete"
          ],
          "event": "abh.run.complete",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Failed",
          "guardIds": [
            "run.complete"
          ],
          "event": "abh.run.complete",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Cancelled",
          "guardIds": [
            "run.cancel"
          ],
          "event": "abh.run.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Paused",
          "guardIds": [
            "run.pause"
          ],
          "event": "abh.run.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Queued",
          "guardIds": [
            "run.resume"
          ],
          "event": "abh.run.resume",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Failed",
          "guardIds": [
            "run.complete"
          ],
          "event": "abh.run.complete",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Cancelled",
          "guardIds": [
            "run.cancel"
          ],
          "event": "abh.run.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Failed",
          "guardIds": [
            "run.complete"
          ],
          "event": "abh.run.complete",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Cancelled",
          "guardIds": [
            "run.cancel"
          ],
          "event": "abh.run.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Paused",
          "guardIds": [
            "run.pause"
          ],
          "event": "abh.run.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Action": {
      "owner": "ActionEngine",
      "states": [
        "Proposed",
        "Validated",
        "Authorized",
        "Executing",
        "Reconciling",
        "Closed",
        "Rejected",
        "Expired",
        "Cancelled"
      ],
      "terminal": [
        "Closed",
        "Rejected",
        "Expired",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Proposed",
          "to": "Validated",
          "guardIds": [
            "action.validate"
          ],
          "event": "abh.action.validate",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Proposed",
          "to": "Rejected",
          "guardIds": [
            "action.reject"
          ],
          "event": "abh.action.reject",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Proposed",
          "to": "Expired",
          "guardIds": [
            "action.expire"
          ],
          "event": "abh.action.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Proposed",
          "to": "Cancelled",
          "guardIds": [
            "action.cancel"
          ],
          "event": "abh.action.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Validated",
          "to": "Rejected",
          "guardIds": [
            "action.reject"
          ],
          "event": "abh.action.reject",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Validated",
          "to": "Expired",
          "guardIds": [
            "action.expire"
          ],
          "event": "abh.action.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Validated",
          "to": "Cancelled",
          "guardIds": [
            "action.cancel"
          ],
          "event": "abh.action.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Validated",
          "to": "Authorized",
          "guardIds": [
            "action.authorize"
          ],
          "event": "abh.action.authorize",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Authorized",
          "to": "Validated",
          "guardIds": [
            "action.reauthorize"
          ],
          "event": "abh.action.reauthorize",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Authorized",
          "to": "Executing",
          "guardIds": [
            "action.dispatch"
          ],
          "event": "abh.action.dispatch",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Authorized",
          "to": "Expired",
          "guardIds": [
            "action.expire"
          ],
          "event": "abh.action.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Authorized",
          "to": "Cancelled",
          "guardIds": [
            "action.cancel"
          ],
          "event": "abh.action.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Executing",
          "to": "Reconciling",
          "guardIds": [
            "action.reconcile"
          ],
          "event": "abh.action.reconcile",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Executing",
          "to": "Closed",
          "guardIds": [
            "action.close"
          ],
          "event": "abh.action.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Reconciling",
          "to": "Closed",
          "guardIds": [
            "action.close"
          ],
          "event": "abh.action.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Executing",
          "to": "Executing",
          "guardIds": [
            "action.advance"
          ],
          "event": "abh.action.advance",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Reconciling",
          "to": "Reconciling",
          "guardIds": [
            "action.advance"
          ],
          "event": "abh.action.advance",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ],
      "outcomes": [
        "NotStarted",
        "Pending",
        "Unknown",
        "Succeeded",
        "PartiallySucceeded",
        "Failed"
      ],
      "combinations": {
        "Proposed": [
          "NotStarted"
        ],
        "Validated": [
          "NotStarted"
        ],
        "Authorized": [
          "NotStarted"
        ],
        "Executing": [
          "Pending",
          "Unknown"
        ],
        "Reconciling": [
          "Pending",
          "Unknown"
        ],
        "Closed": [
          "Succeeded",
          "PartiallySucceeded",
          "Failed"
        ],
        "Rejected": [
          "NotStarted"
        ],
        "Expired": [
          "NotStarted"
        ],
        "Cancelled": [
          "NotStarted"
        ]
      }
    },
    "Operation": {
      "owner": "OperationController",
      "states": [
        "Pending",
        "Dispatching",
        "Observing",
        "Closed",
        "Cancelled"
      ],
      "terminal": [
        "Closed",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Pending",
          "to": "Dispatching",
          "guardIds": [
            "operation.dispatch"
          ],
          "event": "abh.operation.dispatch",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Cancelled",
          "guardIds": [
            "operation.cancel"
          ],
          "event": "abh.operation.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Dispatching",
          "to": "Observing",
          "guardIds": [
            "operation.observe"
          ],
          "event": "abh.operation.observe",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Dispatching",
          "to": "Pending",
          "guardIds": [
            "operation.retry"
          ],
          "event": "abh.operation.retry",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Observing",
          "to": "Pending",
          "guardIds": [
            "operation.retry"
          ],
          "event": "abh.operation.retry",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Dispatching",
          "to": "Closed",
          "guardIds": [
            "operation.close"
          ],
          "event": "abh.operation.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Observing",
          "to": "Closed",
          "guardIds": [
            "operation.close"
          ],
          "event": "abh.operation.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Observing",
          "to": "Observing",
          "guardIds": [
            "operation.observe"
          ],
          "event": "abh.operation.observe",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ],
      "outcomes": [
        "NotStarted",
        "Pending",
        "Unknown",
        "Succeeded",
        "Failed"
      ],
      "combinations": {
        "Pending": [
          "NotStarted"
        ],
        "Dispatching": [
          "Pending",
          "Unknown"
        ],
        "Observing": [
          "Pending",
          "Unknown"
        ],
        "Closed": [
          "Succeeded",
          "Failed"
        ],
        "Cancelled": [
          "NotStarted"
        ]
      }
    },
    "Decision": {
      "owner": "HumanGateway",
      "states": [
        "Pending",
        "Approved",
        "Rejected",
        "Expired",
        "Superseded",
        "Withdrawn"
      ],
      "terminal": [
        "Approved",
        "Rejected",
        "Expired",
        "Superseded",
        "Withdrawn"
      ],
      "transitions": [
        {
          "from": "Pending",
          "to": "Approved",
          "guardIds": [
            "decision.approve"
          ],
          "event": "abh.decision.approve",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Rejected",
          "guardIds": [
            "decision.reject"
          ],
          "event": "abh.decision.reject",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Expired",
          "guardIds": [
            "decision.expire"
          ],
          "event": "abh.decision.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Superseded",
          "guardIds": [
            "decision.supersede"
          ],
          "event": "abh.decision.supersede",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Withdrawn",
          "guardIds": [
            "decision.withdraw"
          ],
          "event": "abh.decision.withdraw",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "DecisionEffect": {
      "owner": "HumanGateway",
      "states": [
        "Pending",
        "Applied",
        "Blocked",
        "Abandoned"
      ],
      "terminal": [
        "Applied",
        "Abandoned"
      ],
      "transitions": [
        {
          "from": "Pending",
          "to": "Applied",
          "guardIds": [
            "decisionEffect.apply"
          ],
          "event": "abh.decision-effect.apply",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Blocked",
          "to": "Applied",
          "guardIds": [
            "decisionEffect.apply"
          ],
          "event": "abh.decision-effect.apply",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Blocked",
          "guardIds": [
            "decisionEffect.block"
          ],
          "event": "abh.decision-effect.block",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Abandoned",
          "guardIds": [
            "decisionEffect.abandon"
          ],
          "event": "abh.decision-effect.abandon",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Blocked",
          "to": "Abandoned",
          "guardIds": [
            "decisionEffect.abandon"
          ],
          "event": "abh.decision-effect.abandon",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "ResponsibilityRequest": {
      "owner": "HumanGateway",
      "states": [
        "Unresolved",
        "Open",
        "Closed",
        "Withdrawn"
      ],
      "terminal": [
        "Closed",
        "Withdrawn"
      ],
      "transitions": [
        {
          "from": "Unresolved",
          "to": "Open",
          "guardIds": [
            "responsibilityRequest.route"
          ],
          "event": "abh.responsibility-request.route",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Open",
          "to": "Unresolved",
          "guardIds": [
            "responsibilityRequest.unroute"
          ],
          "event": "abh.responsibility-request.unroute",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Unresolved",
          "to": "Closed",
          "guardIds": [
            "responsibilityRequest.close"
          ],
          "event": "abh.responsibility-request.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Unresolved",
          "to": "Withdrawn",
          "guardIds": [
            "responsibilityRequest.withdraw"
          ],
          "event": "abh.responsibility-request.withdraw",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Open",
          "to": "Closed",
          "guardIds": [
            "responsibilityRequest.close"
          ],
          "event": "abh.responsibility-request.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Open",
          "to": "Withdrawn",
          "guardIds": [
            "responsibilityRequest.withdraw"
          ],
          "event": "abh.responsibility-request.withdraw",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Grant": {
      "owner": "Control",
      "states": [
        "Active",
        "Revoked",
        "Expired"
      ],
      "terminal": [
        "Revoked",
        "Expired"
      ],
      "transitions": [
        {
          "from": "Active",
          "to": "Revoked",
          "guardIds": [
            "grant.revoke"
          ],
          "event": "abh.grant.revoke",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Expired",
          "guardIds": [
            "grant.expire"
          ],
          "event": "abh.grant.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "ExecutionAuthority": {
      "owner": "Control",
      "states": [
        "Active",
        "Revoked",
        "Expired"
      ],
      "terminal": [
        "Revoked",
        "Expired"
      ],
      "transitions": [
        {
          "from": "Active",
          "to": "Revoked",
          "guardIds": [
            "executionAuthority.revoke"
          ],
          "event": "abh.execution-authority.revoke",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Expired",
          "guardIds": [
            "executionAuthority.expire"
          ],
          "event": "abh.execution-authority.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Reservation": {
      "owner": "ResourceLedger",
      "states": [
        "Held",
        "Consumed",
        "Committed",
        "Released",
        "Expired"
      ],
      "terminal": [
        "Consumed",
        "Committed",
        "Released",
        "Expired"
      ],
      "transitions": [
        {
          "from": "Held",
          "to": "Consumed",
          "guardIds": [
            "reservation.consume"
          ],
          "event": "abh.reservation.consume",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Held",
          "to": "Committed",
          "guardIds": [
            "reservation.commit"
          ],
          "event": "abh.reservation.commit",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Held",
          "to": "Released",
          "guardIds": [
            "reservation.release"
          ],
          "event": "abh.reservation.release",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Held",
          "to": "Expired",
          "guardIds": [
            "reservation.expire"
          ],
          "event": "abh.reservation.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Commitment": {
      "owner": "ResourceLedger",
      "states": [
        "Open",
        "Closing",
        "Closed"
      ],
      "terminal": [
        "Closed"
      ],
      "transitions": [
        {
          "from": "Open",
          "to": "Closing",
          "guardIds": [
            "commitment.closeRequested"
          ],
          "event": "abh.commitment.close-requested",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Closing",
          "to": "Closed",
          "guardIds": [
            "commitment.close"
          ],
          "event": "abh.commitment.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Ledger": {
      "owner": "ResourceLedger",
      "states": [
        "Open",
        "Frozen",
        "Closed"
      ],
      "terminal": [
        "Closed"
      ],
      "transitions": [
        {
          "from": "Open",
          "to": "Frozen",
          "guardIds": [
            "ledger.freeze"
          ],
          "event": "abh.ledger.freeze",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Frozen",
          "to": "Open",
          "guardIds": [
            "ledger.unfreeze"
          ],
          "event": "abh.ledger.unfreeze",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Open",
          "to": "Closed",
          "guardIds": [
            "ledger.close"
          ],
          "event": "abh.ledger.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Frozen",
          "to": "Closed",
          "guardIds": [
            "ledger.close"
          ],
          "event": "abh.ledger.close",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Release": {
      "owner": "CapabilityRelease",
      "states": [
        "Draft",
        "Ready",
        "Retired",
        "Revoked"
      ],
      "terminal": [
        "Retired",
        "Revoked"
      ],
      "transitions": [
        {
          "from": "Draft",
          "to": "Ready",
          "guardIds": [
            "release.ready"
          ],
          "event": "abh.release.ready",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Draft",
          "to": "Retired",
          "guardIds": [
            "release.retire"
          ],
          "event": "abh.release.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Draft",
          "to": "Revoked",
          "guardIds": [
            "release.revoke"
          ],
          "event": "abh.release.revoke",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Ready",
          "to": "Retired",
          "guardIds": [
            "release.retire"
          ],
          "event": "abh.release.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Ready",
          "to": "Revoked",
          "guardIds": [
            "release.revoke"
          ],
          "event": "abh.release.revoke",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "InstalledPack": {
      "owner": "PackLoader",
      "states": [
        "Staged",
        "Enabled",
        "Suspended",
        "Retired"
      ],
      "terminal": [
        "Retired"
      ],
      "transitions": [
        {
          "from": "Staged",
          "to": "Enabled",
          "guardIds": [
            "installedPack.enable"
          ],
          "event": "abh.installed-pack.enable",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Staged",
          "to": "Retired",
          "guardIds": [
            "installedPack.retire"
          ],
          "event": "abh.installed-pack.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Enabled",
          "to": "Suspended",
          "guardIds": [
            "installedPack.suspend"
          ],
          "event": "abh.installed-pack.suspend",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Enabled",
          "to": "Retired",
          "guardIds": [
            "installedPack.retire"
          ],
          "event": "abh.installed-pack.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Suspended",
          "to": "Enabled",
          "guardIds": [
            "installedPack.enable"
          ],
          "event": "abh.installed-pack.enable",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Suspended",
          "to": "Retired",
          "guardIds": [
            "installedPack.retire"
          ],
          "event": "abh.installed-pack.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Artifact": {
      "owner": "ArtifactStore",
      "states": [
        "Staged",
        "Available",
        "Quarantined",
        "Tombstoned"
      ],
      "terminal": [
        "Tombstoned"
      ],
      "transitions": [
        {
          "from": "Staged",
          "to": "Available",
          "guardIds": [
            "artifact.publish"
          ],
          "event": "abh.artifact.publish",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Staged",
          "to": "Quarantined",
          "guardIds": [
            "artifact.quarantine"
          ],
          "event": "abh.artifact.quarantine",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Available",
          "to": "Quarantined",
          "guardIds": [
            "artifact.quarantine"
          ],
          "event": "abh.artifact.quarantine",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Quarantined",
          "to": "Available",
          "guardIds": [
            "artifact.restore"
          ],
          "event": "abh.artifact.restore",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Staged",
          "to": "Tombstoned",
          "guardIds": [
            "artifact.tombstone"
          ],
          "event": "abh.artifact.tombstone",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Available",
          "to": "Tombstoned",
          "guardIds": [
            "artifact.tombstone"
          ],
          "event": "abh.artifact.tombstone",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Quarantined",
          "to": "Tombstoned",
          "guardIds": [
            "artifact.tombstone"
          ],
          "event": "abh.artifact.tombstone",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "AccessRecord": {
      "owner": "Control",
      "states": [
        "Active",
        "Revoked",
        "Expired"
      ],
      "terminal": [
        "Revoked",
        "Expired"
      ],
      "transitions": [
        {
          "from": "Active",
          "to": "Revoked",
          "guardIds": [
            "accessRecord.revoke"
          ],
          "event": "abh.access-record.revoke",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Expired",
          "guardIds": [
            "accessRecord.expire"
          ],
          "event": "abh.access-record.expire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "DurableWait": {
      "owner": "DurableExecution",
      "states": [
        "Pending",
        "Succeeded",
        "Cancelled"
      ],
      "terminal": [
        "Succeeded",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Pending",
          "to": "Succeeded",
          "guardIds": [
            "durableWait.succeed"
          ],
          "event": "abh.durable-wait.succeed",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Cancelled",
          "guardIds": [
            "durableWait.cancel"
          ],
          "event": "abh.durable-wait.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "ExternalObservation": {
      "owner": "Identity",
      "states": [
        "Received",
        "Normalized",
        "Quarantined"
      ],
      "terminal": [
        "Normalized"
      ],
      "transitions": [
        {
          "from": "Received",
          "to": "Normalized",
          "guardIds": [
            "externalObservation.normalize"
          ],
          "event": "abh.external-observation.normalize",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Received",
          "to": "Quarantined",
          "guardIds": [
            "externalObservation.quarantine"
          ],
          "event": "abh.external-observation.quarantine",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Quarantined",
          "to": "Normalized",
          "guardIds": [
            "externalObservation.release"
          ],
          "event": "abh.external-observation.release",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Assignment": {
      "owner": "CapabilityRelease",
      "states": [
        "Shadow",
        "Canary",
        "Active",
        "Paused",
        "Retired"
      ],
      "terminal": [
        "Retired"
      ],
      "transitions": [
        {
          "from": "Shadow",
          "to": "Canary",
          "guardIds": [
            "assignment.promoteCanary"
          ],
          "event": "abh.assignment.promote-canary",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Shadow",
          "to": "Paused",
          "guardIds": [
            "assignment.pause"
          ],
          "event": "abh.assignment.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Shadow",
          "to": "Retired",
          "guardIds": [
            "assignment.retire"
          ],
          "event": "abh.assignment.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Canary",
          "to": "Active",
          "guardIds": [
            "assignment.promoteActive"
          ],
          "event": "abh.assignment.promote-active",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Canary",
          "to": "Paused",
          "guardIds": [
            "assignment.pause"
          ],
          "event": "abh.assignment.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Canary",
          "to": "Retired",
          "guardIds": [
            "assignment.retire"
          ],
          "event": "abh.assignment.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Paused",
          "guardIds": [
            "assignment.pause"
          ],
          "event": "abh.assignment.pause",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Active",
          "to": "Retired",
          "guardIds": [
            "assignment.retire"
          ],
          "event": "abh.assignment.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Shadow",
          "guardIds": [
            "assignment.resumeShadow"
          ],
          "event": "abh.assignment.resume-shadow",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Canary",
          "guardIds": [
            "assignment.resumeCanary"
          ],
          "event": "abh.assignment.resume-canary",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Active",
          "guardIds": [
            "assignment.resumeActive"
          ],
          "event": "abh.assignment.resume-active",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Paused",
          "to": "Retired",
          "guardIds": [
            "assignment.retire"
          ],
          "event": "abh.assignment.retire",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "Attempt": {
      "owner": "OperationController",
      "states": [
        "Created",
        "Sent",
        "Responded",
        "TransportFailed",
        "Interrupted"
      ],
      "terminal": [
        "Responded",
        "TransportFailed",
        "Interrupted"
      ],
      "transitions": [
        {
          "from": "Created",
          "to": "Sent",
          "guardIds": [
            "attempt.sent"
          ],
          "event": "abh.attempt.sent",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Created",
          "to": "Responded",
          "guardIds": [
            "attempt.responded"
          ],
          "event": "abh.attempt.responded",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Created",
          "to": "TransportFailed",
          "guardIds": [
            "attempt.transportFailed"
          ],
          "event": "abh.attempt.transport-failed",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Created",
          "to": "Interrupted",
          "guardIds": [
            "attempt.interrupted"
          ],
          "event": "abh.attempt.interrupted",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Sent",
          "to": "Responded",
          "guardIds": [
            "attempt.responded"
          ],
          "event": "abh.attempt.responded",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Sent",
          "to": "TransportFailed",
          "guardIds": [
            "attempt.transportFailed"
          ],
          "event": "abh.attempt.transport-failed",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Sent",
          "to": "Interrupted",
          "guardIds": [
            "attempt.interrupted"
          ],
          "event": "abh.attempt.interrupted",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    },
    "PackInspectionJob": {
      "owner": "PackLoader",
      "states": [
        "Pending",
        "Running",
        "Waiting",
        "Succeeded",
        "Failed",
        "Cancelled"
      ],
      "terminal": [
        "Succeeded",
        "Failed",
        "Cancelled"
      ],
      "transitions": [
        {
          "from": "Pending",
          "to": "Running",
          "guardIds": [
            "packInspectionJob.start"
          ],
          "event": "abh.pack-inspection-job.start",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Failed",
          "guardIds": [
            "packInspectionJob.fail"
          ],
          "event": "abh.pack-inspection-job.fail",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Pending",
          "to": "Cancelled",
          "guardIds": [
            "packInspectionJob.cancel"
          ],
          "event": "abh.pack-inspection-job.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Waiting",
          "guardIds": [
            "packInspectionJob.wait"
          ],
          "event": "abh.pack-inspection-job.wait",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Succeeded",
          "guardIds": [
            "packInspectionJob.succeed"
          ],
          "event": "abh.pack-inspection-job.succeed",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Failed",
          "guardIds": [
            "packInspectionJob.fail"
          ],
          "event": "abh.pack-inspection-job.fail",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Running",
          "to": "Cancelled",
          "guardIds": [
            "packInspectionJob.cancel"
          ],
          "event": "abh.pack-inspection-job.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Running",
          "guardIds": [
            "packInspectionJob.start"
          ],
          "event": "abh.pack-inspection-job.start",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Failed",
          "guardIds": [
            "packInspectionJob.fail"
          ],
          "event": "abh.pack-inspection-job.fail",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        },
        {
          "from": "Waiting",
          "to": "Cancelled",
          "guardIds": [
            "packInspectionJob.cancel"
          ],
          "event": "abh.pack-inspection-job.cancel",
          "effects": [
            "OwnerCAS",
            "Audit",
            "Outbox"
          ]
        }
      ]
    }
  }
} as const;
