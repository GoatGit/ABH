# Generated state contract reference

Contract 0.1.0. Guard descriptions do not grant permission.

## Mission

Owner: MissionController. Source: 2. Mission.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Draft | Active | mission.activate | abh.mission.activate | OwnerCAS, Audit, Outbox |
| Active | Paused | mission.pause | abh.mission.pause | OwnerCAS, Audit, Outbox |
| Active | Blocked | mission.block | abh.mission.block | OwnerCAS, Audit, Outbox |
| Paused | Active | mission.resume | abh.mission.resume | OwnerCAS, Audit, Outbox |
| Blocked | Active | mission.resolve | abh.mission.resolve | OwnerCAS, Audit, Outbox |
| Blocked | Paused | mission.resolve | abh.mission.resolve | OwnerCAS, Audit, Outbox |
| Active | Cancelled | mission.cancel | abh.mission.cancel | OwnerCAS, Audit, Outbox |
| Paused | Cancelled | mission.cancel | abh.mission.cancel | OwnerCAS, Audit, Outbox |
| Blocked | Cancelled | mission.cancel | abh.mission.cancel | OwnerCAS, Audit, Outbox |
| Active | Completed | mission.complete | abh.mission.complete | OwnerCAS, Audit, Outbox |

## Run

Owner: MissionController. Source: 3. Run、Task 与 Invocation.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Queued | Running | run.start | abh.run.start | OwnerCAS, Audit, Outbox |
| Running | Waiting | run.wait | abh.run.wait | OwnerCAS, Audit, Outbox |
| Waiting | Running | run.wake | abh.run.wake | OwnerCAS, Audit, Outbox |
| Running | Completed | run.complete | abh.run.complete | OwnerCAS, Audit, Outbox |
| Running | Failed | run.complete | abh.run.complete | OwnerCAS, Audit, Outbox |
| Running | Cancelled | run.cancel | abh.run.cancel | OwnerCAS, Audit, Outbox |
| Running | Paused | run.pause | abh.run.pause | OwnerCAS, Audit, Outbox |
| Paused | Queued | run.resume | abh.run.resume | OwnerCAS, Audit, Outbox |
| Paused | Failed | run.complete | abh.run.complete | OwnerCAS, Audit, Outbox |
| Paused | Cancelled | run.cancel | abh.run.cancel | OwnerCAS, Audit, Outbox |
| Waiting | Failed | run.complete | abh.run.complete | OwnerCAS, Audit, Outbox |
| Waiting | Cancelled | run.cancel | abh.run.cancel | OwnerCAS, Audit, Outbox |
| Waiting | Paused | run.pause | abh.run.pause | OwnerCAS, Audit, Outbox |

## Action

Owner: ActionEngine. Source: 6. Action：生命周期与 Outcome.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Proposed | Validated | action.validate | abh.action.validate | OwnerCAS, Audit, Outbox |
| Proposed | Rejected | action.reject | abh.action.reject | OwnerCAS, Audit, Outbox |
| Proposed | Expired | action.expire | abh.action.expire | OwnerCAS, Audit, Outbox |
| Proposed | Cancelled | action.cancel | abh.action.cancel | OwnerCAS, Audit, Outbox |
| Validated | Rejected | action.reject | abh.action.reject | OwnerCAS, Audit, Outbox |
| Validated | Expired | action.expire | abh.action.expire | OwnerCAS, Audit, Outbox |
| Validated | Cancelled | action.cancel | abh.action.cancel | OwnerCAS, Audit, Outbox |
| Validated | Authorized | action.authorize | abh.action.authorize | OwnerCAS, Audit, Outbox |
| Authorized | Validated | action.reauthorize | abh.action.reauthorize | OwnerCAS, Audit, Outbox |
| Authorized | Executing | action.dispatch | abh.action.dispatch | OwnerCAS, Audit, Outbox |
| Authorized | Expired | action.expire | abh.action.expire | OwnerCAS, Audit, Outbox |
| Authorized | Cancelled | action.cancel | abh.action.cancel | OwnerCAS, Audit, Outbox |
| Executing | Reconciling | action.reconcile | abh.action.reconcile | OwnerCAS, Audit, Outbox |
| Executing | Closed | action.close | abh.action.close | OwnerCAS, Audit, Outbox |
| Reconciling | Closed | action.close | abh.action.close | OwnerCAS, Audit, Outbox |
| Executing | Executing | action.advance | abh.action.advance | OwnerCAS, Audit, Outbox |
| Reconciling | Reconciling | action.advance | abh.action.advance | OwnerCAS, Audit, Outbox |

## Operation

Owner: OperationController. Source: 7. Operation、Attempt 与对账.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Pending | Dispatching | operation.dispatch | abh.operation.dispatch | OwnerCAS, Audit, Outbox |
| Pending | Cancelled | operation.cancel | abh.operation.cancel | OwnerCAS, Audit, Outbox |
| Dispatching | Observing | operation.observe | abh.operation.observe | OwnerCAS, Audit, Outbox |
| Dispatching | Pending | operation.retry | abh.operation.retry | OwnerCAS, Audit, Outbox |
| Observing | Pending | operation.retry | abh.operation.retry | OwnerCAS, Audit, Outbox |
| Dispatching | Closed | operation.close | abh.operation.close | OwnerCAS, Audit, Outbox |
| Observing | Closed | operation.close | abh.operation.close | OwnerCAS, Audit, Outbox |
| Observing | Observing | operation.observe | abh.operation.observe | OwnerCAS, Audit, Outbox |

## Decision

Owner: HumanGateway. Source: 4. Human Gateway.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Pending | Approved | decision.approve | abh.decision.approve | OwnerCAS, Audit, Outbox |
| Pending | Rejected | decision.reject | abh.decision.reject | OwnerCAS, Audit, Outbox |
| Pending | Expired | decision.expire | abh.decision.expire | OwnerCAS, Audit, Outbox |
| Pending | Superseded | decision.supersede | abh.decision.supersede | OwnerCAS, Audit, Outbox |
| Pending | Withdrawn | decision.withdraw | abh.decision.withdraw | OwnerCAS, Audit, Outbox |

## DecisionEffect

Owner: HumanGateway. Source: 10. 辅助运行状态.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Pending | Applied | decisionEffect.apply | abh.decision-effect.apply | OwnerCAS, Audit, Outbox |
| Blocked | Applied | decisionEffect.apply | abh.decision-effect.apply | OwnerCAS, Audit, Outbox |
| Pending | Blocked | decisionEffect.block | abh.decision-effect.block | OwnerCAS, Audit, Outbox |
| Pending | Abandoned | decisionEffect.abandon | abh.decision-effect.abandon | OwnerCAS, Audit, Outbox |
| Blocked | Abandoned | decisionEffect.abandon | abh.decision-effect.abandon | OwnerCAS, Audit, Outbox |

## ResponsibilityRequest

Owner: HumanGateway. Source: 4. Human Gateway.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Unresolved | Open | responsibilityRequest.route | abh.responsibility-request.route | OwnerCAS, Audit, Outbox |
| Open | Unresolved | responsibilityRequest.unroute | abh.responsibility-request.unroute | OwnerCAS, Audit, Outbox |
| Unresolved | Closed | responsibilityRequest.close | abh.responsibility-request.close | OwnerCAS, Audit, Outbox |
| Unresolved | Withdrawn | responsibilityRequest.withdraw | abh.responsibility-request.withdraw | OwnerCAS, Audit, Outbox |
| Open | Closed | responsibilityRequest.close | abh.responsibility-request.close | OwnerCAS, Audit, Outbox |
| Open | Withdrawn | responsibilityRequest.withdraw | abh.responsibility-request.withdraw | OwnerCAS, Audit, Outbox |

## Grant

Owner: Control. Source: 5. Grant、Snapshot 与资源.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Active | Revoked | grant.revoke | abh.grant.revoke | OwnerCAS, Audit, Outbox |
| Active | Expired | grant.expire | abh.grant.expire | OwnerCAS, Audit, Outbox |

## ExecutionAuthority

Owner: Control. Source: 5. Grant、Snapshot 与资源.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Active | Revoked | executionAuthority.revoke | abh.execution-authority.revoke | OwnerCAS, Audit, Outbox |
| Active | Expired | executionAuthority.expire | abh.execution-authority.expire | OwnerCAS, Audit, Outbox |

## Reservation

Owner: ResourceLedger. Source: 5. Grant、Snapshot 与资源.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Held | Consumed | reservation.consume | abh.reservation.consume | OwnerCAS, Audit, Outbox |
| Held | Committed | reservation.commit | abh.reservation.commit | OwnerCAS, Audit, Outbox |
| Held | Released | reservation.release | abh.reservation.release | OwnerCAS, Audit, Outbox |
| Held | Expired | reservation.expire | abh.reservation.expire | OwnerCAS, Audit, Outbox |

## Commitment

Owner: ResourceLedger. Source: 5. Grant、Snapshot 与资源.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Open | Closing | commitment.closeRequested | abh.commitment.close-requested | OwnerCAS, Audit, Outbox |
| Closing | Closed | commitment.close | abh.commitment.close | OwnerCAS, Audit, Outbox |

## Ledger

Owner: ResourceLedger. Source: 5. Grant、Snapshot 与资源.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Open | Frozen | ledger.freeze | abh.ledger.freeze | OwnerCAS, Audit, Outbox |
| Frozen | Open | ledger.unfreeze | abh.ledger.unfreeze | OwnerCAS, Audit, Outbox |
| Open | Closed | ledger.close | abh.ledger.close | OwnerCAS, Audit, Outbox |
| Frozen | Closed | ledger.close | abh.ledger.close | OwnerCAS, Audit, Outbox |

## Release

Owner: CapabilityRelease. Source: 8. 学习、能力与 Pack.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Draft | Ready | release.ready | abh.release.ready | OwnerCAS, Audit, Outbox |
| Draft | Retired | release.retire | abh.release.retire | OwnerCAS, Audit, Outbox |
| Draft | Revoked | release.revoke | abh.release.revoke | OwnerCAS, Audit, Outbox |
| Ready | Retired | release.retire | abh.release.retire | OwnerCAS, Audit, Outbox |
| Ready | Revoked | release.revoke | abh.release.revoke | OwnerCAS, Audit, Outbox |

## InstalledPack

Owner: PackLoader. Source: 8. 学习、能力与 Pack.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Staged | Enabled | installedPack.enable | abh.installed-pack.enable | OwnerCAS, Audit, Outbox |
| Staged | Retired | installedPack.retire | abh.installed-pack.retire | OwnerCAS, Audit, Outbox |
| Enabled | Suspended | installedPack.suspend | abh.installed-pack.suspend | OwnerCAS, Audit, Outbox |
| Enabled | Retired | installedPack.retire | abh.installed-pack.retire | OwnerCAS, Audit, Outbox |
| Suspended | Enabled | installedPack.enable | abh.installed-pack.enable | OwnerCAS, Audit, Outbox |
| Suspended | Retired | installedPack.retire | abh.installed-pack.retire | OwnerCAS, Audit, Outbox |

## Artifact

Owner: ArtifactStore. Source: 8. 学习、能力与 Pack.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Staged | Available | artifact.publish | abh.artifact.publish | OwnerCAS, Audit, Outbox |
| Staged | Quarantined | artifact.quarantine | abh.artifact.quarantine | OwnerCAS, Audit, Outbox |
| Available | Quarantined | artifact.quarantine | abh.artifact.quarantine | OwnerCAS, Audit, Outbox |
| Quarantined | Available | artifact.restore | abh.artifact.restore | OwnerCAS, Audit, Outbox |
| Staged | Tombstoned | artifact.tombstone | abh.artifact.tombstone | OwnerCAS, Audit, Outbox |
| Available | Tombstoned | artifact.tombstone | abh.artifact.tombstone | OwnerCAS, Audit, Outbox |
| Quarantined | Tombstoned | artifact.tombstone | abh.artifact.tombstone | OwnerCAS, Audit, Outbox |

## AccessRecord

Owner: Control. Source: 10. 辅助运行状态.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Active | Revoked | accessRecord.revoke | abh.access-record.revoke | OwnerCAS, Audit, Outbox |
| Active | Expired | accessRecord.expire | abh.access-record.expire | OwnerCAS, Audit, Outbox |

## DurableWait

Owner: DurableExecution. Source: 10. 辅助运行状态.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Pending | Succeeded | durableWait.succeed | abh.durable-wait.succeed | OwnerCAS, Audit, Outbox |
| Pending | Cancelled | durableWait.cancel | abh.durable-wait.cancel | OwnerCAS, Audit, Outbox |

## ExternalObservation

Owner: Identity. Source: 10. 辅助运行状态.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Received | Normalized | externalObservation.normalize | abh.external-observation.normalize | OwnerCAS, Audit, Outbox |
| Received | Quarantined | externalObservation.quarantine | abh.external-observation.quarantine | OwnerCAS, Audit, Outbox |
| Quarantined | Normalized | externalObservation.release | abh.external-observation.release | OwnerCAS, Audit, Outbox |

## Assignment

Owner: CapabilityRelease. Source: 8. 学习、能力与 Pack.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Shadow | Canary | assignment.promoteCanary | abh.assignment.promote-canary | OwnerCAS, Audit, Outbox |
| Shadow | Paused | assignment.pause | abh.assignment.pause | OwnerCAS, Audit, Outbox |
| Shadow | Retired | assignment.retire | abh.assignment.retire | OwnerCAS, Audit, Outbox |
| Canary | Active | assignment.promoteActive | abh.assignment.promote-active | OwnerCAS, Audit, Outbox |
| Canary | Paused | assignment.pause | abh.assignment.pause | OwnerCAS, Audit, Outbox |
| Canary | Retired | assignment.retire | abh.assignment.retire | OwnerCAS, Audit, Outbox |
| Active | Paused | assignment.pause | abh.assignment.pause | OwnerCAS, Audit, Outbox |
| Active | Retired | assignment.retire | abh.assignment.retire | OwnerCAS, Audit, Outbox |
| Paused | Shadow | assignment.resumeShadow | abh.assignment.resume-shadow | OwnerCAS, Audit, Outbox |
| Paused | Canary | assignment.resumeCanary | abh.assignment.resume-canary | OwnerCAS, Audit, Outbox |
| Paused | Active | assignment.resumeActive | abh.assignment.resume-active | OwnerCAS, Audit, Outbox |
| Paused | Retired | assignment.retire | abh.assignment.retire | OwnerCAS, Audit, Outbox |

## Attempt

Owner: OperationController. Source: 7. Operation、Attempt 与对账.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Created | Sent | attempt.sent | abh.attempt.sent | OwnerCAS, Audit, Outbox |
| Created | Responded | attempt.responded | abh.attempt.responded | OwnerCAS, Audit, Outbox |
| Created | TransportFailed | attempt.transportFailed | abh.attempt.transport-failed | OwnerCAS, Audit, Outbox |
| Created | Interrupted | attempt.interrupted | abh.attempt.interrupted | OwnerCAS, Audit, Outbox |
| Sent | Responded | attempt.responded | abh.attempt.responded | OwnerCAS, Audit, Outbox |
| Sent | TransportFailed | attempt.transportFailed | abh.attempt.transport-failed | OwnerCAS, Audit, Outbox |
| Sent | Interrupted | attempt.interrupted | abh.attempt.interrupted | OwnerCAS, Audit, Outbox |

## PackInspectionJob

Owner: PackLoader. Source: 10. 辅助运行状态.

| From | To | Guards | Event | Atomic effects |
|---|---|---|---|---|
| Pending | Running | packInspectionJob.start | abh.pack-inspection-job.start | OwnerCAS, Audit, Outbox |
| Pending | Failed | packInspectionJob.fail | abh.pack-inspection-job.fail | OwnerCAS, Audit, Outbox |
| Pending | Cancelled | packInspectionJob.cancel | abh.pack-inspection-job.cancel | OwnerCAS, Audit, Outbox |
| Running | Waiting | packInspectionJob.wait | abh.pack-inspection-job.wait | OwnerCAS, Audit, Outbox |
| Running | Succeeded | packInspectionJob.succeed | abh.pack-inspection-job.succeed | OwnerCAS, Audit, Outbox |
| Running | Failed | packInspectionJob.fail | abh.pack-inspection-job.fail | OwnerCAS, Audit, Outbox |
| Running | Cancelled | packInspectionJob.cancel | abh.pack-inspection-job.cancel | OwnerCAS, Audit, Outbox |
| Waiting | Running | packInspectionJob.start | abh.pack-inspection-job.start | OwnerCAS, Audit, Outbox |
| Waiting | Failed | packInspectionJob.fail | abh.pack-inspection-job.fail | OwnerCAS, Audit, Outbox |
| Waiting | Cancelled | packInspectionJob.cancel | abh.pack-inspection-job.cancel | OwnerCAS, Audit, Outbox |
