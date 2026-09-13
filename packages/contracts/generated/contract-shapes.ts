/* Generated structural navigation; no runtime compilation. */
export const contractShapes = {
  "UUID": {},
  "Version": {},
  "RegisteredName": {},
  "ExactVersion": {},
  "Digest": {},
  "Time": {},
  "Decimal": {},
  "Money": {
    "properties": {
      "amount": {
        "ref": "Decimal"
      },
      "currency": {}
    }
  },
  "EntityRef": {
    "properties": {
      "type": {
        "ref": "RegisteredName"
      },
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    }
  },
  "EntitySelector": {
    "properties": {
      "type": {
        "ref": "RegisteredName"
      },
      "id": {
        "ref": "UUID"
      }
    }
  },
  "CapabilityRef": {
    "properties": {
      "kind": {},
      "id": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "ExactVersion"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "AuthorityRef": {
    "branches": [
      {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-authority"
        }
      },
      {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      }
    ]
  },
  "SubjectRef": {
    "branches": [
      {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      }
    ]
  },
  "Actor": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "responsibilityRef": {
        "ref": "EntityRef"
      }
    }
  },
  "Target": {
    "properties": {
      "objectRef": {
        "ref": "EntityRef"
      },
      "action": {
        "ref": "RegisteredName"
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "AuthenticationStrength": {
    "branches": [
      {
        "properties": {
          "level": {}
        },
        "constants": {
          "level": "SingleFactor"
        }
      },
      {
        "properties": {
          "level": {},
          "mfaVerifiedAt": {
            "ref": "Time"
          }
        },
        "constants": {
          "level": "MultiFactor"
        }
      },
      {
        "properties": {
          "level": {}
        },
        "constants": {
          "level": "Workload"
        }
      }
    ]
  },
  "RequestContext": {
    "properties": {
      "requestId": {
        "ref": "UUID"
      },
      "correlationId": {
        "ref": "UUID"
      },
      "causationId": {
        "ref": "UUID"
      },
      "traceId": {},
      "actingOrganizationId": {
        "ref": "UUID"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "workspaceId": {
        "ref": "UUID"
      },
      "actor": {
        "ref": "Actor"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "authnStrength": {
        "ref": "AuthenticationStrength"
      },
      "sessionEpoch": {},
      "scopeEpoch": {},
      "executionAuthorityRef": {
        "ref": "AuthorityRef"
      },
      "originatingRequestRef": {
        "ref": "EntityRef"
      },
      "contextExpiresAt": {
        "ref": "Time"
      },
      "receivedAt": {
        "ref": "Time"
      },
      "locale": {},
      "businessTimezone": {}
    }
  },
  "AuthorizedRequestContext": {
    "properties": {
      "requestId": {
        "ref": "UUID"
      },
      "correlationId": {
        "ref": "UUID"
      },
      "causationId": {
        "ref": "UUID"
      },
      "traceId": {},
      "actingOrganizationId": {
        "ref": "UUID"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "workspaceId": {
        "ref": "UUID"
      },
      "actor": {
        "ref": "Actor"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "authnStrength": {
        "ref": "AuthenticationStrength"
      },
      "sessionEpoch": {},
      "scopeEpoch": {},
      "executionAuthorityRef": {
        "ref": "AuthorityRef"
      },
      "originatingRequestRef": {
        "ref": "EntityRef"
      },
      "contextExpiresAt": {
        "ref": "Time"
      },
      "receivedAt": {
        "ref": "Time"
      },
      "locale": {},
      "businessTimezone": {},
      "authorizationSnapshotId": {
        "ref": "UUID"
      }
    }
  },
  "ExecutionAuthorityBinding": {
    "branches": [
      {
        "properties": {
          "kind": {}
        },
        "constants": {
          "kind": "Scope"
        }
      },
      {
        "properties": {
          "kind": {},
          "actionRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "payloadDigest": {
            "ref": "Digest"
          }
        },
        "constants": {
          "kind": "Action"
        }
      }
    ]
  },
  "ExecutionAuthority": {
    "properties": {
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "allowedProposerRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.principal"
          }
        },
        "set": true
      },
      "binding": {
        "ref": "ExecutionAuthorityBinding"
      },
      "grantRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.grant"
          }
        },
        "set": true
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.purpose"
          }
        },
        "set": true
      },
      "actionTypes": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "resourceEnvelopeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-envelope"
        }
      },
      "validFrom": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "stopConditions": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "issuanceEvidenceRef": {
        "branches": [
          {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.request-completion-evidence"
            }
          },
          {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.policy-evaluation"
            }
          }
        ]
      },
      "effectKey": {},
      "issuedBy": {
        "ref": "Actor"
      },
      "sourceVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "issuanceDigest": {
        "ref": "Digest"
      },
      "supersedesAuthorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "status": {
        "ref": "ExecutionAuthorityState"
      }
    }
  },
  "ResolveAndPinRequest": {
    "properties": {
      "subjectRef": {
        "ref": "SubjectRef"
      },
      "subjectInputDigest": {
        "ref": "Digest"
      },
      "requiredBehaviorSlots": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "verifiedScope": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "requestContextRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.request-context"
        }
      },
      "preparationAuthorityRefs": {
        "items": {
          "branches": [
            {
              "ref": "AuthorityRef"
            },
            {
              "properties": {
                "type": {},
                "id": {
                  "ref": "UUID"
                },
                "version": {
                  "ref": "Version"
                }
              },
              "constants": {
                "type": "abh.grant"
              }
            }
          ]
        },
        "set": true
      }
    }
  },
  "ExecutionPin": {
    "properties": {
      "behaviorSlot": {
        "ref": "RegisteredName"
      },
      "assignmentRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "releaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "capabilityExactRefs": {
        "items": {
          "ref": "CapabilityRef"
        },
        "set": true
      },
      "versionVector": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "allocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.allocation"
        }
      }
    }
  },
  "PinSet": {
    "properties": {
      "pinSetRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.pin-set"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "subjectRef": {
        "ref": "SubjectRef"
      },
      "subjectInputDigest": {
        "ref": "Digest"
      },
      "requiredSlotsDigest": {
        "ref": "Digest"
      },
      "digest": {
        "ref": "Digest"
      },
      "pins": {
        "items": {
          "ref": "ExecutionPin"
        },
        "set": true
      }
    }
  },
  "DevelopmentConfig": {
    "properties": {
      "deployment": {
        "properties": {
          "profile": {}
        },
        "constants": {
          "profile": "Development"
        }
      },
      "identity": {
        "properties": {
          "provider": {}
        },
        "constants": {
          "provider": "Fake"
        }
      },
      "database": {
        "properties": {
          "runtimeUrlRef": {},
          "queueUrlRef": {},
          "statementTimeoutMs": {},
          "lockTimeoutMs": {}
        }
      },
      "runtime": {
        "properties": {
          "businessEntry": {},
          "mode": {},
          "action": {
            "properties": {
              "maxOperations": {},
              "maxDependencies": {},
              "intentExpirySeconds": {}
            }
          },
          "queue": {
            "properties": {
              "publishBatch": {},
              "pollIntervalMs": {}
            }
          },
          "reconciliation": {
            "properties": {
              "initialDelaySeconds": {},
              "maxDelaySeconds": {}
            }
          }
        },
        "constants": {
          "mode": "ActionOnly"
        }
      },
      "web": {
        "properties": {
          "enabled": {}
        },
        "constants": {
          "enabled": false
        }
      },
      "observability": {
        "properties": {
          "projectTelemetry": {}
        },
        "constants": {
          "projectTelemetry": false
        }
      }
    }
  },
  "ActionRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.action"
    }
  },
  "OperationRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operation"
    }
  },
  "PlanRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operation-plan"
    }
  },
  "DecisionRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.decision"
    }
  },
  "DecisionEffectRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.decision-effect"
    }
  },
  "CommandRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.command"
    }
  },
  "ArtifactRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.artifact"
    }
  },
  "PinSetRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pin-set"
    }
  },
  "RequestRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-request"
    }
  },
  "IdempotencyKey": {},
  "NodeKey": {},
  "Reason": {},
  "NonnegativeDecimal": {
    "branches": [
      {
        "ref": "Decimal"
      },
      {}
    ]
  },
  "ResourceRequirement": {
    "properties": {
      "resourceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource"
        }
      },
      "quantity": {
        "ref": "NonnegativeDecimal"
      },
      "unit": {
        "ref": "RegisteredName"
      }
    }
  },
  "ImpactUpperBound": {
    "properties": {
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "resourceRequirements": {
        "items": {
          "ref": "ResourceRequirement"
        },
        "set": true
      },
      "maxMoney": {
        "items": {
          "properties": {
            "amount": {
              "ref": "NonnegativeDecimal"
            },
            "currency": {}
          }
        },
        "set": true
      },
      "description": {}
    }
  },
  "ProposeActionPayload": {
    "properties": {
      "actionType": {
        "ref": "RegisteredName"
      },
      "targetRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "payloadRef": {
        "ref": "ArtifactRef"
      },
      "sourceVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "sourceProposalRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ProposeSafetyStopPayload": {
    "properties": {
      "proposal": {
        "ref": "ProposeActionPayload"
      },
      "fenceRef": {
        "ref": "EntityRef"
      },
      "fencingToken": {
        "ref": "Version"
      },
      "unresolvedOperationRef": {
        "ref": "OperationRef"
      }
    }
  },
  "ActionProposal": {
    "properties": {
      "actionType": {
        "ref": "RegisteredName"
      },
      "targetRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "payloadRef": {
        "ref": "ArtifactRef"
      },
      "sourceVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "sourceProposalRef": {
        "ref": "EntityRef"
      },
      "completionPolicyRef": {
        "ref": "EntityRef"
      },
      "resourceRequirements": {
        "items": {
          "ref": "ResourceRequirement"
        },
        "set": true
      }
    }
  },
  "CancelActionPayload": {
    "properties": {
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "RequestAuthorizationPayload": {
    "properties": {
      "authorityRefs": {
        "items": {
          "ref": "AuthorityRef"
        },
        "set": true
      }
    }
  },
  "ValidateActionPayload": {
    "properties": {
      "domainValidationRef": {
        "ref": "EntityRef"
      }
    }
  },
  "RegisterOperationPlanPayload": {
    "properties": {
      "pinSetRef": {
        "ref": "PinSetRef"
      },
      "pinSetDigest": {
        "ref": "Digest"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "planDigest": {
        "ref": "Digest"
      },
      "scopeProofRef": {
        "ref": "EntityRef"
      }
    }
  },
  "OperationInputBinding": {
    "properties": {
      "inputPath": {},
      "parentNodeKey": {
        "ref": "NodeKey"
      },
      "outputName": {
        "ref": "RegisteredName"
      },
      "valueType": {
        "ref": "RegisteredName"
      }
    }
  },
  "OperationPlanNode": {
    "properties": {
      "nodeKey": {
        "ref": "NodeKey"
      },
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "resourceKey": {
        "ref": "RegisteredName"
      },
      "operationType": {
        "ref": "RegisteredName"
      },
      "payloadRef": {
        "ref": "ArtifactRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "connectorRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Connector"
            }
          }
        ]
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "completionPolicyRef": {
        "ref": "EntityRef"
      },
      "resourceRequirements": {
        "items": {
          "ref": "ResourceRequirement"
        },
        "set": true
      },
      "dependsOn": {
        "items": {
          "ref": "NodeKey"
        },
        "set": true
      },
      "inputBindings": {
        "items": {
          "ref": "OperationInputBinding"
        },
        "set": true
      },
      "expectedExternalVersion": {}
    }
  },
  "OperationPlan": {
    "properties": {
      "planRef": {
        "ref": "PlanRef"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "planVersion": {
        "ref": "Version"
      },
      "pinSetRef": {
        "ref": "PinSetRef"
      },
      "pinSetDigest": {
        "ref": "Digest"
      },
      "validatedAgainstPayloadDigest": {
        "ref": "Digest"
      },
      "compilerRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Compiler"
            }
          }
        ]
      },
      "connectorRefs": {
        "items": {
          "branches": [
            {
              "ref": "CapabilityRef"
            },
            {
              "properties": {
                "kind": {}
              },
              "constants": {
                "kind": "Connector"
              }
            }
          ]
        },
        "set": true
      },
      "scopeProofRef": {
        "ref": "EntityRef"
      },
      "completionPolicyRef": {
        "ref": "EntityRef"
      },
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "nodes": {
        "items": {
          "ref": "OperationPlanNode"
        },
        "set": true
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "ActionRecord": {
    "properties": {
      "actionRef": {
        "ref": "ActionRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "sourceCommandRef": {
        "ref": "CommandRef"
      },
      "proposedBy": {
        "ref": "Actor"
      },
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "executionAuthorityRef": {
        "ref": "AuthorityRef"
      },
      "pinSetRef": {
        "ref": "PinSetRef"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "actionType": {
        "ref": "RegisteredName"
      },
      "payloadArtifactRef": {
        "ref": "ArtifactRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "targetRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "inputVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "completionPolicyRef": {
        "ref": "EntityRef"
      },
      "riskClass": {
        "ref": "RegisteredName"
      },
      "position": {
        "ref": "ActionPosition"
      },
      "cancellationRequestedAt": {
        "ref": "Time"
      },
      "authorizationSnapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "resultRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action-result"
        }
      }
    }
  },
  "DecisionResponse": {},
  "DecisionPackage": {
    "properties": {
      "requestRef": {
        "ref": "RequestRef"
      },
      "routeRevision": {
        "ref": "Version"
      },
      "slotId": {
        "ref": "NodeKey"
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "proposalDigest": {
        "ref": "Digest"
      },
      "question": {},
      "recommendation": {},
      "alternatives": {
        "items": {}
      },
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "risks": {
        "items": {}
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "validUntil": {
        "ref": "Time"
      },
      "allowedResponses": {
        "items": {
          "ref": "DecisionResponse"
        },
        "set": true
      },
      "packageDigest": {
        "ref": "Digest"
      }
    }
  },
  "SubmitDecisionPayload": {
    "branches": [
      {
        "properties": {
          "packageDigest": {
            "ref": "Digest"
          },
          "response": {},
          "conditionRefs": {
            "items": {
              "properties": {
                "type": {},
                "id": {
                  "ref": "UUID"
                },
                "version": {
                  "ref": "Version"
                }
              },
              "constants": {
                "type": "abh.condition"
              }
            },
            "set": true
          },
          "reason": {
            "ref": "Reason"
          },
          "reauthProofRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reauth-proof"
            }
          }
        },
        "constants": {
          "response": "Approved"
        }
      },
      {
        "properties": {
          "packageDigest": {
            "ref": "Digest"
          },
          "response": {},
          "conditionRefs": {
            "items": {
              "properties": {
                "type": {},
                "id": {
                  "ref": "UUID"
                },
                "version": {
                  "ref": "Version"
                }
              },
              "constants": {
                "type": "abh.condition"
              }
            },
            "set": true
          },
          "reason": {
            "ref": "Reason"
          },
          "reauthProofRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reauth-proof"
            }
          }
        },
        "constants": {
          "response": "Rejected"
        }
      }
    ]
  },
  "WithdrawDecisionPayload": {
    "properties": {
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "DecisionEffectSummary": {
    "properties": {
      "effectRef": {
        "ref": "DecisionEffectRef"
      },
      "status": {
        "ref": "DecisionEffectState"
      },
      "receiptRef": {
        "ref": "EntityRef"
      },
      "failureRef": {
        "ref": "EntityRef"
      }
    }
  },
  "DecisionView": {
    "properties": {
      "decisionRef": {
        "ref": "DecisionRef"
      },
      "package": {
        "ref": "DecisionPackage"
      },
      "status": {
        "ref": "DecisionState"
      },
      "effectSummaries": {
        "items": {
          "ref": "DecisionEffectSummary"
        },
        "set": true
      },
      "availableActions": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      }
    }
  },
  "AuthorizationSummary": {
    "properties": {
      "authorityRef": {
        "ref": "AuthorityRef"
      },
      "snapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "expiresAt": {
        "ref": "Time"
      },
      "requestRef": {
        "ref": "RequestRef"
      }
    }
  },
  "OperationSummary": {
    "properties": {
      "operationRef": {
        "ref": "OperationRef"
      },
      "position": {
        "ref": "OperationPosition"
      }
    }
  },
  "ActionView": {
    "properties": {
      "actionRef": {
        "ref": "ActionRef"
      },
      "actionType": {
        "ref": "RegisteredName"
      },
      "position": {
        "ref": "ActionPosition"
      },
      "authorizationSummary": {
        "ref": "AuthorizationSummary"
      },
      "operationSummary": {
        "items": {
          "ref": "OperationSummary"
        },
        "set": true
      },
      "unresolvedRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "availableActions": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      }
    }
  },
  "QueryMeta": {
    "properties": {
      "nextCursor": {},
      "asOf": {
        "ref": "Time"
      },
      "watermark": {},
      "stale": {}
    }
  },
  "ActionQueryResponse": {
    "properties": {
      "success": {},
      "data": {
        "ref": "ActionView"
      },
      "meta": {
        "ref": "QueryMeta"
      }
    },
    "constants": {
      "success": true
    }
  },
  "DecisionQueryResponse": {
    "properties": {
      "success": {},
      "data": {
        "ref": "DecisionView"
      },
      "meta": {
        "ref": "QueryMeta"
      }
    },
    "constants": {
      "success": true
    }
  },
  "ActionListResponse": {
    "properties": {
      "success": {},
      "data": {
        "items": {
          "ref": "ActionView"
        }
      },
      "meta": {
        "ref": "QueryMeta"
      }
    },
    "constants": {
      "success": true
    }
  },
  "DecisionInboxResponse": {
    "properties": {
      "success": {},
      "data": {
        "items": {
          "ref": "DecisionView"
        }
      },
      "meta": {
        "ref": "QueryMeta"
      }
    },
    "constants": {
      "success": true
    }
  },
  "ActionAcceptedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "ref": "ActionRef"
          },
          "commandId": {
            "ref": "UUID"
          },
          "trackingRef": {
            "ref": "ActionRef"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "LearningCaseCreatedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-case"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "learningCase": {
            "ref": "LearningCaseRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "LearningCandidateCreatedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-candidate"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "learningCandidate": {
            "ref": "LearningCandidateRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "EvaluationRunCreatedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.evaluation-run"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "evaluationRun": {
            "ref": "EvaluationRunRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "CorrectionProposedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.correction"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "correction": {
            "ref": "CorrectionRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "CorrectionAppliedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.correction"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "application": {
            "ref": "CorrectionApplicationRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "ExceptionResolvedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "resolution": {
            "ref": "ExceptionResolutionRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "ExceptionResolutionEffectResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception-resolution-effect"
            }
          },
          "commandId": {
            "ref": "UUID"
          },
          "effect": {
            "ref": "ExceptionResolutionEffectRecord"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "DecisionSubmittedResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "ref": "DecisionRef"
          },
          "commandId": {
            "ref": "UUID"
          },
          "status": {
            "ref": "DecisionResponse"
          },
          "effectTrackingRefs": {
            "items": {
              "ref": "DecisionEffectRef"
            },
            "set": true
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "DecisionWithdrawnResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "ref": "DecisionRef"
          },
          "commandId": {
            "ref": "UUID"
          },
          "status": {}
        },
        "constants": {
          "status": "Withdrawn"
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "EventChangeSummary": {
    "properties": {
      "changedFields": {
        "items": {},
        "set": true
      },
      "factRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "JobEnvelope": {
    "properties": {
      "jobType": {},
      "targetRef": {
        "branches": [
          {
            "ref": "ActionRef"
          },
          {
            "ref": "OperationRef"
          },
          {
            "ref": "DecisionRef"
          },
          {
            "ref": "PackInspectionJobRef"
          }
        ]
      },
      "commandRef": {
        "ref": "CommandRef"
      },
      "dedupeKey": {
        "ref": "IdempotencyKey"
      },
      "notBefore": {
        "ref": "Time"
      },
      "deadline": {
        "ref": "Time"
      },
      "authorityRef": {
        "ref": "AuthorityRef"
      },
      "causeRef": {
        "ref": "EntityRef"
      }
    }
  },
  "InlineArtifactStoredResponse": {
    "properties": {
      "success": {},
      "data": {
        "properties": {
          "objectRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {}
            },
            "constants": {
              "type": "abh.artifact",
              "version": 2
            }
          },
          "commandId": {
            "ref": "UUID"
          }
        }
      }
    },
    "constants": {
      "success": true
    }
  },
  "PackInspectionJobRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-job"
    }
  },
  "RequestContextRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.request-context"
    }
  },
  "AuthorizedContextRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.authorized-context"
    }
  },
  "CredentialRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.credential"
    }
  },
  "JobRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.job"
    }
  },
  "WaitRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.durable-wait"
    }
  },
  "StoredObjectRef": {
    "properties": {
      "type": {},
      "id": {
        "ref": "UUID"
      },
      "version": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.stored-object"
    }
  },
  "PortCallContext": {
    "properties": {
      "callId": {
        "ref": "UUID"
      },
      "requestContextRef": {
        "ref": "RequestContextRef"
      },
      "target": {
        "ref": "Target"
      },
      "deadline": {
        "ref": "Time"
      }
    }
  },
  "IdentityVerifyRequest": {
    "properties": {
      "callId": {
        "ref": "UUID"
      },
      "credentialRef": {
        "ref": "CredentialRef"
      },
      "issuer": {},
      "audience": {},
      "deadline": {
        "ref": "Time"
      }
    }
  },
  "VerifiedIdentity": {
    "properties": {
      "issuer": {},
      "subject": {},
      "audience": {},
      "identityKind": {},
      "authnStrength": {
        "ref": "AuthenticationStrength"
      },
      "credentialEpoch": {},
      "verifiedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "evidenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.identity-evidence"
        }
      }
    }
  },
  "EnqueueJobRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "job": {
        "ref": "JobEnvelope"
      }
    }
  },
  "EnqueuedJob": {
    "properties": {
      "jobRef": {
        "ref": "JobRef"
      }
    }
  },
  "ScheduleWakeupRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "ownerRef": {
        "ref": "EntityRef"
      },
      "waitKey": {
        "ref": "IdempotencyKey"
      },
      "dueAt": {
        "ref": "Time"
      },
      "causeRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ScheduledWakeup": {
    "properties": {
      "waitRef": {
        "ref": "WaitRef"
      }
    }
  },
  "CancelWakeupRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "waitRef": {
        "ref": "WaitRef"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "CancelledWakeup": {
    "properties": {
      "waitRef": {
        "ref": "WaitRef"
      },
      "disposition": {},
      "receiptRef": {
        "ref": "EntityRef"
      }
    }
  },
  "SignalWaitRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "ownerRef": {
        "ref": "EntityRef"
      },
      "committedEventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      },
      "waitKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "SignalledWait": {
    "properties": {
      "waitRef": {
        "ref": "WaitRef"
      },
      "wakeupRef": {
        "ref": "EntityRef"
      }
    }
  },
  "InspectDeliveryRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "subjectRef": {
        "branches": [
          {
            "ref": "JobRef"
          },
          {
            "ref": "WaitRef"
          }
        ]
      }
    }
  },
  "DeliveryInspection": {
    "properties": {
      "subjectRef": {
        "branches": [
          {
            "ref": "JobRef"
          },
          {
            "ref": "WaitRef"
          }
        ]
      },
      "queueAgeMs": {},
      "deliveryCount": {},
      "lastErrorCategory": {},
      "ownerResultRef": {
        "ref": "EntityRef"
      }
    }
  },
  "DrainQueueRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "queueClasses": {
        "items": {},
        "set": true
      }
    }
  },
  "DrainReport": {
    "properties": {
      "drained": {},
      "remainingRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "completedAt": {
        "ref": "Time"
      }
    }
  },
  "ObjectDescriptor": {
    "properties": {
      "objectRef": {
        "ref": "StoredObjectRef"
      },
      "digest": {
        "ref": "Digest"
      },
      "sizeBytes": {},
      "mediaType": {}
    }
  },
  "PutObjectRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "authorizedContextRef": {
        "ref": "AuthorizedContextRef"
      },
      "stagedArtifactRef": {
        "ref": "ArtifactRef"
      },
      "digest": {
        "ref": "Digest"
      },
      "sizeBytes": {},
      "mediaType": {},
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ReadObjectRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "authorizedContextRef": {
        "ref": "AuthorizedContextRef"
      },
      "objectRef": {
        "ref": "StoredObjectRef"
      },
      "range": {
        "properties": {
          "start": {},
          "endInclusive": {}
        }
      }
    }
  },
  "ReadObjectDescriptor": {
    "properties": {
      "object": {
        "ref": "ObjectDescriptor"
      },
      "range": {
        "properties": {
          "start": {},
          "endInclusive": {}
        }
      }
    }
  },
  "StatObjectRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "authorizedContextRef": {
        "ref": "AuthorizedContextRef"
      },
      "objectRef": {
        "ref": "StoredObjectRef"
      }
    }
  },
  "DeleteObjectRequest": {
    "properties": {
      "context": {
        "ref": "PortCallContext"
      },
      "authorizedContextRef": {
        "ref": "AuthorizedContextRef"
      },
      "objectRef": {
        "ref": "StoredObjectRef"
      },
      "deletionProofRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.deletion-proof"
        }
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "DeletedObject": {
    "properties": {
      "objectRef": {
        "ref": "StoredObjectRef"
      },
      "receiptRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ObjectTypeRegistration": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "scopeKind": {},
      "description": {}
    }
  },
  "PurposeRegistration": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "description": {}
    }
  },
  "ActionTypeRegistration": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "targetTypes": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "purposeNames": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "description": {}
    }
  },
  "CatalogExtension": {
    "properties": {
      "namespace": {},
      "version": {
        "ref": "ExactVersion"
      },
      "objectTypes": {
        "items": {
          "ref": "ObjectTypeRegistration"
        },
        "set": true
      },
      "actions": {
        "items": {
          "ref": "ActionTypeRegistration"
        },
        "set": true
      },
      "purposes": {
        "items": {
          "ref": "PurposeRegistration"
        },
        "set": true
      }
    }
  },
  "PackPath": {},
  "PackFileEntry": {
    "properties": {
      "ref": {
        "ref": "PackPath"
      },
      "digest": {
        "ref": "Digest"
      },
      "mediaType": {},
      "sizeBytes": {}
    }
  },
  "PackCapabilityReference": {
    "properties": {
      "kind": {
        "ref": "RegisteredName"
      },
      "id": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "ExactVersion"
      }
    }
  },
  "PackCapabilityRequirement": {
    "properties": {
      "kind": {
        "ref": "RegisteredName"
      },
      "id": {
        "ref": "RegisteredName"
      },
      "versionRange": {}
    }
  },
  "PackResources": {
    "branches": [
      {
        "properties": {
          "enforcement": {}
        },
        "constants": {
          "enforcement": "None"
        }
      },
      {
        "properties": {
          "enforcement": {},
          "profileRef": {
            "ref": "EntityRef"
          }
        },
        "constants": {
          "enforcement": "HostProfile"
        }
      },
      {
        "properties": {
          "enforcement": {},
          "cpuMillis": {},
          "memoryBytes": {},
          "processes": {},
          "temporaryDiskBytes": {},
          "outputBytes": {},
          "wallTimeMs": {}
        },
        "constants": {
          "enforcement": "IsolatedLimits"
        }
      }
    ]
  },
  "PackManifest": {
    "properties": {
      "apiVersion": {},
      "kind": {},
      "metadata": {
        "properties": {
          "id": {},
          "version": {
            "ref": "ExactVersion"
          },
          "license": {}
        }
      },
      "compatibility": {
        "properties": {
          "abh": {}
        }
      },
      "trust": {
        "properties": {
          "mode": {}
        }
      },
      "capabilities": {
        "properties": {
          "provides": {
            "items": {
              "ref": "PackCapabilityReference"
            }
          },
          "requires": {
            "items": {
              "ref": "PackCapabilityRequirement"
            }
          }
        }
      },
      "permissions": {
        "properties": {
          "dataClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "purposes": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "commands": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "toolCapabilities": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "networkEgress": {
            "items": {}
          },
          "secretClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          }
        }
      },
      "resources": {
        "ref": "PackResources"
      },
      "artifacts": {
        "items": {
          "ref": "PackFileEntry"
        }
      },
      "migrations": {
        "items": {
          "ref": "PackFileEntry"
        }
      },
      "conformance": {
        "properties": {
          "suiteVersion": {
            "ref": "ExactVersion"
          }
        }
      },
      "integrity": {
        "properties": {
          "manifestDigest": {
            "ref": "Digest"
          },
          "artifactSetDigest": {
            "ref": "Digest"
          },
          "packageDigest": {
            "ref": "Digest"
          },
          "signatureFormat": {},
          "signatureRef": {
            "ref": "PackPath"
          },
          "provenanceRef": {
            "ref": "PackPath"
          },
          "conformanceRef": {
            "ref": "PackPath"
          }
        },
        "constants": {
          "signatureFormat": "application/vnd.dev.sigstore.bundle.v0.3+json"
        }
      }
    },
    "constants": {
      "apiVersion": "abh.open/v1"
    }
  },
  "ConformanceCaseResult": {
    "properties": {
      "caseId": {
        "ref": "RegisteredName"
      },
      "status": {},
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "reason": {}
    }
  },
  "ConformanceCapabilityClaim": {
    "properties": {
      "kind": {
        "ref": "RegisteredName"
      },
      "id": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "ExactVersion"
      },
      "claimed": {}
    }
  },
  "ConformanceEnvironment": {
    "properties": {
      "profile": {},
      "environmentDigest": {
        "ref": "Digest"
      },
      "fixtureSetDigest": {
        "ref": "Digest"
      },
      "seed": {}
    }
  },
  "ConformanceReport": {
    "properties": {
      "subjectDigest": {
        "ref": "Digest"
      },
      "suiteVersion": {
        "ref": "ExactVersion"
      },
      "status": {},
      "caseResults": {
        "items": {
          "ref": "ConformanceCaseResult"
        }
      },
      "claimedCapabilities": {
        "items": {
          "ref": "ConformanceCapabilityClaim"
        }
      },
      "knownDeviations": {
        "items": {
          "properties": {
            "caseId": {
              "ref": "RegisteredName"
            },
            "reason": {}
          }
        }
      },
      "environment": {
        "ref": "ConformanceEnvironment"
      },
      "startedAt": {
        "ref": "Time"
      },
      "finishedAt": {
        "ref": "Time"
      },
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "reportDigest": {
        "ref": "Digest"
      },
      "signatureRef": {
        "ref": "PackPath"
      }
    }
  },
  "PackValidationReport": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "subjectDigest": {
        "ref": "Digest"
      },
      "manifestDigest": {
        "ref": "Digest"
      },
      "artifactSetDigest": {
        "ref": "Digest"
      },
      "deploymentPolicyDigest": {
        "ref": "Digest"
      },
      "signatureBundleDigest": {
        "ref": "Digest"
      },
      "provenanceBundleDigest": {
        "ref": "Digest"
      },
      "conformanceBundleDigest": {
        "ref": "Digest"
      },
      "conformanceReportDigest": {
        "ref": "Digest"
      },
      "validatedAt": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "profile": {},
      "reportDigest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "profile": "LocalOfflinePublicKey"
    }
  },
  "PackDeploymentPolicy": {
    "properties": {
      "abhVersion": {
        "ref": "ExactVersion"
      },
      "packId": {
        "ref": "RegisteredName"
      },
      "allowedModes": {
        "items": {}
      },
      "allowedLicenses": {
        "items": {}
      },
      "permissions": {
        "properties": {
          "dataClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "purposes": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "commands": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "toolCapabilities": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "networkEgress": {
            "items": {}
          },
          "secretClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          }
        }
      },
      "hostProfileRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "sharedNamespaces": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "isolated": {
        "properties": {
          "available": {},
          "limits": {
            "properties": {
              "cpuMillis": {},
              "memoryBytes": {},
              "processes": {},
              "temporaryDiskBytes": {},
              "outputBytes": {},
              "wallTimeMs": {}
            }
          }
        }
      }
    }
  },
  "PackSignerPolicy": {
    "properties": {
      "executable": {},
      "mode": {},
      "publicKeyPem": {},
      "packId": {
        "ref": "RegisteredName"
      }
    },
    "constants": {
      "mode": "OfflinePublicKey"
    }
  },
  "PackProvenancePolicy": {
    "properties": {
      "executable": {},
      "mode": {},
      "publicKeyPem": {},
      "packId": {
        "ref": "RegisteredName"
      },
      "subjectName": {},
      "builderId": {},
      "buildType": {},
      "source": {
        "properties": {
          "uri": {},
          "digest": {}
        }
      }
    },
    "constants": {
      "mode": "OfflinePublicKey"
    }
  },
  "PackConformancePolicy": {
    "properties": {
      "executable": {},
      "mode": {},
      "publicKeyPem": {},
      "packId": {
        "ref": "RegisteredName"
      },
      "subjectName": {},
      "suiteVersion": {
        "ref": "ExactVersion"
      },
      "environment": {
        "ref": "ConformanceEnvironment"
      },
      "cases": {
        "items": {
          "properties": {
            "caseId": {
              "ref": "RegisteredName"
            },
            "status": {}
          }
        }
      },
      "claimedCapabilities": {
        "items": {
          "ref": "ConformanceCapabilityClaim"
        }
      },
      "maxAgeMs": {}
    },
    "constants": {
      "mode": "OfflinePublicKey"
    }
  },
  "PackGovernanceSnapshot": {
    "properties": {
      "policyRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.pack-trust-policy"
        }
      },
      "policy": {
        "ref": "PackDeploymentPolicy"
      },
      "trust": {
        "properties": {
          "signer": {
            "ref": "PackSignerPolicy"
          },
          "provenance": {
            "ref": "PackProvenancePolicy"
          },
          "conformance": {
            "ref": "PackConformancePolicy"
          }
        }
      },
      "revokedPackIds": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "revokedDigests": {
        "items": {
          "ref": "Digest"
        }
      },
      "reservedVersions": {
        "items": {
          "properties": {
            "packId": {
              "ref": "RegisteredName"
            },
            "version": {
              "ref": "ExactVersion"
            },
            "packageDigest": {
              "ref": "Digest"
            }
          }
        }
      }
    }
  },
  "SignedTrustPolicyDocument": {
    "properties": {
      "organizationId": {
        "ref": "UUID"
      },
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "snapshot": {
        "ref": "PackGovernanceSnapshot"
      }
    }
  },
  "PackDataDefinition": {
    "properties": {
      "kind": {},
      "id": {
        "ref": "RegisteredName"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "PackDataInventory": {
    "properties": {
      "complete": {},
      "entries": {
        "items": {
          "ref": "PackDataDefinition"
        }
      }
    }
  },
  "PackDataChange": {
    "properties": {
      "kind": {},
      "id": {
        "ref": "RegisteredName"
      },
      "change": {},
      "beforeDigest": {
        "ref": "Digest"
      },
      "afterDigest": {
        "ref": "Digest"
      }
    }
  },
  "PackDataImpact": {
    "properties": {
      "subjectDigest": {
        "ref": "Digest"
      },
      "baselineDigest": {
        "ref": "Digest"
      },
      "targetDigest": {
        "ref": "Digest"
      },
      "status": {},
      "changes": {
        "items": {
          "ref": "PackDataChange"
        }
      },
      "migrationRefs": {
        "items": {
          "ref": "PackPath"
        }
      },
      "reasons": {
        "items": {}
      }
    }
  },
  "PackSchemaOwnership": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "schemaName": {},
      "databaseRole": {}
    }
  },
  "PackMigrationStep": {
    "properties": {
      "ref": {
        "ref": "PackPath"
      },
      "digest": {
        "ref": "Digest"
      },
      "schemas": {
        "items": {}
      },
      "databaseRole": {},
      "phase": {},
      "transactional": {},
      "operations": {
        "items": {}
      },
      "reviewRef": {
        "ref": "EntityRef"
      },
      "dryRunRef": {
        "ref": "EntityRef"
      },
      "safetyPointRef": {
        "ref": "EntityRef"
      },
      "recoveryPlanRef": {
        "ref": "EntityRef"
      },
      "compatibilityRef": {
        "ref": "EntityRef"
      },
      "retirementRef": {
        "ref": "EntityRef"
      }
    }
  },
  "PackMigrationEvidence": {
    "properties": {
      "organizationId": {
        "ref": "UUID"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "stepDigest": {
        "ref": "Digest"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {},
      "kind": {},
      "status": {},
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "supportingRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "PackMigrationAttemptRecord": {
    "properties": {
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.pack-migration-attempt",
          "version": 1
        }
      },
      "organizationId": {
        "ref": "UUID"
      },
      "packId": {},
      "packVersion": {
        "ref": "ExactVersion"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "step": {
        "ref": "PackMigrationStep"
      },
      "stepDigest": {
        "ref": "Digest"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {},
      "impactRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "claimedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationObservationRecord": {
    "properties": {
      "observationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.pack-migration-observation",
          "version": 1
        }
      },
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.pack-migration-attempt",
          "version": 1
        }
      },
      "kind": {},
      "evidenceRef": {
        "ref": "EntityRef"
      },
      "observedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationExecutionResult": {
    "properties": {
      "kind": {},
      "sqlStarted": {},
      "connectionClosed": {}
    }
  },
  "PackMigrationExecutionRecord": {
    "properties": {
      "attempt": {
        "ref": "PackMigrationAttemptRecord"
      },
      "result": {
        "ref": "PackMigrationExecutionResult"
      },
      "observedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationStructureBinding": {
    "properties": {
      "organizationId": {
        "ref": "UUID"
      },
      "packId": {},
      "packVersion": {
        "ref": "ExactVersion"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "planDigest": {
        "ref": "Digest"
      },
      "expectedDigest": {
        "ref": "Digest"
      }
    }
  },
  "PackMigrationStructureReport": {
    "properties": {
      "binding": {
        "ref": "PackMigrationStructureBinding"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {},
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationDataBinding": {
    "properties": {
      "kind": {},
      "organizationId": {
        "ref": "UUID"
      },
      "packId": {},
      "packVersion": {
        "ref": "ExactVersion"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "planDigest": {
        "ref": "Digest"
      },
      "expectedDigest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "kind": "DataInvariants"
    }
  },
  "PackMigrationDataReport": {
    "properties": {
      "binding": {
        "ref": "PackMigrationDataBinding"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {},
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationDataObservation": {
    "properties": {
      "result": {
        "ref": "PackMigrationDataObservationResult"
      },
      "observedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationStructureObservation": {
    "properties": {
      "result": {
        "ref": "PackMigrationStructureObservationResult"
      },
      "observedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationStateObservation": {
    "properties": {
      "result": {
        "properties": {
          "matched": {},
          "structure": {
            "ref": "PackMigrationStructureObservationResult"
          },
          "data": {
            "ref": "PackMigrationDataObservationResult"
          }
        }
      },
      "observedAt": {
        "ref": "Time"
      }
    }
  },
  "PackMigrationDataObservationResult": {
    "properties": {
      "matched": {},
      "expectedDigest": {
        "ref": "Digest"
      },
      "results": {
        "items": {
          "properties": {
            "schema": {},
            "table": {},
            "rowCount": {},
            "nulls": {
              "items": {
                "properties": {
                  "column": {},
                  "count": {}
                }
              }
            },
            "duplicates": {
              "items": {
                "properties": {
                  "columns": {
                    "items": {}
                  },
                  "groups": {}
                }
              }
            },
            "matched": {}
          }
        }
      },
      "binding": {
        "ref": "PackMigrationDataBinding"
      },
      "reportRef": {
        "ref": "EntityRef"
      },
      "bundleRef": {
        "ref": "EntityRef"
      },
      "signature": {
        "properties": {
          "report": {
            "ref": "PackMigrationDataReport"
          },
          "keyDigest": {
            "ref": "Digest"
          },
          "bundleDigest": {
            "ref": "Digest"
          },
          "verifiedAt": {
            "ref": "Time"
          }
        }
      }
    }
  },
  "PackMigrationStructureObservationResult": {
    "properties": {
      "matched": {},
      "requiresAdditionalVerification": {
        "items": {
          "properties": {
            "schema": {},
            "name": {},
            "kind": {}
          }
        }
      },
      "expectedDigest": {
        "ref": "Digest"
      },
      "inventory": {
        "properties": {
          "matched": {},
          "expectedDigest": {
            "ref": "Digest"
          },
          "results": {
            "items": {
              "properties": {
                "schema": {},
                "actual": {
                  "items": {
                    "properties": {
                      "name": {},
                      "kind": {}
                    }
                  }
                },
                "missing": {
                  "items": {
                    "properties": {
                      "name": {},
                      "kind": {}
                    }
                  }
                },
                "unexpected": {
                  "items": {
                    "properties": {
                      "name": {},
                      "kind": {}
                    }
                  }
                },
                "changed": {
                  "items": {
                    "properties": {
                      "name": {},
                      "expectedKind": {},
                      "actualKind": {}
                    }
                  }
                }
              }
            }
          }
        }
      },
      "tables": {
        "branches": [
          {
            "properties": {
              "matched": {},
              "expectedDigest": {
                "ref": "Digest"
              },
              "results": {
                "items": {
                  "properties": {
                    "schema": {},
                    "name": {},
                    "actual": {
                      "branches": [
                        {
                          "properties": {
                            "schema": {},
                            "name": {},
                            "owner": {},
                            "kind": {},
                            "rls": {},
                            "forceRls": {},
                            "partition": {
                              "properties": {
                                "key": {
                                  "branches": [
                                    {},
                                    {}
                                  ]
                                },
                                "bound": {
                                  "branches": [
                                    {},
                                    {}
                                  ]
                                },
                                "parents": {
                                  "items": {
                                    "properties": {
                                      "schema": {},
                                      "name": {},
                                      "detachPending": {}
                                    }
                                  }
                                }
                              }
                            },
                            "columns": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "typeSchema": {},
                                  "typeName": {},
                                  "typeModifier": {},
                                  "notNull": {},
                                  "identity": {},
                                  "generated": {},
                                  "defaultExpression": {
                                    "branches": [
                                      {},
                                      {}
                                    ]
                                  }
                                }
                              }
                            },
                            "indexes": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "definition": {},
                                  "valid": {},
                                  "ready": {},
                                  "live": {},
                                  "unique": {},
                                  "primary": {},
                                  "replicaIdentity": {}
                                }
                              }
                            },
                            "policies": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "command": {},
                                  "permissive": {},
                                  "roles": {
                                    "items": {}
                                  },
                                  "using": {
                                    "branches": [
                                      {},
                                      {}
                                    ]
                                  },
                                  "check": {
                                    "branches": [
                                      {},
                                      {}
                                    ]
                                  }
                                }
                              }
                            },
                            "triggers": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "definition": {},
                                  "enabled": {},
                                  "functionDigest": {
                                    "ref": "Digest"
                                  }
                                }
                              }
                            },
                            "constraints": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "type": {},
                                  "definition": {},
                                  "validated": {},
                                  "deferrable": {},
                                  "initiallyDeferred": {}
                                }
                              }
                            }
                          }
                        },
                        {}
                      ]
                    },
                    "differences": {
                      "items": {}
                    }
                  }
                }
              }
            }
          },
          {}
        ]
      },
      "sequences": {
        "branches": [
          {
            "properties": {
              "matched": {},
              "expectedDigest": {
                "ref": "Digest"
              },
              "results": {
                "items": {
                  "properties": {
                    "schema": {},
                    "name": {},
                    "actual": {
                      "branches": [
                        {
                          "properties": {
                            "schema": {},
                            "name": {},
                            "owner": {},
                            "typeSchema": {},
                            "typeName": {},
                            "start": {},
                            "increment": {},
                            "minimum": {},
                            "maximum": {},
                            "cache": {},
                            "cycle": {},
                            "ownedBy": {
                              "branches": [
                                {
                                  "properties": {
                                    "schema": {},
                                    "table": {},
                                    "column": {},
                                    "dependency": {}
                                  }
                                },
                                {}
                              ]
                            }
                          }
                        },
                        {}
                      ]
                    },
                    "differences": {
                      "items": {}
                    }
                  }
                }
              }
            }
          },
          {}
        ]
      },
      "views": {
        "branches": [
          {
            "properties": {
              "matched": {},
              "expectedDigest": {
                "ref": "Digest"
              },
              "results": {
                "items": {
                  "properties": {
                    "schema": {},
                    "name": {},
                    "actual": {
                      "branches": [
                        {
                          "properties": {
                            "schema": {},
                            "name": {},
                            "owner": {},
                            "kind": {},
                            "definition": {},
                            "options": {
                              "items": {}
                            },
                            "populated": {},
                            "indexes": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "definition": {},
                                  "valid": {},
                                  "ready": {},
                                  "live": {},
                                  "unique": {},
                                  "primary": {},
                                  "replicaIdentity": {}
                                }
                              }
                            },
                            "triggers": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "definition": {},
                                  "enabled": {},
                                  "functionDigest": {
                                    "ref": "Digest"
                                  }
                                }
                              }
                            },
                            "rules": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "definition": {},
                                  "enabled": {}
                                }
                              }
                            },
                            "columns": {
                              "items": {
                                "properties": {
                                  "name": {},
                                  "typeSchema": {},
                                  "typeName": {},
                                  "typeModifier": {}
                                }
                              }
                            }
                          }
                        },
                        {}
                      ]
                    },
                    "differences": {
                      "items": {}
                    }
                  }
                }
              }
            }
          },
          {}
        ]
      },
      "acl": {
        "branches": [
          {
            "properties": {
              "matched": {},
              "expectedDigest": {
                "ref": "Digest"
              },
              "results": {
                "items": {
                  "properties": {
                    "schema": {},
                    "name": {},
                    "kind": {},
                    "actual": {
                      "items": {
                        "properties": {
                          "column": {
                            "branches": [
                              {},
                              {}
                            ]
                          },
                          "grantor": {},
                          "grantee": {},
                          "privilege": {},
                          "grantable": {}
                        }
                      }
                    },
                    "missing": {
                      "items": {
                        "properties": {
                          "column": {
                            "branches": [
                              {},
                              {}
                            ]
                          },
                          "grantor": {},
                          "grantee": {},
                          "privilege": {},
                          "grantable": {}
                        }
                      }
                    },
                    "unexpected": {
                      "items": {
                        "properties": {
                          "column": {
                            "branches": [
                              {},
                              {}
                            ]
                          },
                          "grantor": {},
                          "grantee": {},
                          "privilege": {},
                          "grantable": {}
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {}
        ]
      },
      "binding": {
        "ref": "PackMigrationStructureBinding"
      },
      "reportRef": {
        "ref": "EntityRef"
      },
      "bundleRef": {
        "ref": "EntityRef"
      },
      "signature": {
        "properties": {
          "report": {
            "ref": "PackMigrationStructureReport"
          },
          "keyDigest": {
            "ref": "Digest"
          },
          "bundleDigest": {
            "ref": "Digest"
          },
          "verifiedAt": {
            "ref": "Time"
          }
        }
      }
    }
  },
  "OrganizationRecord": {
    "properties": {
      "organizationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "name": {},
      "homeRegion": {},
      "status": {
        "ref": "AccessRecordState"
      }
    }
  },
  "PrincipalRecord": {
    "properties": {
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "displayName": {},
      "identityKind": {},
      "status": {
        "ref": "AccessRecordState"
      },
      "credentialEpoch": {}
    }
  },
  "MembershipRecord": {
    "properties": {
      "membershipRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.membership"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "status": {
        "ref": "AccessRecordState"
      },
      "membershipEpoch": {
        "ref": "Version"
      }
    }
  },
  "GrantRecord": {
    "properties": {
      "grantRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.grant"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "actionTypes": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "purposeNames": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "validFrom": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "issuanceEvidenceRef": {
        "ref": "EntityRef"
      },
      "status": {
        "ref": "GrantState"
      }
    }
  },
  "LedgerRecord": {
    "properties": {
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "resourceType": {
        "ref": "RegisteredName"
      },
      "meteringMode": {},
      "unit": {
        "ref": "RegisteredName"
      },
      "currency": {},
      "periodRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.period"
        }
      },
      "limit": {
        "ref": "NonnegativeDecimal"
      },
      "confirmedUsage": {
        "ref": "NonnegativeDecimal"
      },
      "heldReservation": {
        "ref": "NonnegativeDecimal"
      },
      "openCommitment": {
        "ref": "NonnegativeDecimal"
      },
      "status": {
        "ref": "LedgerState"
      }
    }
  },
  "LedgerUnitRecord": {
    "properties": {
      "unitRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.unit"
            }
          }
        ]
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "name": {
        "ref": "RegisteredName"
      },
      "kind": {},
      "currency": {},
      "precision": {},
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "LedgerPeriodRecord": {
    "properties": {
      "periodRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.period"
            }
          }
        ]
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "startsAt": {
        "ref": "Time"
      },
      "endsAt": {
        "ref": "Time"
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "RegisterLedgerUnitPayload": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "kind": {},
      "currency": {},
      "precision": {},
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    },
    "branches": [
      {},
      {}
    ]
  },
  "RegisterLedgerPeriodPayload": {
    "properties": {
      "startsAt": {
        "ref": "Time"
      },
      "endsAt": {
        "ref": "Time"
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "LedgerCorrectionRecord": {
    "properties": {
      "correctionRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.ledger-correction"
            }
          }
        ]
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ledgerRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.ledger"
            }
          }
        ]
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "kind": {},
      "usageDelta": {
        "ref": "Decimal"
      },
      "conversionRef": {
        "ref": "EntityRef"
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "ApplyLedgerCorrectionPayload": {
    "properties": {
      "ledgerRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.ledger"
            }
          }
        ]
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "kind": {},
      "usageDelta": {
        "ref": "Decimal"
      },
      "conversionRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    },
    "branches": [
      {}
    ]
  },
  "ReservationRecord": {
    "properties": {
      "reservationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reservation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "requestRef": {
        "ref": "EntityRef"
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "amount": {
        "ref": "NonnegativeDecimal"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "bindingRef": {
        "ref": "EntityRef"
      },
      "status": {
        "ref": "ReservationState"
      }
    }
  },
  "AuditRecord": {
    "properties": {
      "auditRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.audit"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actingOrganizationId": {
        "ref": "UUID"
      },
      "actor": {
        "ref": "Actor"
      },
      "action": {
        "ref": "RegisteredName"
      },
      "targetRef": {
        "ref": "EntityRef"
      },
      "outcome": {
        "ref": "RegisteredName"
      },
      "relatedRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "digest": {
        "ref": "Digest"
      },
      "recordedAt": {
        "ref": "Time"
      },
      "correlationId": {
        "ref": "UUID"
      }
    }
  },
  "CommandReceipt": {
    "properties": {
      "commandRef": {
        "ref": "CommandRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actorPrincipalId": {
        "ref": "UUID"
      },
      "commandType": {
        "ref": "RegisteredName"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "resultRef": {
        "ref": "EntityRef"
      },
      "committedAt": {
        "ref": "Time"
      }
    }
  },
  "ArtifactRecord": {
    "properties": {
      "artifactRef": {
        "ref": "ArtifactRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ownerRef": {
        "ref": "EntityRef"
      },
      "mediaType": {},
      "sizeBytes": {},
      "contentDigest": {
        "ref": "Digest"
      },
      "status": {
        "ref": "ArtifactState"
      },
      "dataClass": {
        "ref": "RegisteredName"
      },
      "purposeNames": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "sourceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      }
    }
  },
  "FenceRecord": {
    "properties": {
      "fenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.fence"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "epoch": {
        "ref": "Version"
      },
      "stopFlag": {}
    }
  },
  "LedgerEntryRecord": {
    "properties": {
      "entryRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger-entry"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "entryKey": {
        "ref": "IdempotencyKey"
      },
      "kind": {},
      "limitDelta": {
        "ref": "Decimal"
      },
      "usageDelta": {
        "ref": "Decimal"
      },
      "heldDelta": {
        "ref": "Decimal"
      },
      "commitmentDelta": {
        "ref": "Decimal"
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "effectiveAt": {
        "ref": "Time"
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "LedgerBalanceDiagnostic": {
    "properties": {
      "limit": {
        "ref": "NonnegativeDecimal"
      },
      "confirmedUsage": {
        "ref": "NonnegativeDecimal"
      },
      "heldReservation": {
        "ref": "NonnegativeDecimal"
      },
      "openCommitment": {
        "ref": "NonnegativeDecimal"
      }
    }
  },
  "LedgerDiagnostic": {
    "properties": {
      "ledgerRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.ledger"
            }
          }
        ]
      },
      "resourceType": {
        "ref": "RegisteredName"
      },
      "meteringMode": {},
      "unit": {
        "ref": "RegisteredName"
      },
      "status": {
        "ref": "LedgerState"
      },
      "periodRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.period"
            }
          }
        ]
      },
      "entryCount": {},
      "lastEntryRef": {
        "branches": [
          {},
          {
            "branches": [
              {
                "ref": "EntityRef"
              },
              {
                "properties": {
                  "type": {}
                },
                "constants": {
                  "type": "abh.ledger-entry"
                }
              }
            ]
          }
        ]
      },
      "current": {
        "ref": "LedgerBalanceDiagnostic"
      },
      "recomputed": {
        "ref": "LedgerBalanceDiagnostic"
      },
      "heldReservationCount": {},
      "expiredHeldCount": {},
      "openCommitmentCount": {},
      "openCommitmentRemaining": {
        "ref": "NonnegativeDecimal"
      },
      "stopReasons": {
        "items": {}
      }
    }
  },
  "CliDoctorLedgerResult": {
    "properties": {
      "checkId": {},
      "organizationId": {
        "ref": "UUID"
      },
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "ledgers": {
        "items": {
          "ref": "LedgerDiagnostic"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "ledger.balance-audit"
    },
    "branches": [
      {},
      {},
      {}
    ]
  },
  "ConfigureLedgerPayload": {
    "properties": {
      "scopeRef": {
        "ref": "EntityRef"
      },
      "resourceType": {
        "ref": "RegisteredName"
      },
      "meteringMode": {},
      "unit": {
        "ref": "RegisteredName"
      },
      "currency": {},
      "periodRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.period"
        }
      },
      "limit": {
        "ref": "NonnegativeDecimal"
      },
      "approvalRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "ReserveAllPayload": {
    "properties": {
      "requestRef": {
        "ref": "EntityRef"
      },
      "bindingRef": {
        "ref": "EntityRef"
      },
      "authorityRef": {
        "ref": "AuthorityRef"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "requirements": {
        "items": {
          "properties": {
            "ledgerRef": {
              "properties": {
                "type": {},
                "id": {
                  "ref": "UUID"
                },
                "version": {
                  "ref": "Version"
                }
              },
              "constants": {
                "type": "abh.ledger"
              }
            },
            "amount": {
              "ref": "NonnegativeDecimal"
            }
          }
        }
      }
    }
  },
  "ConsumeReservationPayload": {
    "properties": {
      "actualUsage": {
        "ref": "NonnegativeDecimal"
      },
      "receiptRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ReleaseReservationPayload": {
    "properties": {
      "noEffectOrCompletionEvidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "IdentityLocationRecord": {
    "properties": {
      "identityDigest": {
        "ref": "Digest"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      }
    }
  },
  "RevokeGrantPayload": {
    "properties": {
      "reason": {
        "ref": "Reason"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "WorkspaceRecord": {
    "properties": {
      "workspaceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.workspace"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "participantOrganizationRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.organization"
          }
        },
        "set": true
      },
      "scopeContractRef": {
        "ref": "EntityRef"
      },
      "consentEvidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "status": {
        "ref": "AccessRecordState"
      },
      "scopeEpoch": {
        "ref": "Version"
      },
      "validUntil": {
        "ref": "Time"
      }
    }
  },
  "ReleaseRecord": {
    "properties": {
      "releaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "assets": {
        "items": {
          "properties": {
            "behaviorSlot": {
              "ref": "RegisteredName"
            },
            "capabilityExactRefs": {
              "items": {
                "ref": "CapabilityRef"
              },
              "set": true
            }
          }
        },
        "set": true
      },
      "gateRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "compatibilityRef": {
        "ref": "EntityRef"
      },
      "status": {
        "ref": "ReleaseState"
      }
    }
  },
  "StaticAssignmentRecord": {
    "properties": {
      "assignmentRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "releaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "scopeTier": {},
      "status": {
        "ref": "AssignmentState"
      },
      "selectable": {},
      "executionAllowed": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "stopReason": {
        "ref": "Reason"
      },
      "stopEvidenceRef": {
        "ref": "EntityRef"
      },
      "rollbackOfAssignmentRef": {
        "ref": "EntityRef"
      },
      "rollbackFromReleaseRef": {
        "ref": "EntityRef"
      }
    }
  },
  "StaticAssignmentListResult": {
    "properties": {
      "assignments": {
        "items": {
          "ref": "StaticAssignmentRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ConfigureStaticReleasePayload": {
    "properties": {
      "release": {
        "ref": "ReleaseRecord"
      },
      "assignment": {
        "ref": "StaticAssignmentRecord"
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "ResolveStaticPinsPayload": {
    "ref": "ResolveAndPinRequest"
  },
  "StopStaticAssignmentPayload": {
    "properties": {
      "evidenceRef": {
        "ref": "EntityRef"
      },
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "RollbackStaticAssignmentPayload": {
    "properties": {
      "previousReleaseRef": {
        "ref": "EntityRef"
      },
      "gateRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "compatibilityRef": {
        "ref": "EntityRef"
      },
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "StoreInlineArtifactPayload": {
    "properties": {
      "ownerRef": {
        "ref": "EntityRef"
      },
      "mediaType": {},
      "dataClass": {
        "ref": "RegisteredName"
      },
      "purposeNames": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "sourceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      },
      "content": {}
    }
  },
  "TombstoneArtifactPayload": {
    "properties": {
      "reason": {
        "ref": "Reason"
      },
      "evidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "CommitmentRecord": {
    "properties": {
      "commitmentRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "policyRef": {
        "ref": "EntityRef"
      },
      "upperBound": {
        "ref": "NonnegativeDecimal"
      },
      "remaining": {
        "ref": "NonnegativeDecimal"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "status": {
        "ref": "CommitmentState"
      }
    }
  },
  "SettlementRecord": {
    "properties": {
      "settlementRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.settlement"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "commitmentRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "usageAmount": {
        "ref": "NonnegativeDecimal"
      },
      "commitmentDelta": {
        "ref": "Decimal"
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "recordedAt": {
        "ref": "Time"
      },
      "overrunAmount": {
        "ref": "NonnegativeDecimal"
      }
    }
  },
  "OpenCommitmentPayload": {
    "properties": {
      "reservationRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.reservation"
          }
        },
        "set": true
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "policyRef": {
        "ref": "EntityRef"
      },
      "upperBound": {
        "ref": "NonnegativeDecimal"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "SettleCommitmentPayload": {
    "properties": {
      "sourceRef": {
        "ref": "EntityRef"
      },
      "actualUsage": {
        "ref": "NonnegativeDecimal"
      }
    }
  },
  "AdjustCommitmentPayload": {
    "properties": {
      "newUpperBound": {
        "ref": "NonnegativeDecimal"
      },
      "evidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "BeginCloseCommitmentPayload": {
    "properties": {
      "tailBound": {
        "ref": "NonnegativeDecimal"
      },
      "evidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "CloseCommitmentPayload": {
    "properties": {
      "evidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ResponsibilityAssignmentRecord": {
    "properties": {
      "responsibilityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "responsibilityType": {},
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "validFrom": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "templateRef": {
        "ref": "EntityRef"
      },
      "status": {
        "ref": "AccessRecordState"
      }
    }
  },
  "CorrectionRecord": {
    "properties": {
      "correctionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "subjectVersion": {
        "ref": "Version"
      },
      "beforeRef": {
        "ref": "EntityRef"
      },
      "proposedAfterRef": {
        "ref": "EntityRef"
      },
      "targetOwner": {},
      "reason": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "responsibilityRef": {
        "ref": "EntityRef"
      },
      "purpose": {
        "ref": "RegisteredName"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "proposedBy": {
        "ref": "Actor"
      },
      "proposedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "CorrectionApplicationRecord": {
    "properties": {
      "applicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.correction-application"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "correctionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "subjectVersionBefore": {
        "ref": "Version"
      },
      "targetOwner": {},
      "authorityRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "resultRef": {
        "ref": "EntityRef"
      },
      "resultVersion": {
        "ref": "Version"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "appliedBy": {
        "ref": "Actor"
      },
      "appliedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "ApplyCorrectionPayload": {
    "properties": {
      "subjectRef": {
        "ref": "EntityRef"
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "candidate": {
        "ref": "CorrectionCapabilityCandidate"
      }
    }
  },
  "CorrectionCapabilityCandidate": {
    "properties": {
      "caseRef": {
        "ref": "EntityRef"
      },
      "baseVersion": {
        "ref": "Version"
      },
      "assetKind": {
        "ref": "RegisteredName"
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "risk": {
        "ref": "RegisteredName"
      }
    }
  },
  "ProposeCorrectionPayload": {
    "properties": {
      "subjectRef": {
        "ref": "EntityRef"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "beforeRef": {
        "ref": "EntityRef"
      },
      "newArtifactRef": {
        "ref": "EntityRef"
      },
      "targetOwner": {},
      "reason": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "responsibilityRef": {
        "ref": "EntityRef"
      },
      "purpose": {
        "ref": "RegisteredName"
      }
    }
  },
  "ResponsibilitySeat": {
    "properties": {
      "seatId": {
        "ref": "NodeKey"
      },
      "responsibilityRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.responsibility-assignment"
          }
        },
        "set": true
      }
    }
  },
  "ResponsibilitySlot": {
    "properties": {
      "slotId": {
        "ref": "NodeKey"
      },
      "responsibilityType": {},
      "responsibleOrganizationId": {
        "ref": "UUID"
      },
      "selectionMode": {},
      "required": {},
      "seats": {
        "items": {
          "ref": "ResponsibilitySeat"
        },
        "set": true
      },
      "dependsOnSlotIds": {
        "items": {
          "ref": "NodeKey"
        },
        "set": true
      }
    }
  },
  "ResponsibilityRequestRecord": {
    "properties": {
      "requestRef": {
        "ref": "RequestRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "kind": {},
      "subjectRef": {
        "ref": "EntityRef"
      },
      "proposalDigest": {
        "ref": "Digest"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "requiredSlots": {
        "items": {
          "ref": "ResponsibilitySlot"
        },
        "set": true
      },
      "routeRevision": {
        "ref": "Version"
      },
      "decisionRefs": {
        "items": {
          "ref": "DecisionRef"
        },
        "set": true
      },
      "expiresAt": {
        "ref": "Time"
      },
      "status": {
        "ref": "ResponsibilityRequestState"
      },
      "escalationDepth": {}
    }
  },
  "DecisionRecord": {
    "properties": {
      "decisionRef": {
        "ref": "DecisionRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "package": {
        "ref": "DecisionPackage"
      },
      "seatId": {
        "ref": "NodeKey"
      },
      "candidateResponsibilityRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.responsibility-assignment"
          }
        },
        "set": true
      },
      "status": {
        "ref": "DecisionState"
      },
      "respondedBy": {
        "ref": "Actor"
      },
      "responsibilityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "decisionGrantRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.grant"
          }
        },
        "set": true
      },
      "submission": {
        "ref": "SubmitDecisionPayload"
      },
      "decidedAt": {
        "ref": "Time"
      }
    }
  },
  "RequestCompletionEvidence": {
    "properties": {
      "completionEvidenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.request-completion-evidence"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "routeRevision": {
        "ref": "Version"
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "proposalDigest": {
        "ref": "Digest"
      },
      "decisionRefs": {
        "items": {
          "ref": "DecisionRef"
        },
        "set": true
      },
      "conditionRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.condition"
          }
        },
        "set": true
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "OpenResponsibilityRequestPayload": {
    "properties": {
      "request": {
        "ref": "ResponsibilityRequestRecord"
      },
      "packages": {
        "items": {
          "ref": "DecisionPackage"
        }
      }
    }
  },
  "AssignResponsibilityPayload": {
    "ref": "ResponsibilityAssignmentRecord"
  },
  "IssueExecutionAuthorityPayload": {
    "properties": {
      "authority": {
        "ref": "ExecutionAuthority"
      },
      "serviceGrant": {
        "ref": "GrantRecord"
      }
    }
  },
  "OperationRecord": {
    "properties": {
      "operationRef": {
        "ref": "OperationRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "nodeKey": {
        "ref": "NodeKey"
      },
      "providerIdempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "position": {
        "ref": "OperationPosition"
      },
      "attemptCount": {},
      "reconciliationRef": {
        "ref": "EntityRef"
      }
    }
  },
  "OperationReceiptRecord": {
    "properties": {
      "receiptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation-receipt"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "operationRef": {
        "ref": "OperationRef"
      },
      "receiptKey": {
        "ref": "IdempotencyKey"
      },
      "rawArtifactRef": {
        "ref": "ArtifactRef"
      },
      "normalizedObservationRef": {
        "ref": "EntityRef"
      },
      "observedAt": {
        "ref": "Time"
      },
      "inputDigest": {
        "ref": "Digest"
      }
    }
  },
  "OperationReconciliationRecord": {
    "properties": {
      "reconciliationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "operationRef": {
        "ref": "OperationRef"
      },
      "observationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "comparisonRuleRef": {
        "ref": "EntityRef"
      },
      "verdict": {},
      "reason": {
        "ref": "Reason"
      },
      "recordedAt": {
        "ref": "Time"
      },
      "receiptRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "digest": {
        "ref": "Digest"
      },
      "confirmedExternal": {
        "properties": {
          "externalId": {},
          "sourceVersion": {}
        }
      },
      "permitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      }
    }
  },
  "ActionIntentRecord": {
    "properties": {
      "actionRef": {
        "ref": "ActionRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "proposal": {
        "ref": "ActionProposal"
      },
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "riskClass": {
        "ref": "RegisteredName"
      },
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "requiredBehaviorSlots": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "maxOperations": {},
      "expiresAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      },
      "safetyStop": {}
    }
  },
  "PolicyDecision": {
    "properties": {
      "allow": {},
      "obligationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "reasonCodes": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      }
    }
  },
  "PolicyEvaluationRecord": {
    "properties": {
      "evaluationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-evaluation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "targetRef": {
        "ref": "EntityRef"
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "policyVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "kind": {},
      "decision": {
        "ref": "PolicyDecision"
      },
      "evaluatedAt": {
        "ref": "Time"
      }
    }
  },
  "RevokeExecutionAuthorityPayload": {
    "properties": {
      "reason": {
        "ref": "Reason"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "LifecyclePurposeNames": {
    "items": {
      "ref": "RegisteredName"
    },
    "set": true
  },
  "PinActionPayload": {
    "properties": {
      "preparationAuthorityRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "CompiledPolicyManifest": {
    "properties": {
      "formatVersion": {},
      "wasmDigest": {
        "ref": "Digest"
      },
      "sourceDigest": {
        "ref": "Digest"
      },
      "compilerName": {},
      "compilerVersion": {
        "ref": "ExactVersion"
      },
      "compilerDigest": {
        "ref": "Digest"
      },
      "entrypoints": {
        "items": {},
        "set": true
      }
    },
    "constants": {
      "formatVersion": "0.1.0",
      "compilerName": "OPA"
    }
  },
  "PolicyVersionRecord": {
    "properties": {
      "policyVersionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-version"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "kind": {},
      "artifactRef": {
        "ref": "ArtifactRef"
      },
      "manifestDigest": {
        "ref": "Digest"
      },
      "wasmDigest": {
        "ref": "Digest"
      },
      "entrypoint": {},
      "inputSchemaName": {},
      "ownerRef": {
        "ref": "EntityRef"
      },
      "releaseEvidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "behaviorCapabilityRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "BehaviorPolicy"
            }
          }
        ]
      },
      "digest": {
        "ref": "Digest"
      }
    },
    "branches": [
      {}
    ]
  },
  "PolicyBindingRecord": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-binding"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "policyVersionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-version"
        }
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "inputSchemaName": {}
    }
  },
  "ConfigurePolicyPayload": {
    "properties": {
      "policy": {
        "ref": "PolicyVersionRecord"
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "ActivateMandatoryPolicyPayload": {
    "properties": {
      "policyVersionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-version"
        }
      },
      "expectedBindingVersion": {
        "ref": "Version"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "ActionPolicyInput": {
    "properties": {
      "schemaVersion": {},
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "checkedAt": {
        "ref": "Time"
      },
      "action": {
        "ref": "ActionRecord"
      },
      "intentDigest": {
        "ref": "Digest"
      },
      "planDigest": {
        "ref": "Digest"
      },
      "executionAuthority": {
        "ref": "ExecutionAuthority"
      },
      "grants": {
        "items": {
          "ref": "GrantRecord"
        },
        "set": true
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "fences": {
        "items": {
          "ref": "FenceRecord"
        },
        "set": true
      },
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "inputVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "ledgers": {
        "items": {
          "ref": "LedgerRecord"
        },
        "set": true
      },
      "dispatch": {
        "properties": {
          "operationRef": {
            "ref": "OperationRef"
          },
          "payloadDigest": {
            "ref": "Digest"
          },
          "dependencyRefs": {
            "items": {
              "ref": "EntityRef"
            },
            "set": true
          }
        }
      }
    },
    "constants": {
      "schemaVersion": "0.1.0"
    }
  },
  "ResourceLedgerBinding": {
    "properties": {
      "resourceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource"
        }
      },
      "ledgerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "unit": {
        "ref": "RegisteredName"
      },
      "maxQuantity": {
        "ref": "NonnegativeDecimal"
      }
    }
  },
  "ResourceEnvelopeRecord": {
    "properties": {
      "envelopeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-envelope"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "bindings": {
        "items": {
          "ref": "ResourceLedgerBinding"
        },
        "set": true
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "ConfigureResourceEnvelopePayload": {
    "properties": {
      "envelope": {
        "ref": "ResourceEnvelopeRecord"
      }
    }
  },
  "AuthorizationSnapshotRecord": {
    "properties": {
      "snapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actorRef": {
        "ref": "Actor"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "authorityRef": {
        "ref": "AuthorityRef"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "intentDigest": {
        "ref": "Digest"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "pinSetRef": {
        "ref": "PinSetRef"
      },
      "pinSetDigest": {
        "ref": "Digest"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "planDigest": {
        "ref": "Digest"
      },
      "sourceVersionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "grantRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "epochVector": {
        "items": {
          "ref": "FenceRecord"
        },
        "set": true
      },
      "policyEvaluationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "policyBindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-binding"
        }
      },
      "reservationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "commitmentRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "issuedAt": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "resourceOriginSnapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "previousSnapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      }
    }
  },
  "PurposeRecord": {
    "properties": {
      "purposeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.purpose"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "name": {
        "ref": "RegisteredName"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "status": {
        "ref": "AccessRecordState"
      }
    }
  },
  "ConnectionRecord": {
    "properties": {
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "providerName": {
        "ref": "RegisteredName"
      },
      "providerTenantId": {},
      "accountRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "connectorRefs": {
        "items": {
          "branches": [
            {
              "ref": "CapabilityRef"
            },
            {
              "properties": {
                "kind": {}
              },
              "constants": {
                "kind": "Connector"
              }
            }
          ]
        },
        "set": true
      },
      "secretRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.secret"
        }
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      },
      "status": {
        "ref": "AccessRecordState"
      }
    }
  },
  "ConfigurePurposePayload": {
    "properties": {
      "purpose": {
        "ref": "PurposeRecord"
      }
    }
  },
  "ConfigureConnectionPayload": {
    "properties": {
      "connection": {
        "ref": "ConnectionRecord"
      }
    }
  },
  "RevokeDirectoryRecordPayload": {
    "properties": {
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "WorkLeaseRecord": {
    "properties": {
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "targetRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "fencingToken": {
        "ref": "Version"
      },
      "leaseUntil": {
        "ref": "Time"
      }
    }
  },
  "ClaimWorkLeasePayload": {
    "properties": {
      "targetRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseSeconds": {}
    }
  },
  "RenewWorkLeasePayload": {
    "properties": {
      "workerId": {
        "ref": "UUID"
      },
      "fencingToken": {
        "ref": "Version"
      },
      "leaseSeconds": {}
    }
  },
  "ReleaseWorkLeasePayload": {
    "properties": {
      "workerId": {
        "ref": "UUID"
      },
      "fencingToken": {
        "ref": "Version"
      }
    }
  },
  "ResourceFenceRecord": {
    "properties": {
      "fenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-fence"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "resourceKey": {
        "ref": "RegisteredName"
      },
      "fencingToken": {
        "ref": "Version"
      },
      "unresolvedOperationRef": {
        "ref": "OperationRef"
      },
      "blockedByReportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "safetyStopOperationRef": {
        "ref": "OperationRef"
      }
    }
  },
  "SafetyStopCandidate": {
    "properties": {
      "fenceRef": {
        "ref": "EntityRef"
      },
      "connectionRef": {
        "ref": "EntityRef"
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "resourceKey": {
        "ref": "RegisteredName"
      },
      "fencingToken": {
        "ref": "Version"
      },
      "unresolvedOperationRef": {
        "ref": "OperationRef"
      },
      "safetyStopOperationRef": {
        "ref": "OperationRef"
      },
      "blockedByReportRef": {
        "ref": "EntityRef"
      }
    }
  },
  "SafetyStopListResult": {
    "properties": {
      "candidates": {
        "items": {
          "ref": "SafetyStopCandidate"
        }
      },
      "complete": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "DispatchPermitRecord": {
    "properties": {
      "permitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "operationRef": {
        "ref": "OperationRef"
      },
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt"
        }
      },
      "ordinal": {},
      "snapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "resourceFenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-fence"
        }
      },
      "resourceFencingToken": {
        "ref": "Version"
      },
      "connectorRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Connector"
            }
          }
        ]
      },
      "payloadRef": {
        "ref": "ArtifactRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "providerIdempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "policyEvaluationRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.policy-evaluation"
          }
        },
        "set": true
      },
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "dependencyRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "AttemptRecord": {
    "properties": {
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "operationRef": {
        "ref": "OperationRef"
      },
      "ordinal": {},
      "permitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      },
      "providerIdempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "createdAt": {
        "ref": "Time"
      }
    }
  },
  "AttemptObservationRecord": {
    "properties": {
      "observationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt-observation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt"
        }
      },
      "sequence": {
        "ref": "Version"
      },
      "status": {
        "ref": "AttemptState"
      },
      "observedAt": {
        "ref": "Time"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "IssueDispatchPermitPayload": {
    "properties": {
      "snapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "SafeRetryOperationPayload": {
    "properties": {
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "expectedPermitRef": {
        "ref": "EntityRef"
      },
      "permit": {
        "ref": "IssueDispatchPermitPayload"
      }
    }
  },
  "DispatchExitRecord": {
    "properties": {
      "exitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-exit"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "permitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      },
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "policyEvaluationRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.policy-evaluation"
          }
        },
        "set": true
      },
      "expiresAt": {
        "ref": "Time"
      },
      "claimedAt": {
        "ref": "Time"
      }
    }
  },
  "ClaimDispatchExitPayload": {
    "properties": {
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "NormalizedOperationObservation": {
    "properties": {
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "operationId": {
        "ref": "UUID"
      },
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "connectorRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Connector"
            }
          }
        ]
      },
      "providerIdempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "sourceKey": {},
      "sourceVersion": {},
      "source": {
        "branches": [
          {
            "properties": {
              "kind": {},
              "attemptRef": {
                "properties": {
                  "type": {},
                  "id": {
                    "ref": "UUID"
                  },
                  "version": {
                    "ref": "Version"
                  }
                },
                "constants": {
                  "type": "abh.attempt"
                }
              }
            },
            "constants": {
              "kind": "Response"
            }
          },
          {
            "properties": {
              "kind": {},
              "queryAuthorityRef": {
                "ref": "AuthorityRef"
              },
              "coverage": {},
              "visibleThrough": {
                "ref": "Time"
              },
              "noEffectEvidenceRef": {
                "ref": "EntityRef"
              }
            },
            "constants": {
              "kind": "Query"
            }
          }
        ]
      },
      "observedAt": {
        "ref": "Time"
      },
      "matches": {
        "items": {
          "properties": {
            "externalId": {},
            "sourceVersion": {},
            "payloadDigest": {
              "ref": "Digest"
            },
            "effect": {}
          }
        }
      }
    }
  },
  "RecordOperationReceiptPayload": {
    "properties": {
      "receiptKey": {
        "ref": "IdempotencyKey"
      },
      "rawArtifactRef": {
        "ref": "ArtifactRef"
      },
      "normalizedArtifactRef": {
        "ref": "ArtifactRef"
      }
    }
  },
  "CompareOperationPayload": {
    "properties": {
      "receiptRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "ApplyReconciliationPayload": {
    "properties": {
      "reportRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "RecoverOperationPayload": {
    "properties": {
      "workerId": {
        "ref": "UUID"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "RecoverRunPayload": {
    "properties": {
      "workerId": {
        "ref": "UUID"
      },
      "causeRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "WakeRunPayload": {
    "properties": {
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "causeRef": {
        "ref": "EntityRef"
      },
      "waitRef": {
        "ref": "EntityRef"
      }
    }
  },
  "GraphPatchNode": {
    "properties": {
      "nodeKey": {
        "ref": "RegisteredName"
      },
      "kind": {},
      "inputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "outputSchemaRef": {
        "ref": "EntityRef"
      },
      "deadlineSeconds": {},
      "required": {}
    }
  },
  "GraphPatchEdge": {
    "properties": {
      "from": {
        "ref": "RegisteredName"
      },
      "to": {
        "ref": "RegisteredName"
      }
    }
  },
  "ProposeGraphPatchPayload": {
    "properties": {
      "runRef": {
        "ref": "EntityRef"
      },
      "baseRevision": {},
      "addNodes": {
        "items": {
          "ref": "GraphPatchNode"
        }
      },
      "addEdges": {
        "items": {
          "ref": "GraphPatchEdge"
        }
      },
      "supersedePendingNodes": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "rationaleRef": {
        "ref": "EntityRef"
      }
    }
  },
  "GraphRevisionRecord": {
    "properties": {
      "revisionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.graph-revision"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "baseRevision": {},
      "revision": {},
      "patchDigest": {
        "ref": "Digest"
      },
      "proposerRef": {
        "ref": "EntityRef"
      },
      "nodes": {
        "items": {
          "ref": "GraphPatchNode"
        }
      },
      "edges": {
        "items": {
          "ref": "GraphPatchEdge"
        }
      },
      "supersededNodeKeys": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "rationaleRef": {
        "ref": "EntityRef"
      },
      "createdBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "TaskSpec": {
    "properties": {
      "goal": {},
      "inputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "outputSchemaRef": {
        "ref": "EntityRef"
      },
      "deadlineSeconds": {},
      "acceptanceRef": {
        "ref": "EntityRef"
      },
      "resourceLimits": {}
    }
  },
  "ClaimTaskPayload": {
    "properties": {
      "taskRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseSeconds": {}
    }
  },
  "PrepareInvocationPayload": {
    "properties": {
      "taskRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "taskSpec": {
        "ref": "TaskSpec"
      },
      "identityBasisRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "FinalizeInvocationPayload": {
    "properties": {
      "invocationRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "manifestRef": {
        "ref": "EntityRef"
      },
      "bindingRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "contractDigest": {
        "ref": "Digest"
      }
    }
  },
  "CompleteInvocationPayload": {
    "properties": {
      "invocationRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "stopReason": {},
      "resultArtifactRef": {
        "ref": "EntityRef"
      },
      "usageRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ObserveLateInvocationPayload": {
    "properties": {
      "invocationRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "stopReason": {},
      "resultArtifactRef": {
        "ref": "EntityRef"
      },
      "usageRef": {
        "ref": "EntityRef"
      }
    }
  },
  "LateInvocationObservationRecord": {
    "properties": {
      "observationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation-observation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "taskRef": {
        "ref": "EntityRef"
      },
      "invocationRef": {
        "ref": "EntityRef"
      },
      "leaseRef": {
        "ref": "EntityRef"
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "status": {},
      "stopReason": {},
      "resultArtifactRef": {
        "ref": "EntityRef"
      },
      "usageRef": {
        "ref": "EntityRef"
      },
      "observedAt": {
        "ref": "Time"
      },
      "createdBy": {
        "ref": "Actor"
      }
    },
    "constants": {
      "status": "Observed"
    }
  },
  "LateInvocationAdjudicationRecord": {
    "properties": {
      "adjudicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation-adjudication"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "taskRef": {
        "ref": "EntityRef"
      },
      "invocationRef": {
        "ref": "EntityRef"
      },
      "observationRef": {
        "ref": "EntityRef"
      },
      "decision": {},
      "reason": {},
      "observedLeaseRef": {
        "ref": "EntityRef"
      },
      "observedWorkerId": {
        "ref": "UUID"
      },
      "observedFencingToken": {
        "ref": "Version"
      },
      "ownerLeaseRef": {
        "ref": "EntityRef"
      },
      "ownerFencingToken": {
        "ref": "Version"
      },
      "createdBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      }
    }
  },
  "CommitVerifiedTaskPayload": {
    "properties": {
      "taskRef": {
        "ref": "EntityRef"
      },
      "invocationRef": {
        "ref": "EntityRef"
      },
      "verificationRef": {
        "ref": "EntityRef"
      },
      "domainCommandReceiptRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "InvocationRecord": {
    "properties": {
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "taskRef": {
        "ref": "EntityRef"
      },
      "attemptOrdinal": {},
      "taskSpecDigest": {
        "ref": "Digest"
      },
      "taskSpec": {
        "ref": "TaskSpec"
      },
      "principalRef": {
        "ref": "EntityRef"
      },
      "status": {},
      "manifestRef": {
        "ref": "EntityRef"
      },
      "bindingRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "contractDigest": {
        "ref": "Digest"
      },
      "resultArtifactRef": {
        "ref": "EntityRef"
      },
      "usageRef": {
        "ref": "EntityRef"
      },
      "stopReason": {},
      "createdBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "CheckpointRecord": {
    "properties": {
      "checkpointRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.checkpoint"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "taskRef": {
        "ref": "EntityRef"
      },
      "graphRevisionRef": {
        "ref": "EntityRef"
      },
      "sequence": {},
      "completedTaskRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "verifiedOutputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "waitRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "resourceUsageRef": {
        "ref": "EntityRef"
      },
      "domainCommandReceiptRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "watermark": {
        "ref": "Digest"
      },
      "createdAt": {
        "ref": "Time"
      }
    }
  },
  "ActionResultRecord": {
    "properties": {
      "resultRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action-result"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "aggregationRuleRef": {
        "ref": "EntityRef"
      },
      "operationVersionRefs": {
        "items": {
          "ref": "OperationRef"
        },
        "set": true
      },
      "reconciliationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "resourceSettlements": {
        "items": {
          "properties": {
            "reservationRef": {
              "ref": "EntityRef"
            },
            "actualUsage": {
              "ref": "NonnegativeDecimal"
            },
            "evidenceRef": {
              "ref": "EntityRef"
            }
          }
        },
        "set": true
      },
      "outcome": {},
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "AggregateActionPayload": {
    "properties": {
      "operationVersionRefs": {
        "items": {
          "ref": "OperationRef"
        },
        "set": true
      }
    }
  },
  "CleanupActionPayload": {
    "properties": {
      "mode": {},
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "ActionCleanupRecord": {
    "properties": {
      "cleanupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action-cleanup"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "snapshotRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot"
        }
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "mode": {},
      "reason": {
        "ref": "Reason"
      },
      "releasedReservationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "checkedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "RefreshActionPayload": {
    "properties": {}
  },
  "TransportCaptureRecord": {
    "properties": {
      "captureRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.transport-capture"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "attemptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt"
        }
      },
      "exitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-exit"
        }
      },
      "transportStatus": {},
      "normalization": {},
      "observationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.attempt-observation"
        }
      },
      "observedAt": {
        "ref": "Time"
      },
      "rawArtifactRef": {
        "ref": "ArtifactRef"
      },
      "receiptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation-receipt"
        }
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "CaptureTransportPayload": {
    "properties": {
      "permitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      }
    }
  },
  "InboxRecord": {
    "properties": {
      "inboxRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.inbox"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "consumerId": {
        "ref": "RegisteredName"
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      },
      "sourceAggregateRef": {
        "ref": "EntityRef"
      },
      "sourceEventOrdinal": {},
      "resultRef": {
        "ref": "EntityRef"
      },
      "handledAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "ConsumeEventPayload": {
    "properties": {
      "consumerId": {
        "ref": "RegisteredName"
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      }
    }
  },
  "OutboxRoutingRecord": {
    "properties": {
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      },
      "routingRuleRef": {
        "ref": "EntityRef"
      },
      "deliveries": {
        "items": {
          "properties": {
            "consumerId": {
              "ref": "RegisteredName"
            },
            "consumerRef": {
              "ref": "EntityRef"
            },
            "job": {
              "ref": "JobEnvelope"
            }
          }
        },
        "set": true
      },
      "preparedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "OutboxDeliveryRecord": {
    "properties": {
      "deliveryRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-delivery"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "consumerId": {
        "ref": "RegisteredName"
      },
      "jobRef": {
        "ref": "JobRef"
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "OutboxPublicationRecord": {
    "properties": {
      "publicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-publication"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "deliveryRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.outbox-delivery"
          }
        },
        "set": true
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "PrepareOutboxPayload": {
    "properties": {
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      }
    }
  },
  "RecordOutboxDeliveryPayload": {
    "properties": {
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "consumerId": {
        "ref": "RegisteredName"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "RegisterDurableWaitPayload": {
    "properties": {
      "ownerRef": {
        "ref": "EntityRef"
      },
      "waitKey": {
        "ref": "IdempotencyKey"
      },
      "dueAt": {
        "ref": "Time"
      },
      "causeRef": {
        "ref": "EntityRef"
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "conditionRef": {
        "ref": "EntityRef"
      },
      "sourceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "DurableWaitSource": {
    "properties": {
      "sourceRef": {
        "ref": "EntityRef"
      },
      "eventOrdinal": {},
      "satisfied": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "DurableWaitRecord": {
    "properties": {
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "ownerRef": {
        "ref": "EntityRef"
      },
      "waitKey": {
        "ref": "IdempotencyKey"
      },
      "dueAt": {
        "ref": "Time"
      },
      "causeRef": {
        "ref": "EntityRef"
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "conditionRef": {
        "ref": "EntityRef"
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "registrationDigest": {
        "ref": "Digest"
      },
      "waitingIntentRef": {
        "ref": "EntityRef"
      },
      "status": {},
      "source": {
        "ref": "DurableWaitSource"
      },
      "registeredAt": {
        "ref": "Time"
      },
      "resolvedAt": {
        "ref": "Time"
      },
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      },
      "cancelReason": {
        "ref": "Reason"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "DurableWakeupRecord": {
    "properties": {
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "ownerRef": {
        "ref": "EntityRef"
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "reason": {},
      "source": {
        "ref": "DurableWaitSource"
      },
      "triggerEventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      },
      "createdAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "RecheckDurableWaitPayload": {
    "properties": {
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "triggerEventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      }
    }
  },
  "CancelDurableWaitPayload": {
    "properties": {
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      }
    }
  },
  "WaitPortReceiptRecord": {
    "properties": {
      "receiptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.wait-port-receipt"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "method": {},
      "inputDigest": {
        "ref": "Digest"
      },
      "result": {
        "branches": [
          {
            "ref": "ScheduledWakeup"
          },
          {
            "ref": "CancelledWakeup"
          },
          {
            "ref": "SignalledWait"
          }
        ]
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "triggerEventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      }
    }
  },
  "ExecuteWaitPortPayload": {
    "properties": {
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "method": {},
      "inputDigest": {
        "ref": "Digest"
      }
    }
  },
  "ActionWaitRecord": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action-wait"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "requestRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "outcome": {},
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "cancelledWaitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      }
    }
  },
  "NotifyActionWaitPayload": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action-wait"
        }
      },
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      }
    }
  },
  "OperationWaitRecord": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation-wait"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "waitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "authorityRef": {
        "ref": "EntityRef"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "outcome": {},
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "cancelledWaitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      }
    }
  },
  "NotifyOperationWaitPayload": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation-wait"
        }
      },
      "wakeupRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup"
        }
      }
    }
  },
  "ClaimQueryExitPayload": {
    "properties": {
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "queryAuthorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      }
    }
  },
  "QueryExitRecord": {
    "properties": {
      "exitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.query-exit"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "actionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "queryAuthorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "authorityDigest": {
        "ref": "Digest"
      },
      "queryPolicyRef": {
        "ref": "EntityRef"
      },
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "connectorRef": {
        "ref": "CapabilityRef"
      },
      "providerIdempotencyKey": {},
      "payloadDigest": {
        "ref": "Digest"
      },
      "leaseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "workerId": {
        "ref": "UUID"
      },
      "leaseFencingToken": {
        "ref": "Version"
      },
      "reservationRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.reservation"
          }
        }
      },
      "claimedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "queryConnectorRef": {
        "ref": "CapabilityRef"
      },
      "compatibilityEvidenceRef": {
        "ref": "ArtifactRef"
      },
      "compatibilityEvidenceDigest": {
        "ref": "Digest"
      }
    }
  },
  "QueryCaptureRecord": {
    "properties": {
      "captureRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.query-capture"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "exitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.query-exit"
        }
      },
      "transportStatus": {},
      "normalization": {},
      "observedAt": {
        "ref": "Time"
      },
      "rawArtifactRef": {
        "ref": "ArtifactRef"
      },
      "receiptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation-receipt"
        }
      },
      "digest": {
        "ref": "Digest"
      },
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      }
    }
  },
  "CaptureQueryPayload": {
    "properties": {
      "exitRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.query-exit"
        }
      }
    }
  },
  "ScopeAuthorityDraft": {
    "properties": {
      "executionPrincipalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "allowedProposerRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.principal"
          }
        },
        "set": true
      },
      "grantRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.grant"
          }
        },
        "set": true
      },
      "scopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "purposeRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.purpose"
          }
        },
        "set": true
      },
      "actionTypes": {
        "items": {
          "ref": "RegisteredName"
        },
        "set": true
      },
      "resourceEnvelopeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-envelope"
        }
      },
      "validFrom": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "stopConditions": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "effectKey": {}
    }
  },
  "ScopeAuthorityPolicyInput": {
    "properties": {
      "schemaVersion": {},
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "actor": {
        "ref": "Actor"
      },
      "draft": {
        "ref": "ScopeAuthorityDraft"
      },
      "grants": {
        "items": {
          "ref": "GrantRecord"
        }
      },
      "sourceVersionRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "resourceEnvelope": {
        "ref": "ResourceEnvelopeRecord"
      }
    },
    "constants": {
      "schemaVersion": "0.1.0"
    }
  },
  "CreateScopeAuthorityPayload": {
    "properties": {
      "draft": {
        "ref": "ScopeAuthorityDraft"
      },
      "evaluationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.policy-evaluation"
        }
      },
      "managementGrantRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "OutboxConsumptionRecord": {
    "properties": {
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      },
      "consumptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-consumption"
        }
      },
      "publicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-publication"
        }
      },
      "inboxRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.inbox"
          }
        },
        "set": true
      }
    }
  },
  "RecordOutboxConsumptionPayload": {
    "properties": {
      "routingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      }
    }
  },
  "ExceptionRecord": {
    "properties": {
      "exceptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "sourceRef": {
        "ref": "OperationRef"
      },
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "category": {},
      "severity": {},
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "blockedScopeRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "requiredResponsibilityRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "proposalDigest": {
        "ref": "Digest"
      },
      "recordedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "category": "TerminalContradiction",
      "severity": "High"
    }
  },
  "ExceptionResolutionRecord": {
    "properties": {
      "resolutionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "exceptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "sourceRef": {
        "ref": "OperationRef"
      },
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "decisionRef": {
        "ref": "DecisionRef"
      },
      "resolutionKind": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "technicalUnknownPreserved": {},
      "resourceFreezePreserved": {},
      "resolvedBy": {
        "ref": "Actor"
      },
      "resolvedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "technicalUnknownPreserved": true,
      "resourceFreezePreserved": true
    }
  },
  "OpenTerminalExceptionPayload": {
    "properties": {
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "responsibility": {
        "ref": "OpenResponsibilityRequestPayload"
      }
    }
  },
  "ApplyExceptionResolutionEffectPayload": {
    "properties": {
      "resolutionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "correctionApplicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.correction-application"
        }
      }
    }
  },
  "ExceptionResolutionEffectRecord": {
    "properties": {
      "effectRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-resolution-effect"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "resolutionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "exceptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "correctionApplicationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.correction-application"
        }
      },
      "fenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.resource-fence"
        }
      },
      "fencingToken": {
        "ref": "Version"
      },
      "reportBlockReleased": {},
      "unresolvedOperationPreserved": {},
      "fencingTokenPreserved": {},
      "appliedBy": {
        "ref": "Actor"
      },
      "appliedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "reportBlockReleased": true,
      "unresolvedOperationPreserved": true,
      "fencingTokenPreserved": true
    }
  },
  "ResolveExceptionPayload": {
    "properties": {
      "exceptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "resolutionKind": {},
      "decisionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.decision"
        }
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "ExceptionSuccessorDispatchRecord": {
    "properties": {
      "dispatchRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-successor-dispatch"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "resolutionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "exceptionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "sourceRef": {
        "ref": "EntityRef"
      },
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "resolutionKind": {},
      "successorRef": {
        "ref": "EntityRef"
      },
      "dispatchedBy": {
        "ref": "Actor"
      },
      "dispatchedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "RevokeResponsibilityPayload": {
    "properties": {
      "assignmentRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "replacementRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "reason": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "DecisionWithdrawalRecord": {
    "properties": {
      "commandRef": {
        "ref": "CommandRef"
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "decisionRef": {
        "ref": "DecisionRef"
      },
      "reason": {
        "ref": "Reason"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "ReviseResponsibilityRoutePayload": {
    "properties": {
      "expectedRequestRef": {
        "ref": "RequestRef"
      },
      "proposal": {
        "ref": "OpenResponsibilityRequestPayload"
      },
      "frozenPolicyRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "directoryRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "reason": {
        "ref": "Reason"
      },
      "delegation": {
        "ref": "ResponsibilityDelegation"
      },
      "escalation": {
        "ref": "ResponsibilityEscalation"
      }
    }
  },
  "ResponsibilityDelegation": {
    "properties": {
      "slotId": {
        "ref": "NodeKey"
      },
      "seatId": {
        "ref": "NodeKey"
      },
      "responsibilityRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ResponsibilityEscalation": {
    "properties": {
      "slotId": {
        "ref": "NodeKey"
      },
      "seatId": {
        "ref": "NodeKey"
      },
      "responsibilityRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ResponsibilityRouteRevisionRecord": {
    "properties": {
      "previousRequest": {
        "ref": "ResponsibilityRequestRecord"
      },
      "change": {
        "ref": "ReviseResponsibilityRoutePayload"
      }
    }
  },
  "DecisionEffectIntentRecord": {
    "properties": {
      "effectRef": {
        "ref": "DecisionEffectRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "routeRevision": {
        "ref": "Version"
      },
      "effectKey": {},
      "decisionRefs": {
        "items": {
          "ref": "DecisionRef"
        }
      },
      "completionEvidenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.request-completion-evidence"
        }
      },
      "targetOwner": {},
      "targetRef": {
        "ref": "EntityRef"
      },
      "commandRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.command"
        }
      },
      "originatingCommandRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.command"
        }
      },
      "status": {},
      "recordedAt": {
        "ref": "Time"
      }
    },
    "constants": {
      "status": "Pending"
    }
  },
  "DecisionEffectReceiptRecord": {
    "properties": {
      "receiptRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.command"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "effectRef": {
        "ref": "DecisionEffectRef"
      },
      "requestRef": {
        "ref": "RequestRef"
      },
      "completionEvidenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.request-completion-evidence"
        }
      },
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "grantRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.grant"
          }
        }
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "status": {},
      "appliedAt": {
        "ref": "Time"
      }
    },
    "constants": {
      "status": "Applied"
    }
  },
  "ActionAuthorizationRequestRecord": {
    "properties": {
      "requestRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.action-authorization-request",
          "version": 1
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "sourceCommandRef": {
        "ref": "CommandRef"
      },
      "requestedBy": {
        "ref": "Actor"
      },
      "executionPrincipalRef": {
        "ref": "EntityRef"
      },
      "payload": {
        "ref": "RequestAuthorizationPayload"
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "acceptedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "RecordPackValidationPayload": {
    "properties": {
      "reportDigest": {
        "ref": "Digest"
      },
      "governanceRef": {
        "ref": "EntityRef"
      },
      "governanceDigest": {
        "ref": "Digest"
      }
    }
  },
  "PublishPackTrustPolicyPayload": {
    "properties": {
      "documentDigest": {
        "ref": "Digest"
      },
      "signerKeyDigest": {
        "ref": "Digest"
      },
      "expectedVersion": {}
    }
  },
  "LocalPackStagingReceipt": {
    "properties": {
      "id": {
        "ref": "UUID"
      },
      "metadataDigest": {
        "ref": "Digest"
      }
    }
  },
  "StagePackPayload": {
    "properties": {
      "validationRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {},
              "version": {}
            },
            "constants": {
              "type": "abh.pack-validation",
              "version": 1
            }
          }
        ]
      },
      "snapshot": {
        "ref": "LocalPackStagingReceipt"
      },
      "expectedDeploymentVersion": {}
    }
  },
  "InstalledPackRecord": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "manifest": {
        "ref": "PackManifest"
      },
      "snapshot": {
        "ref": "LocalPackStagingReceipt"
      },
      "validationRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {},
              "version": {}
            },
            "constants": {
              "type": "abh.pack-validation",
              "version": 1
            }
          }
        ]
      },
      "reportDigest": {
        "ref": "Digest"
      },
      "governanceRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-trust-policy"
            }
          }
        ]
      },
      "governanceDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "status": {},
      "stagedAt": {
        "ref": "Time"
      },
      "enablement": {
        "ref": "PackEnableRecord"
      },
      "suspension": {
        "ref": "PackSuspensionRecord"
      },
      "retirement": {
        "ref": "PackRetirementRecord"
      }
    }
  },
  "PackDataImpactRecord": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {},
              "version": {}
            },
            "constants": {
              "type": "abh.installed-pack",
              "version": 1
            }
          }
        ]
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "compilerRef": {
        "ref": "CapabilityRef"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "baselineSourceRef": {
        "ref": "EntityRef"
      },
      "targetSourceRef": {
        "ref": "EntityRef"
      },
      "baseline": {
        "ref": "PackDataInventory"
      },
      "target": {
        "ref": "PackDataInventory"
      },
      "impact": {
        "ref": "PackDataImpact"
      },
      "issuedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      }
    }
  },
  "RecordPackDataImpactPayload": {
    "properties": {
      "report": {
        "ref": "PackDataImpactRecord"
      }
    }
  },
  "PackInspectionJobRecord": {
    "properties": {
      "jobRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "packRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.installed-pack",
          "version": 1
        }
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "kind": {},
      "status": {
        "ref": "PackInspectionJobState"
      },
      "requestedBy": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {},
      "requestedAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "budget": {
        "properties": {
          "maxAttempts": {},
          "attempts": {},
          "maxDurationMs": {},
          "elapsedMs": {}
        }
      },
      "lease": {
        "properties": {
          "leaseRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "workerId": {
            "ref": "UUID"
          },
          "fencingToken": {}
        }
      },
      "observation": {
        "properties": {
          "artifactRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "matched": {}
        }
      },
      "diagnostic": {
        "properties": {
          "code": {},
          "evidenceRefs": {
            "items": {
              "properties": {
                "type": {},
                "id": {
                  "ref": "UUID"
                },
                "version": {
                  "ref": "Version"
                }
              },
              "constants": {
                "type": "abh.artifact"
              }
            }
          }
        }
      }
    },
    "constants": {
      "kind": "StructureAndDataInspection"
    }
  },
  "RequestPackInspectionPayload": {
    "properties": {
      "packRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.installed-pack",
          "version": 1
        }
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "maxAttempts": {},
      "maxDurationMs": {}
    }
  },
  "StartPackInspectionPayload": {
    "properties": {
      "lease": {
        "properties": {
          "leaseRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "workerId": {
            "ref": "UUID"
          },
          "fencingToken": {}
        }
      }
    }
  },
  "ExpirePackInspectionPayload": {
    "properties": {
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      }
    }
  },
  "PackInspectionTimeoutEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {},
      "cause": {}
    }
  },
  "CompletePackInspectionPayload": {
    "properties": {
      "lease": {
        "properties": {
          "leaseRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "workerId": {
            "ref": "UUID"
          },
          "fencingToken": {}
        }
      },
      "observationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      }
    }
  },
  "PackInspectionBlockEvidence": {
    "properties": {
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "packRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.installed-pack",
          "version": 1
        }
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "principalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "observedAt": {
        "ref": "Time"
      },
      "reason": {}
    }
  },
  "WaitPackInspectionPayload": {
    "properties": {
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      },
      "lease": {
        "properties": {
          "leaseRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "workerId": {
            "ref": "UUID"
          },
          "fencingToken": {}
        }
      }
    }
  },
  "PackInspectionWaitingEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "block": {
        "ref": "PackInspectionBlockEvidence"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {}
    }
  },
  "CancelPackInspectionPayload": {
    "properties": {
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      },
      "reason": {},
      "basisRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      }
    }
  },
  "PackInspectionCancellationEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {},
      "disposition": {},
      "reason": {},
      "basisRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "actorRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "commandId": {
        "ref": "UUID"
      }
    }
  },
  "PackInspectionRetryExhaustedEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "block": {
        "ref": "PackInspectionBlockEvidence"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {},
      "cause": {}
    },
    "constants": {
      "cause": "AttemptsExhausted"
    }
  },
  "PackInspectionDeliveryRecord": {
    "properties": {
      "deliveryRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.pack-inspection-delivery",
          "version": 1
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "jobRef": {
        "ref": "PackInspectionJobRef"
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      },
      "sourceCommandRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.command",
          "version": 1
        }
      },
      "acceptedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "AcceptPackInspectionDeliveryPayload": {
    "properties": {
      "jobRef": {
        "ref": "PackInspectionJobRef"
      },
      "eventRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {}
        },
        "constants": {
          "type": "abh.event",
          "version": 1
        }
      },
      "eventDigest": {
        "ref": "Digest"
      }
    }
  },
  "PackInspectionLeaseLossEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "observedLease": {
        "ref": "WorkLeaseRecord"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {},
      "cause": {},
      "disposition": {}
    }
  },
  "FailLostPackInspectionPayload": {
    "properties": {
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      }
    }
  },
  "DatabaseDiagnosticResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {}
    },
    "constants": {
      "checkId": "data.security-manifest"
    },
    "branches": [
      {},
      {}
    ]
  },
  "ProjectionHealthResult": {
    "properties": {
      "checkId": {},
      "projectionType": {},
      "subjectId": {},
      "present": {},
      "sourceVersion": {},
      "goalRevision": {},
      "stopEpoch": {},
      "stale": {},
      "watermarkEventId": {
        "branches": [
          {},
          {}
        ]
      },
      "watermarkAt": {
        "branches": [
          {},
          {}
        ]
      },
      "latestEventId": {
        "branches": [
          {},
          {}
        ]
      },
      "latestEventAt": {
        "branches": [
          {},
          {}
        ]
      },
      "lagMs": {},
      "gapCount": {},
      "safeRebuildCommand": {}
    },
    "constants": {
      "checkId": "projection.mission-summary",
      "projectionType": "abh.projection.mission-summary",
      "safeRebuildCommand": "abh.projections.refresh-mission-summary"
    }
  },
  "CliDoctorProjectionResult": {
    "properties": {
      "checkId": {},
      "projectionType": {},
      "subjectId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "health": {
        "properties": {
          "checkId": {},
          "projectionType": {},
          "subjectId": {},
          "present": {},
          "sourceVersion": {},
          "goalRevision": {},
          "stopEpoch": {},
          "stale": {},
          "watermarkEventId": {
            "branches": [
              {},
              {}
            ]
          },
          "watermarkAt": {
            "branches": [
              {},
              {}
            ]
          },
          "latestEventId": {
            "branches": [
              {},
              {}
            ]
          },
          "latestEventAt": {
            "branches": [
              {},
              {}
            ]
          },
          "lagMs": {},
          "gapCount": {},
          "safeRebuildCommand": {}
        },
        "constants": {
          "checkId": "projection.mission-summary",
          "projectionType": "abh.projection.mission-summary",
          "safeRebuildCommand": "abh.projections.refresh-mission-summary"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "projection.mission-summary",
      "projectionType": "abh.projection.mission-summary"
    },
    "branches": [
      {},
      {}
    ]
  },
  "LearningCandidateDiagnostic": {
    "properties": {
      "candidateRef": {
        "ref": "EntityRef"
      },
      "status": {},
      "assetKind": {
        "ref": "RegisteredName"
      },
      "risk": {
        "ref": "RegisteredName"
      },
      "requiredPurposes": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "withdrawnPurposes": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "profileRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {}
        ]
      },
      "profileCount": {},
      "evaluationRunRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "settledEvaluationCount": {},
      "gateRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {}
        ]
      },
      "releaseRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "stopReasons": {
        "items": {}
      }
    },
    "constants": {
      "status": "Draft"
    }
  },
  "CliDoctorLearningResult": {
    "properties": {
      "checkId": {},
      "organizationId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "truncated": {},
      "candidates": {
        "items": {
          "ref": "LearningCandidateDiagnostic"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "learning.candidate-readiness"
    },
    "branches": [
      {},
      {}
    ]
  },
  "ReleaseDiagnostic": {
    "properties": {
      "releaseRef": {
        "ref": "EntityRef"
      },
      "status": {},
      "purposeNames": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "assetCount": {},
      "installedCapabilityCount": {},
      "assignmentCount": {},
      "activeAssignmentCount": {},
      "executionAllowedAssignmentCount": {},
      "pinSetCount": {},
      "gateRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "invalidGateRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "compatibilityRef": {
        "ref": "EntityRef"
      },
      "compatibilityReady": {},
      "rollbackCandidateRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "stopReasons": {
        "items": {}
      }
    }
  },
  "CliDoctorReleaseResult": {
    "properties": {
      "checkId": {},
      "organizationId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "truncated": {},
      "releases": {
        "items": {
          "ref": "ReleaseDiagnostic"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "release.readiness"
    },
    "branches": [
      {},
      {},
      {}
    ]
  },
  "OperationDiagnostic": {
    "properties": {
      "operationRef": {
        "ref": "OperationRef"
      },
      "actionRef": {
        "ref": "ActionRef"
      },
      "planRef": {
        "ref": "PlanRef"
      },
      "nodeKey": {
        "ref": "NodeKey"
      },
      "position": {
        "ref": "OperationPosition"
      },
      "attemptCount": {},
      "providerIdempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "payloadDigest": {
        "ref": "Digest"
      },
      "permitRef": {
        "branches": [
          {},
          {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.dispatch-permit"
            }
          }
        ]
      },
      "permitExpiresAt": {
        "branches": [
          {},
          {
            "ref": "Time"
          }
        ]
      },
      "permitExpired": {},
      "receiptCount": {},
      "lastReceiptAt": {
        "branches": [
          {},
          {
            "ref": "Time"
          }
        ]
      },
      "reconciliationRef": {
        "branches": [
          {},
          {
            "ref": "EntityRef"
          }
        ]
      },
      "reconciliationVerdict": {
        "branches": [
          {},
          {}
        ]
      },
      "resourceFenceRef": {
        "branches": [
          {},
          {
            "ref": "EntityRef"
          }
        ]
      },
      "remainingResponsibility": {},
      "safeRetry": {},
      "stopReasons": {
        "items": {}
      }
    }
  },
  "CliDoctorOperationResult": {
    "properties": {
      "checkId": {},
      "organizationId": {
        "ref": "UUID"
      },
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "truncated": {},
      "operations": {
        "items": {
          "ref": "OperationDiagnostic"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "operation.readiness"
    },
    "branches": [
      {},
      {},
      {}
    ]
  },
  "PackInstallDiagnostic": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "status": {},
      "deploymentVersion": {
        "ref": "Version"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "validationEvidenceBound": {},
      "governanceEvidenceBound": {},
      "capabilitySetRef": {
        "branches": [
          {},
          {
            "branches": [
              {
                "ref": "EntityRef"
              },
              {
                "properties": {
                  "type": {}
                },
                "constants": {
                  "type": "abh.pack-capability-set"
                }
              }
            ]
          }
        ]
      },
      "expectedCapabilityCount": {},
      "registeredCapabilityCount": {},
      "deploymentRevisionRef": {
        "branches": [
          {},
          {
            "branches": [
              {
                "ref": "EntityRef"
              },
              {
                "properties": {
                  "type": {}
                },
                "constants": {
                  "type": "abh.pack-deployment-revision"
                }
              }
            ]
          }
        ]
      },
      "manifestMigrationCount": {},
      "stopReasons": {
        "items": {}
      }
    }
  },
  "CliDoctorPackResult": {
    "properties": {
      "checkId": {},
      "organizationId": {
        "ref": "UUID"
      },
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "packs": {
        "items": {
          "ref": "PackInstallDiagnostic"
        }
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "pack.install-readiness"
    },
    "branches": [
      {},
      {},
      {}
    ]
  },
  "PackContentDiagnostic": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "kind": {},
      "trustMode": {},
      "license": {},
      "artifactCount": {},
      "migrationCount": {},
      "manifestDigest": {
        "ref": "Digest"
      },
      "artifactSetDigest": {
        "ref": "Digest"
      },
      "packageDigest": {
        "ref": "Digest"
      }
    }
  },
  "CliPackValidateResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "diagnostic": {
        "branches": [
          {},
          {
            "ref": "PackContentDiagnostic"
          }
        ]
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "pack.content-validation"
    },
    "branches": [
      {},
      {},
      {},
      {}
    ]
  },
  "PackBuildDiagnostic": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "kind": {},
      "trustMode": {},
      "license": {},
      "artifactCount": {},
      "migrationCount": {},
      "manifestDigest": {
        "ref": "Digest"
      },
      "artifactSetDigest": {
        "ref": "Digest"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "outputBytes": {}
    }
  },
  "CliPackBuildResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "diagnostic": {
        "branches": [
          {},
          {
            "ref": "PackBuildDiagnostic"
          }
        ]
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "pack.manifest-build"
    },
    "branches": [
      {},
      {},
      {},
      {}
    ]
  },
  "PackSignatureDiagnostic": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "packageDigest": {
        "ref": "Digest"
      },
      "bundleDigest": {
        "ref": "Digest"
      },
      "bundleBytes": {}
    }
  },
  "CliPackSignResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "diagnostic": {
        "branches": [
          {},
          {
            "ref": "PackSignatureDiagnostic"
          }
        ]
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "pack.signature"
    },
    "branches": [
      {},
      {},
      {},
      {}
    ]
  },
  "PackVerificationDiagnostic": {
    "properties": {
      "packId": {
        "ref": "RegisteredName"
      },
      "packVersion": {
        "ref": "ExactVersion"
      },
      "subjectDigest": {
        "ref": "Digest"
      },
      "manifestDigest": {
        "ref": "Digest"
      },
      "artifactSetDigest": {
        "ref": "Digest"
      },
      "deploymentPolicyDigest": {
        "ref": "Digest"
      },
      "signatureBundleDigest": {
        "ref": "Digest"
      },
      "provenanceBundleDigest": {
        "ref": "Digest"
      },
      "conformanceBundleDigest": {
        "ref": "Digest"
      },
      "conformanceReportDigest": {
        "ref": "Digest"
      },
      "validatedAt": {
        "ref": "Time"
      },
      "validUntil": {
        "ref": "Time"
      },
      "reportDigest": {
        "ref": "Digest"
      }
    }
  },
  "CliPackVerifyResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "diagnostic": {
        "branches": [
          {},
          {
            "ref": "PackVerificationDiagnostic"
          }
        ]
      },
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {
        "branches": [
          {},
          {}
        ]
      }
    },
    "constants": {
      "checkId": "pack.supply-chain-validation"
    },
    "branches": [
      {},
      {},
      {},
      {}
    ]
  },
  "CliDoctorDataResult": {
    "properties": {
      "checkId": {},
      "status": {},
      "errorCode": {},
      "violationCount": {},
      "commandRef": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "remediation": {}
    },
    "constants": {
      "checkId": "data.security-manifest"
    },
    "branches": [
      {},
      {},
      {}
    ]
  },
  "PackInspectionDiagnostic": {
    "properties": {
      "jobRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          }
        ]
      },
      "status": {},
      "assessedAt": {
        "ref": "Time"
      },
      "nextStep": {},
      "deliveryRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-inspection-delivery"
            }
          }
        ]
      },
      "leaseRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.work-lease"
            }
          }
        ]
      },
      "leaseLoss": {},
      "evidenceRefs": {
        "items": {
          "branches": [
            {
              "ref": "EntityRef"
            },
            {
              "properties": {
                "type": {}
              },
              "constants": {
                "type": "abh.artifact"
              }
            }
          ]
        }
      },
      "elapsedMs": {},
      "remainingDurationMs": {},
      "remainingAttempts": {}
    },
    "branches": [
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  },
  "PackInspectionDiagnosticResponse": {
    "properties": {
      "success": {},
      "data": {
        "ref": "PackInspectionDiagnostic"
      },
      "meta": {
        "ref": "QueryMeta"
      }
    },
    "constants": {
      "success": true
    }
  },
  "CliInspectionDiagnosticResult": {
    "properties": {
      "commandRef": {},
      "checkId": {},
      "status": {},
      "errorCode": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "diagnostic": {
        "branches": [
          {
            "ref": "PackInspectionDiagnostic"
          },
          {}
        ]
      },
      "remediation": {}
    },
    "constants": {
      "checkId": "pack.inspection-job"
    },
    "branches": [
      {}
    ]
  },
  "PackInspectionFailureEvidence": {
    "properties": {
      "job": {
        "ref": "PackInspectionJobRecord"
      },
      "assessedAt": {
        "ref": "Time"
      },
      "elapsedMs": {},
      "disposition": {},
      "phase": {},
      "classification": {},
      "cleanupUnacknowledged": {}
    }
  },
  "FailPackInspectionPayload": {
    "properties": {
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "retentionPolicyRef": {
        "ref": "EntityRef"
      },
      "lease": {
        "properties": {
          "leaseRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "workerId": {
            "ref": "UUID"
          },
          "fencingToken": {}
        }
      }
    }
  },
  "PackMigrationNonApplicabilityReport": {
    "branches": [
      {
        "ref": "PackDataImpactRecord"
      },
      {
        "properties": {
          "baseline": {
            "properties": {
              "complete": {}
            },
            "constants": {
              "complete": true
            }
          },
          "target": {
            "properties": {
              "complete": {}
            },
            "constants": {
              "complete": true
            }
          },
          "impact": {
            "properties": {
              "status": {},
              "changes": {},
              "migrationRefs": {},
              "reasons": {}
            },
            "constants": {
              "status": "NotApplicable"
            }
          }
        }
      }
    ]
  },
  "PackEnableProposal": {
    "properties": {
      "action": {},
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "expectedDeploymentVersion": {
        "ref": "Version"
      },
      "environmentDigest": {
        "ref": "Digest"
      },
      "validationRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-validation"
            }
          }
        ]
      },
      "governanceRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-trust-policy"
            }
          }
        ]
      },
      "governanceDigest": {
        "ref": "Digest"
      },
      "ctkRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.artifact"
            }
          }
        ]
      },
      "impactRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-data-impact"
            }
          }
        ]
      },
      "migrationVerificationRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.artifact"
            }
          }
        ]
      },
      "impactUpperBound": {
        "ref": "ImpactUpperBound"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "proposalDigest": {
        "ref": "Digest"
      },
      "subjectDigest": {
        "ref": "Digest"
      },
      "capabilitySetRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-capability-set"
            }
          }
        ]
      },
      "capabilitySetDigest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "action": "EnablePack"
    }
  },
  "RecordPackConformancePayload": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "retention": {
        "properties": {
          "dataClass": {
            "ref": "RegisteredName"
          },
          "region": {},
          "retentionPolicyRef": {
            "ref": "EntityRef"
          }
        }
      }
    }
  },
  "RequestPackEnablePayload": {
    "properties": {
      "proposal": {
        "ref": "PackEnableProposal"
      },
      "responsibility": {
        "ref": "OpenResponsibilityRequestPayload"
      }
    }
  },
  "PackDeploymentRevisionRecord": {
    "properties": {
      "revisionRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-deployment-revision"
            }
          }
        ]
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "previousDeploymentVersion": {},
      "targetRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "recordedAt": {
        "ref": "Time"
      }
    }
  },
  "EnablePackPayload": {
    "properties": {
      "proposal": {
        "ref": "PackEnableProposal"
      },
      "approvalRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.request-completion-evidence"
            }
          }
        ]
      }
    }
  },
  "PackEnableRecord": {
    "properties": {
      "proposal": {
        "ref": "PackEnableProposal"
      },
      "approvalRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.request-completion-evidence"
            }
          }
        ]
      },
      "previousPackRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "enabledPackRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "enabledAt": {
        "ref": "Time"
      }
    }
  },
  "PackCapabilityBinding": {
    "properties": {
      "capability": {
        "ref": "PackCapabilityReference"
      },
      "schemaPath": {
        "ref": "PackPath"
      },
      "implementationRef": {
        "ref": "EntityRef"
      },
      "healthRef": {
        "ref": "EntityRef"
      },
      "safetyStop": {},
      "permissionEnvelope": {
        "properties": {
          "dataClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "purposes": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "commands": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "toolCapabilities": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "networkEgress": {
            "items": {}
          },
          "secretClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          }
        }
      }
    }
  },
  "PackCapabilityRegistration": {
    "properties": {
      "capability": {
        "ref": "PackCapabilityReference"
      },
      "schemaPath": {
        "ref": "PackPath"
      },
      "implementationRef": {
        "ref": "EntityRef"
      },
      "healthRef": {
        "ref": "EntityRef"
      },
      "safetyStop": {},
      "permissionEnvelope": {
        "properties": {
          "dataClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "purposes": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "commands": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "toolCapabilities": {
            "items": {
              "ref": "RegisteredName"
            }
          },
          "networkEgress": {
            "items": {}
          },
          "secretClasses": {
            "items": {
              "ref": "RegisteredName"
            }
          }
        }
      },
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "subjectDigest": {
        "ref": "Digest"
      },
      "schemaDigest": {
        "ref": "Digest"
      },
      "registrationDigest": {
        "ref": "Digest"
      }
    }
  },
  "RegisterPackCapabilitiesPayload": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "bindingsDigest": {
        "ref": "Digest"
      }
    }
  },
  "PackCapabilitySetRecord": {
    "properties": {
      "setRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.pack-capability-set"
            }
          }
        ]
      },
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "registrations": {
        "items": {
          "ref": "PackCapabilityRegistration"
        }
      },
      "recordedAt": {
        "ref": "Time"
      },
      "setDigest": {
        "ref": "Digest"
      }
    }
  },
  "PackCapabilityAvailability": {
    "properties": {
      "visible": {},
      "compatible": {},
      "healthy": {}
    }
  },
  "PackCapabilityCandidate": {
    "properties": {
      "capability": {
        "ref": "PackCapabilityReference"
      },
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "registrationDigest": {
        "ref": "Digest"
      },
      "schemaDigest": {
        "ref": "Digest"
      },
      "safetyStop": {},
      "compatible": {},
      "healthy": {}
    }
  },
  "PackCapabilityQueryResult": {
    "properties": {
      "candidates": {
        "items": {
          "ref": "PackCapabilityCandidate"
        }
      },
      "complete": {}
    }
  },
  "SuspendPackPayload": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "expectedDeploymentVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      },
      "emergency": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "PackSuspensionRecord": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "expectedDeploymentVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      },
      "emergency": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "suspendedAt": {
        "ref": "Time"
      }
    }
  },
  "RetirePackPayload": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "expectedDeploymentVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "referenceReviewRef": {
        "ref": "ArtifactRef"
      },
      "rollbackWindowEndsAt": {
        "ref": "Time"
      }
    }
  },
  "PackRetirementRecord": {
    "properties": {
      "packRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "expectedDeploymentVersion": {
        "ref": "Version"
      },
      "reason": {
        "ref": "Reason"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "referenceReviewRef": {
        "ref": "ArtifactRef"
      },
      "rollbackWindowEndsAt": {
        "ref": "Time"
      },
      "retiredPackRef": {
        "branches": [
          {
            "ref": "EntityRef"
          },
          {
            "properties": {
              "type": {}
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          }
        ]
      },
      "deploymentVersion": {
        "ref": "Version"
      },
      "retiredAt": {
        "ref": "Time"
      }
    }
  },
  "CompatibleQueryEvidence": {
    "properties": {
      "kind": {},
      "operationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "originalConnectorRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Connector"
            }
          }
        ]
      },
      "queryConnectorRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Connector"
            }
          }
        ]
      },
      "connectionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "accountRef": {
        "ref": "EntityRef"
      },
      "expiresAt": {
        "ref": "Time"
      }
    },
    "constants": {
      "kind": "CompatibleQueryEvidence"
    }
  },
  "RecordCompatibleQueryEvidencePayload": {
    "properties": {
      "evidence": {
        "ref": "CompatibleQueryEvidence"
      },
      "reviewRef": {
        "ref": "ArtifactRef"
      },
      "retention": {
        "properties": {
          "dataClass": {
            "ref": "RegisteredName"
          },
          "region": {},
          "retentionPolicyRef": {
            "ref": "EntityRef"
          }
        }
      }
    }
  },
  "MissionConditionInput": {
    "properties": {
      "successConditionRef": {
        "ref": "EntityRef"
      },
      "stopConditionRef": {
        "ref": "EntityRef"
      },
      "triggerPolicyRef": {
        "ref": "EntityRef"
      },
      "resourceEnvelopeRef": {
        "ref": "EntityRef"
      }
    }
  },
  "CreateMissionPayload": {
    "properties": {
      "goalArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "domainType": {
        "ref": "RegisteredName"
      },
      "workflowRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Workflow"
            }
          }
        ]
      },
      "conditions": {
        "ref": "MissionConditionInput"
      },
      "responsibilityScopeRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "MissionConditionRecord": {
    "properties": {
      "conditionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-conditions"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "goalRevision": {
        "ref": "Version"
      },
      "successConditionRef": {
        "ref": "EntityRef"
      },
      "stopConditionRef": {
        "ref": "EntityRef"
      },
      "triggerPolicyRef": {
        "ref": "EntityRef"
      },
      "resourceEnvelopeRef": {
        "ref": "EntityRef"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "MissionRecord": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "goalArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "goalDigest": {
        "ref": "Digest"
      },
      "goalRevision": {
        "ref": "Version"
      },
      "domainType": {
        "ref": "RegisteredName"
      },
      "workflowRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          },
          {
            "properties": {
              "kind": {}
            },
            "constants": {
              "kind": "Workflow"
            }
          }
        ]
      },
      "conditionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-conditions"
        }
      },
      "responsibilityScopeRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "status": {},
      "stopEpoch": {},
      "pauseRequested": {},
      "cleanupStatus": {},
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      },
      "createdBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      },
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-authority"
        }
      },
      "activeRunRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "businessStageRef": {
        "ref": "EntityRef"
      },
      "resultRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "ActivateMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-authority"
        }
      }
    }
  },
  "SubmitTriggerPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "triggerKey": {
        "ref": "RegisteredName"
      },
      "sourceEventRef": {
        "ref": "EntityRef"
      },
      "sourceWatermark": {},
      "kind": {}
    }
  },
  "MissionTriggerRecord": {
    "properties": {
      "triggerKey": {
        "ref": "RegisteredName"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "sourceEventRef": {
        "ref": "EntityRef"
      },
      "sourceWatermark": {},
      "kind": {},
      "disposition": {}
    }
  },
  "MissionBlockerRecord": {
    "properties": {
      "blockerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-blocker"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "blockerType": {
        "ref": "RegisteredName"
      },
      "sourceEvidenceRef": {
        "ref": "EntityRef"
      },
      "required": {},
      "resolved": {},
      "resolvedByRef": {
        "ref": "EntityRef"
      }
    }
  },
  "RefreshMissionSummaryPayload": {
    "properties": {
      "projectionType": {
        "ref": "RegisteredName"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      }
    }
  },
  "ProjectionRefreshReceipt": {
    "properties": {
      "missionRef": {
        "ref": "EntityRef"
      },
      "commandId": {
        "ref": "UUID"
      },
      "replayed": {}
    }
  },
  "PauseMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "reasonCode": {
        "ref": "RegisteredName"
      }
    }
  },
  "CancelMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "reasonCode": {
        "ref": "RegisteredName"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "ResumeMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "resolvedBlockerRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.mission-blocker"
          }
        }
      }
    }
  },
  "ReviseMissionGoalPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "goalArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "conditions": {
        "ref": "MissionConditionInput"
      },
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-authority"
        }
      }
    }
  },
  "CloseMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "resultRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "conditionEvaluationRef": {
        "ref": "EntityRef"
      },
      "outcome": {}
    }
  },
  "BlockMissionPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "blockerType": {
        "ref": "RegisteredName"
      },
      "sourceEvidenceRef": {
        "ref": "EntityRef"
      },
      "required": {}
    }
  },
  "ResolveBlockerPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "blockerRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-blocker"
        }
      },
      "resolutionEvidenceRef": {
        "ref": "EntityRef"
      }
    }
  },
  "MissionView": {
    "properties": {
      "mission": {
        "ref": "MissionRecord"
      },
      "conditions": {
        "ref": "MissionConditionRecord"
      },
      "pendingTriggers": {
        "items": {
          "ref": "MissionTriggerRecord"
        }
      },
      "blockers": {
        "items": {
          "ref": "MissionBlockerRecord"
        }
      },
      "availableActions": {
        "items": {}
      },
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "MissionListResult": {
    "properties": {
      "missions": {
        "items": {
          "ref": "MissionRecord"
        }
      },
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "RunRecord": {
    "properties": {
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "triggerKey": {
        "ref": "RegisteredName"
      },
      "goalRevision": {
        "ref": "Version"
      },
      "stopEpoch": {},
      "progressBudgetSeconds": {},
      "progressDeadline": {
        "ref": "Time"
      },
      "stopReason": {},
      "workflowRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          }
        ]
      },
      "assignmentSnapshotRef": {
        "ref": "EntityRef"
      },
      "executionMode": {},
      "status": {},
      "createdBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "StartRunPayload": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "triggerKey": {
        "ref": "RegisteredName"
      },
      "workflowRef": {
        "branches": [
          {
            "ref": "CapabilityRef"
          }
        ]
      },
      "authorityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission-authority"
        }
      },
      "executionMode": {},
      "progressBudgetSeconds": {}
    }
  },
  "StopStalledRunPayload": {
    "properties": {
      "runRef": {
        "ref": "EntityRef"
      },
      "causeRef": {
        "ref": "EntityRef"
      }
    }
  },
  "CompleteRunPayload": {
    "properties": {
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "outcome": {},
      "resultRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "CancelRunPayload": {
    "properties": {
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "reasonCode": {
        "ref": "RegisteredName"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "TaskRecord": {
    "properties": {
      "taskRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "nodeKey": {
        "ref": "RegisteredName"
      },
      "kind": {},
      "inputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "status": {},
      "required": {},
      "attemptOrdinal": {},
      "createdAt": {
        "ref": "Time"
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "RunView": {
    "properties": {
      "run": {
        "ref": "RunRecord"
      },
      "tasks": {
        "items": {
          "ref": "TaskRecord"
        }
      },
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "RunListResult": {
    "properties": {
      "runs": {
        "items": {
          "ref": "RunRecord"
        }
      },
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ToolCallInspection": {
    "properties": {
      "call": {
        "ref": "ToolCallRecord"
      },
      "trackingRef": {
        "ref": "EntityRef"
      },
      "cost": {
        "branches": [
          {
            "properties": {
              "metered": {}
            },
            "constants": {
              "metered": false
            }
          },
          {
            "properties": {
              "metered": {},
              "status": {},
              "reservationRef": {
                "properties": {
                  "type": {},
                  "id": {
                    "ref": "UUID"
                  },
                  "version": {
                    "ref": "Version"
                  }
                },
                "constants": {
                  "type": "abh.reservation"
                }
              }
            },
            "constants": {
              "metered": true
            }
          }
        ]
      },
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ContextManifest": {
    "properties": {
      "contextRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.context"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "taskRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "goalDigest": {
        "ref": "Digest"
      },
      "manifestDigest": {
        "ref": "Digest"
      },
      "inputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "executionMode": {},
      "createdAt": {
        "ref": "Time"
      }
    }
  },
  "VerificationReport": {
    "properties": {
      "reportRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.verification-report"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "taskRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "resultArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "resultDigest": {
        "ref": "Digest"
      },
      "digest": {
        "ref": "Digest"
      },
      "verdict": {},
      "verifierRef": {
        "ref": "EntityRef"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "verifiedAt": {
        "ref": "Time"
      }
    }
  },
  "SubmitVerificationPayload": {
    "properties": {
      "taskRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "resultArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "verdict": {},
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      }
    }
  },
  "ToolCapability": {
    "properties": {
      "capabilityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-capability"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "toolId": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "Version"
      },
      "effectClass": {},
      "inputSchemaRef": {
        "ref": "EntityRef"
      },
      "outputSchemaRef": {
        "ref": "EntityRef"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "implementationRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ToolBinding": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-binding"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "capabilityRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-capability"
        }
      },
      "authorizedSnapshotRef": {
        "ref": "EntityRef"
      },
      "callLimit": {},
      "deadline": {
        "ref": "Time"
      },
      "status": {}
    }
  },
  "ToolCallRecord": {
    "properties": {
      "callRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-call"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-binding"
        }
      },
      "callKey": {
        "ref": "RegisteredName"
      },
      "argumentDigest": {
        "ref": "Digest"
      },
      "resultArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "errorDigest": {
        "ref": "Digest"
      },
      "failureEvidenceRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "costReservationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.reservation"
        }
      },
      "status": {},
      "startedAt": {
        "ref": "Time"
      },
      "completedAt": {
        "ref": "Time"
      }
    }
  },
  "InvokeToolPayload": {
    "properties": {
      "bindingRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-binding"
        }
      },
      "callKey": {
        "ref": "RegisteredName"
      },
      "arguments": {},
      "targetRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "budget": {
        "properties": {
          "ledgerRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "amount": {
            "ref": "Decimal"
          },
          "expiresAt": {
            "ref": "Time"
          }
        }
      }
    }
  },
  "ToolCallResponse": {
    "properties": {
      "callRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.tool-call"
        }
      },
      "resultArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "status": {},
      "errorDigest": {
        "ref": "Digest"
      }
    }
  },
  "ModelRoute": {
    "properties": {
      "routeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.model-route"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "allowedModels": {
        "items": {
          "ref": "RegisteredName"
        }
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "dataClass": {
        "ref": "RegisteredName"
      },
      "region": {},
      "maxCostMicros": {}
    }
  },
  "ModelCallRecord": {
    "properties": {
      "callRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.model-call"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "routeRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.model-route"
        }
      },
      "selectedModel": {
        "ref": "RegisteredName"
      },
      "inputManifestRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.context"
        }
      },
      "inputDigest": {
        "ref": "Digest"
      },
      "status": {},
      "usage": {
        "properties": {
          "inputTokens": {},
          "outputTokens": {},
          "estimated": {}
        }
      },
      "createdAt": {
        "ref": "Time"
      },
      "rawResponseRef": {
        "ref": "EntityRef"
      }
    }
  },
  "ProjectionEnvelope": {
    "properties": {
      "projectionType": {
        "ref": "RegisteredName"
      },
      "subjectRef": {
        "ref": "EntityRef"
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "schemaVersion": {
        "ref": "Version"
      },
      "watermark": {},
      "stale": {},
      "data": {},
      "availableActions": {
        "items": {}
      },
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "MissionSummaryProjection": {
    "properties": {
      "missionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "goalDigest": {
        "ref": "Digest"
      },
      "domainType": {
        "ref": "RegisteredName"
      },
      "status": {
        "ref": "RegisteredName"
      },
      "goalRevision": {
        "ref": "Version"
      },
      "activeRunRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "pendingTriggerCount": {},
      "blockerCount": {},
      "businessStageRef": {
        "ref": "EntityRef"
      },
      "resultRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "CaptureSignalPayload": {
    "properties": {
      "sourceEventRef": {
        "ref": "EntityRef"
      },
      "signalType": {
        "ref": "RegisteredName"
      },
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "samplingPolicyRef": {
        "ref": "EntityRef"
      }
    }
  },
  "LearningSignalRecord": {
    "properties": {
      "signalRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.learning-signal"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "sourceEventRef": {
        "ref": "EntityRef"
      },
      "signalType": {
        "ref": "RegisteredName"
      },
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "purposeOfUse": {
        "ref": "RegisteredName"
      },
      "quality": {},
      "capturedAt": {
        "ref": "Time"
      }
    }
  },
  "BuildCasePayload": {
    "properties": {
      "signalRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "rootCauseCode": {
        "ref": "RegisteredName"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "counterEvidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "domainOwnerRef": {
        "ref": "EntityRef"
      }
    }
  },
  "LearningCaseRecord": {
    "properties": {
      "caseRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.learning-case"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "signalRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "rootCauseCode": {
        "ref": "RegisteredName"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "counterEvidenceRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "domainOwnerRef": {
        "ref": "EntityRef"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "builtBy": {
        "ref": "Actor"
      },
      "builtAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "CreateCandidatePayload": {
    "properties": {
      "caseRef": {
        "ref": "EntityRef"
      },
      "assetKind": {
        "ref": "RegisteredName"
      },
      "baseVersion": {
        "ref": "Version"
      },
      "candidateArtifactRef": {
        "ref": "EntityRef"
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "risk": {
        "ref": "RegisteredName"
      }
    }
  },
  "LearningCandidateRecord": {
    "properties": {
      "candidateRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.learning-candidate"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "caseRef": {
        "ref": "EntityRef"
      },
      "assetKind": {
        "ref": "RegisteredName"
      },
      "baseVersion": {
        "ref": "Version"
      },
      "candidateArtifactRef": {
        "ref": "EntityRef"
      },
      "scopeRef": {
        "ref": "EntityRef"
      },
      "risk": {
        "ref": "RegisteredName"
      },
      "status": {},
      "producer": {
        "ref": "Actor"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "createdAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    },
    "constants": {
      "status": "Draft"
    }
  },
  "ExpireEvaluationPayload": {
    "properties": {
      "runRef": {
        "ref": "EntityRef"
      }
    }
  },
  "LearningSignalListResult": {
    "properties": {
      "signals": {
        "items": {
          "ref": "LearningSignalRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "LearningCaseListResult": {
    "properties": {
      "cases": {
        "items": {
          "ref": "LearningCaseRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "LearningCandidateListResult": {
    "properties": {
      "candidates": {
        "items": {
          "ref": "LearningCandidateRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "EvaluationRunListResult": {
    "properties": {
      "runs": {
        "items": {
          "ref": "EvaluationRunRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "EvaluationProfileRecord": {
    "properties": {
      "profileRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.evaluation-profile"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "assetKind": {
        "ref": "RegisteredName"
      },
      "risk": {
        "ref": "RegisteredName"
      },
      "suiteRef": {
        "ref": "EntityRef"
      },
      "datasetSnapshotRef": {
        "ref": "EntityRef"
      },
      "evaluatorRef": {
        "ref": "EntityRef"
      },
      "metricThresholdRef": {
        "ref": "EntityRef"
      },
      "metricThresholds": {
        "items": {
          "ref": "EvaluationMetricThreshold"
        }
      },
      "stoppingRuleRef": {
        "ref": "EntityRef"
      },
      "assignmentUnit": {
        "ref": "RegisteredName"
      },
      "minimumSamples": {},
      "confidenceLevel": {},
      "minimumRelativeLift": {},
      "approvedBy": {
        "ref": "Actor"
      },
      "approvedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "RequestEvaluationPayload": {
    "properties": {
      "candidateRef": {
        "ref": "EntityRef"
      },
      "baselineRef": {
        "ref": "EntityRef"
      }
    }
  },
  "RetryEvaluationPayload": {
    "properties": {
      "runRef": {
        "ref": "EntityRef"
      }
    }
  },
  "EvaluationRunRecord": {
    "properties": {
      "runRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.evaluation-run"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "candidateRef": {
        "ref": "EntityRef"
      },
      "profileRef": {
        "ref": "EntityRef"
      },
      "baselineRef": {
        "ref": "EntityRef"
      },
      "retryOfRef": {
        "ref": "EntityRef"
      },
      "assignmentUnit": {
        "ref": "RegisteredName"
      },
      "seed": {},
      "executionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "status": {},
      "requestedBy": {
        "ref": "Actor"
      },
      "resultRef": {
        "ref": "EntityRef"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "createdAt": {
        "ref": "Time"
      },
      "expiresAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "EvaluationMetricValue": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "value": {}
    }
  },
  "EvaluationMetricThreshold": {
    "properties": {
      "name": {
        "ref": "RegisteredName"
      },
      "minimum": {}
    }
  },
  "SubmitEvaluationResultPayload": {
    "properties": {
      "runRef": {
        "ref": "EntityRef"
      },
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "executionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "metricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "completedSamples": {},
      "failedSamples": {},
      "baselineMetricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "baselineCompletedSamples": {},
      "baselineFailedSamples": {},
      "dataDigest": {
        "ref": "Digest"
      },
      "evaluatorPrincipal": {
        "ref": "EntityRef"
      }
    }
  },
  "EvaluationResultRecord": {
    "properties": {
      "resultRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.evaluation-result"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "runRef": {
        "ref": "EntityRef"
      },
      "candidateRef": {
        "ref": "EntityRef"
      },
      "profileRef": {
        "ref": "EntityRef"
      },
      "status": {},
      "artifactRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "executionRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "metricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "completedSamples": {},
      "failedSamples": {},
      "baselineMetricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "baselineCompletedSamples": {},
      "baselineFailedSamples": {},
      "dataDigest": {
        "ref": "Digest"
      },
      "evaluatorPrincipal": {
        "ref": "EntityRef"
      },
      "receiptRef": {
        "ref": "CommandRef"
      },
      "submittedAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "EvaluationGateFinding": {
    "properties": {
      "metric": {
        "ref": "RegisteredName"
      },
      "actual": {},
      "minimum": {},
      "outcome": {},
      "lowerBound": {},
      "baseline": {},
      "baselineLowerBound": {},
      "relativeLift": {},
      "lowerRelativeLift": {}
    }
  },
  "EvaluationUncertainty": {
    "properties": {
      "metric": {
        "ref": "RegisteredName"
      },
      "method": {},
      "confidenceLevel": {},
      "estimate": {},
      "lowerBound": {},
      "upperBound": {},
      "sampleCount": {}
    },
    "constants": {
      "method": "WilsonScore"
    }
  },
  "EvaluationGateLimitation": {
    "properties": {
      "code": {
        "ref": "RegisteredName"
      },
      "detail": {}
    }
  },
  "BuildGatePayload": {
    "properties": {
      "candidateRef": {
        "ref": "EntityRef"
      },
      "evaluationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      }
    }
  },
  "EvaluationGateArtifactRecord": {
    "properties": {
      "gateRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.learning-gate"
        }
      },
      "resourceOrganizationId": {
        "ref": "UUID"
      },
      "candidateRef": {
        "ref": "EntityRef"
      },
      "profileRef": {
        "ref": "EntityRef"
      },
      "evaluationRefs": {
        "items": {
          "ref": "EntityRef"
        },
        "set": true
      },
      "metricThresholds": {
        "items": {
          "ref": "EvaluationMetricThreshold"
        }
      },
      "metricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "baselineMetricValues": {
        "items": {
          "ref": "EvaluationMetricValue"
        }
      },
      "uncertainty": {
        "items": {
          "ref": "EvaluationUncertainty"
        }
      },
      "limitations": {
        "items": {
          "ref": "EvaluationGateLimitation"
        }
      },
      "findings": {
        "items": {
          "ref": "EvaluationGateFinding"
        }
      },
      "verdict": {},
      "signedBy": {
        "ref": "Actor"
      },
      "createdAt": {
        "ref": "Time"
      },
      "digest": {
        "ref": "Digest"
      }
    }
  },
  "LearningGateListResult": {
    "properties": {
      "gates": {
        "items": {
          "ref": "EvaluationGateArtifactRecord"
        }
      },
      "counts": {},
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ConfigureLearningReleasePayload": {
    "properties": {
      "candidateRef": {
        "ref": "EntityRef"
      },
      "gateRef": {
        "ref": "EntityRef"
      },
      "release": {
        "ref": "ReleaseRecord"
      },
      "assignment": {
        "ref": "StaticAssignmentRecord"
      },
      "purposeNames": {
        "ref": "LifecyclePurposeNames"
      }
    }
  },
  "AgentTaskContract": {
    "properties": {
      "goalArtifactRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "inputRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "definitionRef": {
        "ref": "EntityRef"
      },
      "outputSchemaRef": {
        "ref": "EntityRef"
      },
      "acceptanceRef": {
        "ref": "EntityRef"
      },
      "modelRouteRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.model-route"
        }
      },
      "toolBindingRefs": {
        "items": {
          "properties": {
            "type": {},
            "id": {
              "ref": "UUID"
            },
            "version": {
              "ref": "Version"
            }
          },
          "constants": {
            "type": "abh.tool-binding"
          }
        }
      },
      "maxTurns": {},
      "maxTokens": {},
      "maxCostMicros": {},
      "deadline": {
        "ref": "Time"
      },
      "contextDigest": {
        "ref": "Digest"
      }
    }
  },
  "RuntimeEvent": {
    "properties": {
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "sequence": {},
      "occurredAt": {
        "ref": "Time"
      },
      "kind": {},
      "payloadRef": {
        "ref": "EntityRef"
      },
      "stopReason": {}
    }
  },
  "ProjectionQueryResult": {
    "properties": {
      "projection": {
        "ref": "ProjectionEnvelope"
      },
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ProjectionListResult": {
    "properties": {
      "projections": {
        "items": {
          "ref": "ProjectionEnvelope"
        }
      },
      "cursor": {},
      "asOf": {
        "ref": "Time"
      }
    }
  },
  "ProjectionChangedEvent": {
    "properties": {
      "subjectRef": {
        "ref": "EntityRef"
      },
      "projectionType": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "Version"
      },
      "watermark": {},
      "occurredAt": {
        "ref": "Time"
      }
    }
  },
  "ActionTimelineProjection": {
    "properties": {
      "actionRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "intentSummary": {},
      "approvalStatus": {},
      "operationSummaries": {
        "items": {}
      },
      "unknownCount": {},
      "compensationRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "ResponsibilityInboxProjection": {
    "properties": {
      "requestRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "responsibilityKind": {
        "ref": "RegisteredName"
      },
      "assigneeRef": {
        "ref": "EntityRef"
      },
      "impactSummary": {},
      "deadline": {
        "ref": "Time"
      },
      "evidenceRefs": {
        "items": {
          "ref": "EntityRef"
        }
      },
      "availableResponses": {
        "items": {}
      },
      "updatedAt": {
        "ref": "Time"
      }
    }
  },
  "InvocationHandle": {
    "properties": {
      "invocationRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "lastEventSequence": {},
      "runtimeStatus": {},
      "stopReason": {},
      "usageRef": {
        "ref": "EntityRef"
      }
    }
  },
  "BuildMissionSummaryPayload": {
    "properties": {
      "subjectRef": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          },
          "version": {
            "ref": "Version"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      }
    }
  },
  "ResolvedDevelopmentConfig": {
    "properties": {
      "deployment": {
        "properties": {
          "profile": {}
        },
        "constants": {
          "profile": "Development"
        }
      },
      "identity": {
        "properties": {
          "provider": {}
        },
        "constants": {
          "provider": "Fake"
        }
      },
      "database": {
        "properties": {
          "runtimeUrlRef": {},
          "queueUrlRef": {},
          "statementTimeoutMs": {},
          "lockTimeoutMs": {}
        }
      },
      "runtime": {
        "properties": {
          "businessEntry": {},
          "mode": {},
          "action": {
            "properties": {
              "maxOperations": {},
              "maxDependencies": {},
              "intentExpirySeconds": {}
            }
          },
          "queue": {
            "properties": {
              "publishBatch": {},
              "pollIntervalMs": {}
            }
          },
          "reconciliation": {
            "properties": {
              "initialDelaySeconds": {},
              "maxDelaySeconds": {}
            }
          }
        },
        "constants": {
          "mode": "ActionOnly"
        }
      },
      "web": {
        "properties": {
          "enabled": {}
        },
        "constants": {
          "enabled": false
        }
      },
      "observability": {
        "properties": {
          "projectTelemetry": {}
        },
        "constants": {
          "projectTelemetry": false
        }
      }
    }
  },
  "CreateMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CreateMissionPayload"
      }
    },
    "constants": {
      "type": "abh.missions.create",
      "schemaVersion": "0.1.0"
    }
  },
  "CreateMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CreateMissionPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ActivateMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ActivateMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.activate",
      "schemaVersion": "0.1.0"
    }
  },
  "ActivateMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ActivateMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "SubmitTriggerCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "SubmitTriggerPayload"
      }
    },
    "constants": {
      "type": "abh.missions.submit-trigger",
      "schemaVersion": "0.1.0"
    }
  },
  "SubmitTriggerHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "SubmitTriggerPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "PauseMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "PauseMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.pause",
      "schemaVersion": "0.1.0"
    }
  },
  "PauseMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "PauseMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CancelMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "CancelMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.cancel",
      "schemaVersion": "0.1.0"
    }
  },
  "CancelMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "CancelMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ResumeMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ResumeMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.resume",
      "schemaVersion": "0.1.0"
    }
  },
  "ResumeMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ResumeMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ReviseMissionGoalCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ReviseMissionGoalPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.revise-goal",
      "schemaVersion": "0.1.0"
    }
  },
  "ReviseMissionGoalHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ReviseMissionGoalPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CloseMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "CloseMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.close",
      "schemaVersion": "0.1.0"
    }
  },
  "CloseMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "CloseMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "BlockMissionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "BlockMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.block",
      "schemaVersion": "0.1.0"
    }
  },
  "BlockMissionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "BlockMissionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ResolveBlockerCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ResolveBlockerPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.missions.resolve-blocker",
      "schemaVersion": "0.1.0"
    }
  },
  "ResolveBlockerHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "ResolveBlockerPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "FailPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "FailPackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.fail",
      "schemaVersion": "0.1.0"
    }
  },
  "FailLostPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "FailLostPackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.fail-lost-lease",
      "schemaVersion": "0.1.0"
    }
  },
  "AcceptPackInspectionDeliveryCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "AcceptPackInspectionDeliveryPayload"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.accept-delivery",
      "schemaVersion": "0.1.0"
    }
  },
  "CancelPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "CancelPackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.cancel",
      "schemaVersion": "0.1.0"
    }
  },
  "WaitPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "WaitPackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.wait",
      "schemaVersion": "0.1.0"
    }
  },
  "CompletePackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "CompletePackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.complete",
      "schemaVersion": "0.1.0"
    }
  },
  "ExpirePackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "ExpirePackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.expire",
      "schemaVersion": "0.1.0"
    }
  },
  "StartPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job"
        }
      },
      "payload": {
        "ref": "StartPackInspectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.pack-inspection-jobs.start",
      "schemaVersion": "0.1.0"
    }
  },
  "RequestPackInspectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RequestPackInspectionPayload"
      }
    },
    "constants": {
      "type": "abh.packs.request-inspection",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordPackDataImpactCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RecordPackDataImpactPayload"
      }
    },
    "constants": {
      "type": "abh.packs.record-data-impact",
      "schemaVersion": "0.1.0"
    }
  },
  "RegisterPackCapabilitiesCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RegisterPackCapabilitiesPayload"
      }
    },
    "constants": {
      "type": "abh.packs.register-capabilities",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordCompatibleQueryEvidenceCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RecordCompatibleQueryEvidencePayload"
      }
    },
    "constants": {
      "type": "abh.operations.record-compatible-query-evidence",
      "schemaVersion": "0.1.0"
    }
  },
  "RetirePackCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RetirePackPayload"
      }
    },
    "constants": {
      "type": "abh.packs.retire",
      "schemaVersion": "0.1.0"
    }
  },
  "SuspendPackCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "SuspendPackPayload"
      }
    },
    "constants": {
      "type": "abh.packs.suspend",
      "schemaVersion": "0.1.0"
    }
  },
  "EnablePackCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "EnablePackPayload"
      }
    },
    "constants": {
      "type": "abh.packs.enable",
      "schemaVersion": "0.1.0"
    }
  },
  "RequestPackEnableCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RequestPackEnablePayload"
      }
    },
    "constants": {
      "type": "abh.packs.request-enable",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordPackConformanceCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RecordPackConformancePayload"
      }
    },
    "constants": {
      "type": "abh.packs.record-conformance",
      "schemaVersion": "0.1.0"
    }
  },
  "StagePackCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "StagePackPayload"
      }
    },
    "constants": {
      "type": "abh.packs.stage",
      "schemaVersion": "0.1.0"
    }
  },
  "PublishPackTrustPolicyCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "PublishPackTrustPolicyPayload"
      }
    },
    "constants": {
      "type": "abh.packs.publish-trust-policy",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordPackValidationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RecordPackValidationPayload"
      }
    },
    "constants": {
      "type": "abh.packs.record-validation",
      "schemaVersion": "0.1.0"
    }
  },
  "ReviseResponsibilityRouteCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "ReviseResponsibilityRoutePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.revise-route",
      "schemaVersion": "0.1.0"
    }
  },
  "DelegateResponsibilitySlotCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "ReviseResponsibilityRoutePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.delegate-slot",
      "schemaVersion": "0.1.0"
    }
  },
  "EscalateResponsibilitySlotCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "ReviseResponsibilityRoutePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.escalate-slot",
      "schemaVersion": "0.1.0"
    }
  },
  "RevokeResponsibilityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "payload": {
        "ref": "RevokeResponsibilityPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibilities.revoke",
      "schemaVersion": "0.1.0"
    }
  },
  "ExpireResponsibilityRequestCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "RequestRef"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.expire",
      "schemaVersion": "0.1.0"
    }
  },
  "RetryResponsibilityRouteCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "OpenResponsibilityRequestPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.retry-route",
      "schemaVersion": "0.1.0"
    }
  },
  "OpenTerminalExceptionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.reconciliation"
        }
      },
      "payload": {
        "ref": "OpenTerminalExceptionPayload"
      }
    },
    "constants": {
      "type": "abh.exceptions.open-terminal",
      "schemaVersion": "0.1.0"
    }
  },
  "ResolveExceptionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "payload": {
        "ref": "ResolveExceptionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.exceptions.resolve",
      "schemaVersion": "0.1.0"
    }
  },
  "ResolveExceptionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.exception"
        }
      },
      "payload": {
        "ref": "ResolveExceptionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ApplyExceptionResolutionEffectCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "payload": {
        "ref": "ApplyExceptionResolutionEffectPayload"
      }
    },
    "constants": {
      "type": "abh.exceptions.apply-resolution-effect",
      "schemaVersion": "0.1.0"
    }
  },
  "ApplyExceptionResolutionEffectHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.exception-resolution"
        }
      },
      "payload": {
        "ref": "ApplyExceptionResolutionEffectPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ProposeCorrectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "payload": {
        "ref": "ProposeCorrectionPayload"
      }
    },
    "constants": {
      "type": "abh.corrections.propose",
      "schemaVersion": "0.1.0"
    }
  },
  "ProposeCorrectionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "payload": {
        "ref": "ProposeCorrectionPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ApplyCorrectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "payload": {
        "ref": "ApplyCorrectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.corrections.apply",
      "schemaVersion": "0.1.0"
    }
  },
  "ApplyCorrectionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.correction"
        }
      },
      "payload": {
        "ref": "ApplyCorrectionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CreateScopeAuthorityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "payload": {
        "ref": "CreateScopeAuthorityPayload"
      }
    },
    "constants": {
      "type": "abh.execution-authority.create",
      "schemaVersion": "0.1.0"
    }
  },
  "EvaluateScopeAuthorityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.principal"
        }
      },
      "payload": {
        "ref": "ScopeAuthorityDraft"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.execution-authority.evaluate-scope",
      "schemaVersion": "0.1.0"
    }
  },
  "CaptureQueryCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "CaptureQueryPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.capture-query",
      "schemaVersion": "0.1.0"
    }
  },
  "ClaimQueryExitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "ClaimQueryExitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.claim-query-exit",
      "schemaVersion": "0.1.0"
    }
  },
  "NotifyOperationWaitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation-wait"
        }
      },
      "payload": {
        "ref": "NotifyOperationWaitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.notify-wait",
      "schemaVersion": "0.1.0"
    }
  },
  "ExecuteWaitPortCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "payload": {
        "ref": "ExecuteWaitPortPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.execute-wait-port",
      "schemaVersion": "0.1.0"
    }
  },
  "NotifyActionWaitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action-wait"
        }
      },
      "payload": {
        "ref": "NotifyActionWaitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.notify-wait",
      "schemaVersion": "0.1.0"
    }
  },
  "RegisterDurableWaitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "payload": {
        "ref": "RegisterDurableWaitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.register-wait",
      "schemaVersion": "0.1.0"
    }
  },
  "RecheckDurableWaitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "payload": {
        "ref": "RecheckDurableWaitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.recheck-wait",
      "schemaVersion": "0.1.0"
    }
  },
  "CancelDurableWaitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.durable-wait"
        }
      },
      "payload": {
        "ref": "CancelDurableWaitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.cancel-wait",
      "schemaVersion": "0.1.0"
    }
  },
  "PrepareOutboxCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      },
      "payload": {
        "ref": "PrepareOutboxPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.prepare-outbox",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordOutboxConsumptionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "payload": {
        "ref": "RecordOutboxConsumptionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.record-outbox-consumption",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordOutboxDeliveryCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.outbox-routing"
        }
      },
      "payload": {
        "ref": "RecordOutboxDeliveryPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.record-outbox-delivery",
      "schemaVersion": "0.1.0"
    }
  },
  "ConsumeEventCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.event"
        }
      },
      "payload": {
        "ref": "ConsumeEventPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runtime.consume-event",
      "schemaVersion": "0.1.0"
    }
  },
  "BuildMissionSummaryCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "BuildMissionSummaryPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.projections.build-mission-summary",
      "schemaVersion": "0.1.0"
    }
  },
  "RefreshMissionSummaryCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "RefreshMissionSummaryPayload"
      }
    },
    "constants": {
      "type": "abh.projections.refresh-mission-summary",
      "schemaVersion": "0.1.0"
    }
  },
  "RefreshMissionSummaryHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "RefreshMissionSummaryPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RefreshActionAuthorizationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "RefreshActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.refresh-authorization",
      "schemaVersion": "0.1.0"
    }
  },
  "CleanupActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "CleanupActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.cleanup",
      "schemaVersion": "0.1.0"
    }
  },
  "AggregateActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "AggregateActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.aggregate",
      "schemaVersion": "0.1.0"
    }
  },
  "RecoverOperationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "RecoverOperationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.recover",
      "schemaVersion": "0.1.0"
    }
  },
  "ApplyReconciliationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "ApplyReconciliationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.apply-reconciliation",
      "schemaVersion": "0.1.0"
    }
  },
  "CompareOperationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "CompareOperationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.reconcile",
      "schemaVersion": "0.1.0"
    }
  },
  "CaptureTransportCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "CaptureTransportPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.capture-transport",
      "schemaVersion": "0.1.0"
    }
  },
  "RecordOperationReceiptCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "RecordOperationReceiptPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.record-receipt",
      "schemaVersion": "0.1.0"
    }
  },
  "ClaimDispatchExitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit"
        }
      },
      "payload": {
        "ref": "ClaimDispatchExitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.claim-exit",
      "schemaVersion": "0.1.0"
    }
  },
  "IssueDispatchPermitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "IssueDispatchPermitPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.issue-permit",
      "schemaVersion": "0.1.0"
    }
  },
  "SafeRetryOperationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.operation"
        }
      },
      "payload": {
        "ref": "SafeRetryOperationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.operations.safe-retry",
      "schemaVersion": "0.1.0"
    }
  },
  "ProposeActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ProposeActionPayload"
      }
    },
    "constants": {
      "type": "abh.actions.propose",
      "schemaVersion": "0.1.0"
    }
  },
  "ProposeActionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ProposeActionPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "StartSafetyStopCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ProposeSafetyStopPayload"
      }
    },
    "constants": {
      "type": "abh.actions.start-safety-stop",
      "schemaVersion": "0.1.0"
    }
  },
  "StartSafetyStopHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ProposeSafetyStopPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CancelActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "CancelActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.cancel",
      "schemaVersion": "0.1.0"
    }
  },
  "CancelActionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "CancelActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RequestAuthorizationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "RequestAuthorizationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.request-authorization",
      "schemaVersion": "0.1.0"
    }
  },
  "RequestAuthorizationHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "RequestAuthorizationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "SubmitDecisionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.decision"
        }
      },
      "payload": {
        "ref": "SubmitDecisionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.decisions.submit",
      "schemaVersion": "0.1.0"
    }
  },
  "SubmitDecisionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.decision"
        }
      },
      "payload": {
        "ref": "SubmitDecisionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "WithdrawDecisionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.decision"
        }
      },
      "payload": {
        "ref": "WithdrawDecisionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.decisions.withdraw",
      "schemaVersion": "0.1.0"
    }
  },
  "WithdrawDecisionHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.decision"
        }
      },
      "payload": {
        "ref": "WithdrawDecisionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "ValidateActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "ValidateActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.validate",
      "schemaVersion": "0.1.0"
    }
  },
  "RegisterOperationPlanCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "RegisterOperationPlanPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.register-plan",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureLedgerCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.ledger"
        }
      },
      "payload": {
        "ref": "ConfigureLedgerPayload"
      }
    },
    "constants": {
      "type": "abh.ledgers.configure",
      "schemaVersion": "0.1.0"
    }
  },
  "RegisterLedgerUnitCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.unit"
        }
      },
      "payload": {
        "ref": "RegisterLedgerUnitPayload"
      }
    },
    "constants": {
      "type": "abh.ledger-units.register",
      "schemaVersion": "0.1.0"
    }
  },
  "RegisterLedgerPeriodCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.period"
        }
      },
      "payload": {
        "ref": "RegisterLedgerPeriodPayload"
      }
    },
    "constants": {
      "type": "abh.ledger-periods.register",
      "schemaVersion": "0.1.0"
    }
  },
  "ApplyLedgerCorrectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.ledger-correction"
        }
      },
      "payload": {
        "ref": "ApplyLedgerCorrectionPayload"
      }
    },
    "constants": {
      "type": "abh.ledger-corrections.apply",
      "schemaVersion": "0.1.0"
    }
  },
  "ReserveAllCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.reservation"
        }
      },
      "payload": {
        "ref": "ReserveAllPayload"
      }
    },
    "constants": {
      "type": "abh.reservations.reserve",
      "schemaVersion": "0.1.0"
    }
  },
  "ConsumeReservationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.reservation"
        }
      },
      "payload": {
        "ref": "ConsumeReservationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.reservations.consume",
      "schemaVersion": "0.1.0"
    }
  },
  "ReleaseReservationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.reservation"
        }
      },
      "payload": {
        "ref": "ReleaseReservationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.reservations.release",
      "schemaVersion": "0.1.0"
    }
  },
  "RevokeGrantCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.grant"
        }
      },
      "payload": {
        "ref": "RevokeGrantPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.grants.revoke",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureStaticReleaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "payload": {
        "ref": "ConfigureStaticReleasePayload"
      }
    },
    "constants": {
      "type": "abh.releases.configure-static",
      "schemaVersion": "0.1.0"
    }
  },
  "ResolveStaticPinsCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.pin-set"
        }
      },
      "payload": {
        "ref": "ResolveStaticPinsPayload"
      }
    },
    "constants": {
      "type": "abh.releases.resolve-pins",
      "schemaVersion": "0.1.0"
    }
  },
  "StopStaticAssignmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "payload": {
        "ref": "StopStaticAssignmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.assignments.pause",
      "schemaVersion": "0.1.0"
    }
  },
  "StopStaticAssignmentHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "payload": {
        "ref": "StopStaticAssignmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RollbackStaticAssignmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "payload": {
        "ref": "RollbackStaticAssignmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.assignments.rollback",
      "schemaVersion": "0.1.0"
    }
  },
  "RollbackStaticAssignmentHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.assignment"
        }
      },
      "payload": {
        "ref": "RollbackStaticAssignmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "StoreInlineArtifactCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "StoreInlineArtifactPayload"
      }
    },
    "constants": {
      "type": "abh.artifacts.store-inline",
      "schemaVersion": "0.1.0"
    }
  },
  "StoreInlineArtifactHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "StoreInlineArtifactPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "TombstoneArtifactCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.artifact"
        }
      },
      "payload": {
        "ref": "TombstoneArtifactPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.artifacts.tombstone",
      "schemaVersion": "0.1.0"
    }
  },
  "OpenCommitmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "payload": {
        "ref": "OpenCommitmentPayload"
      }
    },
    "constants": {
      "type": "abh.commitments.open",
      "schemaVersion": "0.1.0"
    }
  },
  "SettleCommitmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "payload": {
        "ref": "SettleCommitmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.commitments.settle",
      "schemaVersion": "0.1.0"
    }
  },
  "AdjustCommitmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "payload": {
        "ref": "AdjustCommitmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.commitments.adjust",
      "schemaVersion": "0.1.0"
    }
  },
  "BeginCloseCommitmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "payload": {
        "ref": "BeginCloseCommitmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.commitments.begin-close",
      "schemaVersion": "0.1.0"
    }
  },
  "CloseCommitmentCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.commitment"
        }
      },
      "payload": {
        "ref": "CloseCommitmentPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.commitments.close",
      "schemaVersion": "0.1.0"
    }
  },
  "AssignResponsibilityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment"
        }
      },
      "payload": {
        "ref": "AssignResponsibilityPayload"
      }
    },
    "constants": {
      "type": "abh.responsibilities.assign",
      "schemaVersion": "0.1.0"
    }
  },
  "OpenResponsibilityRequestCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.responsibility-request"
        }
      },
      "payload": {
        "ref": "OpenResponsibilityRequestPayload"
      }
    },
    "constants": {
      "type": "abh.responsibility-requests.open",
      "schemaVersion": "0.1.0"
    }
  },
  "IssueExecutionAuthorityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "payload": {
        "ref": "IssueExecutionAuthorityPayload"
      }
    },
    "constants": {
      "type": "abh.execution-authority.issue-effect",
      "schemaVersion": "0.1.0"
    }
  },
  "RevokeExecutionAuthorityCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.execution-authority"
        }
      },
      "payload": {
        "ref": "RevokeExecutionAuthorityPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.execution-authority.revoke",
      "schemaVersion": "0.1.0"
    }
  },
  "PinActionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.action"
        }
      },
      "payload": {
        "ref": "PinActionPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.actions.pin",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigurePolicyCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.policy-version"
        }
      },
      "payload": {
        "ref": "ConfigurePolicyPayload"
      }
    },
    "constants": {
      "type": "abh.policies.configure",
      "schemaVersion": "0.1.0"
    }
  },
  "ActivateMandatoryPolicyCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ActivateMandatoryPolicyPayload"
      }
    },
    "constants": {
      "type": "abh.policies.activate-mandatory",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureResourceEnvelopeCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.resource-envelope"
        }
      },
      "payload": {
        "ref": "ConfigureResourceEnvelopePayload"
      }
    },
    "constants": {
      "type": "abh.resource-envelopes.configure",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigurePurposeCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.purpose"
        }
      },
      "payload": {
        "ref": "ConfigurePurposePayload"
      }
    },
    "constants": {
      "type": "abh.purposes.configure",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureConnectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "payload": {
        "ref": "ConfigureConnectionPayload"
      }
    },
    "constants": {
      "type": "abh.connections.configure",
      "schemaVersion": "0.1.0"
    }
  },
  "RevokePurposeCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.purpose"
        }
      },
      "payload": {
        "ref": "RevokeDirectoryRecordPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.purposes.revoke",
      "schemaVersion": "0.1.0"
    }
  },
  "RevokeConnectionCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.connection"
        }
      },
      "payload": {
        "ref": "RevokeDirectoryRecordPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.connections.revoke",
      "schemaVersion": "0.1.0"
    }
  },
  "ClaimWorkLeaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "ClaimWorkLeasePayload"
      }
    },
    "constants": {
      "type": "abh.work-leases.claim",
      "schemaVersion": "0.1.0"
    }
  },
  "RenewWorkLeaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "payload": {
        "ref": "RenewWorkLeasePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.work-leases.renew",
      "schemaVersion": "0.1.0"
    }
  },
  "ReleaseWorkLeaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.work-lease"
        }
      },
      "payload": {
        "ref": "ReleaseWorkLeasePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.work-leases.release",
      "schemaVersion": "0.1.0"
    }
  },
  "StartRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "StartRunPayload"
      }
    },
    "constants": {
      "type": "abh.runs.start",
      "schemaVersion": "0.1.0"
    }
  },
  "StartRunHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.mission"
        }
      },
      "payload": {
        "ref": "StartRunPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CompleteRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "CompleteRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runs.complete",
      "schemaVersion": "0.1.0"
    }
  },
  "CompleteRunHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "CompleteRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CancelRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "CancelRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runs.cancel",
      "schemaVersion": "0.1.0"
    }
  },
  "CancelRunHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "CancelRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RecoverRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "RecoverRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runs.recover",
      "schemaVersion": "0.1.0"
    }
  },
  "StopStalledRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "StopStalledRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runs.stop-stalled",
      "schemaVersion": "0.1.0"
    }
  },
  "WakeRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "WakeRunPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.runs.wake",
      "schemaVersion": "0.1.0"
    }
  },
  "ProposeGraphPatchCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.run"
        }
      },
      "payload": {
        "ref": "ProposeGraphPatchPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.graph-patches.propose",
      "schemaVersion": "0.1.0"
    }
  },
  "ClaimTaskCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "payload": {
        "ref": "ClaimTaskPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.tasks.claim",
      "schemaVersion": "0.1.0"
    }
  },
  "PrepareInvocationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "payload": {
        "ref": "PrepareInvocationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.invocations.prepare",
      "schemaVersion": "0.1.0"
    }
  },
  "FinalizeInvocationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "payload": {
        "ref": "FinalizeInvocationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.invocations.finalize",
      "schemaVersion": "0.1.0"
    }
  },
  "CompleteInvocationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "payload": {
        "ref": "CompleteInvocationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.invocations.complete",
      "schemaVersion": "0.1.0"
    }
  },
  "ObserveLateInvocationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.invocation"
        }
      },
      "payload": {
        "ref": "ObserveLateInvocationPayload"
      }
    },
    "constants": {
      "type": "abh.invocations.observe-late",
      "schemaVersion": "0.1.0"
    }
  },
  "CommitVerifiedTaskCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "payload": {
        "ref": "CommitVerifiedTaskPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.tasks.commit-verified",
      "schemaVersion": "0.1.0"
    }
  },
  "SubmitVerificationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "payload": {
        "ref": "SubmitVerificationPayload"
      }
    },
    "constants": {
      "type": "abh.verification.submit",
      "schemaVersion": "0.1.0"
    }
  },
  "SubmitVerificationHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.task"
        }
      },
      "payload": {
        "ref": "SubmitVerificationPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "InvokeToolCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.tool-binding"
        }
      },
      "payload": {
        "ref": "InvokeToolPayload"
      }
    },
    "constants": {
      "type": "abh.tools.invoke",
      "schemaVersion": "0.1.0"
    }
  },
  "InvokeToolHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.tool-binding"
        }
      },
      "payload": {
        "ref": "InvokeToolPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CaptureSignalCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CaptureSignalPayload"
      }
    },
    "constants": {
      "type": "abh.learning.capture-signal",
      "schemaVersion": "0.1.0"
    }
  },
  "CaptureSignalHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CaptureSignalPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "BuildCaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "BuildCasePayload"
      }
    },
    "constants": {
      "type": "abh.learning.build-case",
      "schemaVersion": "0.1.0"
    }
  },
  "BuildCaseHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "BuildCasePayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CreateCandidateCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CreateCandidatePayload"
      }
    },
    "constants": {
      "type": "abh.learning.create-candidate",
      "schemaVersion": "0.1.0"
    }
  },
  "CreateCandidateHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "CreateCandidatePayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RequestEvaluationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RequestEvaluationPayload"
      }
    },
    "constants": {
      "type": "abh.learning.request-evaluation",
      "schemaVersion": "0.1.0"
    }
  },
  "RequestEvaluationHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RequestEvaluationPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "RetryEvaluationCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RetryEvaluationPayload"
      }
    },
    "constants": {
      "type": "abh.learning.retry-evaluation",
      "schemaVersion": "0.1.0"
    }
  },
  "RetryEvaluationHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.organization"
        }
      },
      "payload": {
        "ref": "RetryEvaluationPayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "SubmitEvaluationResultCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.evaluation-run"
        }
      },
      "payload": {
        "ref": "SubmitEvaluationResultPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.learning.submit-evaluation-result",
      "schemaVersion": "0.1.0"
    }
  },
  "ExpireEvaluationRunCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.evaluation-run"
        }
      },
      "payload": {
        "ref": "ExpireEvaluationPayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.learning.expire-evaluation",
      "schemaVersion": "0.1.0"
    }
  },
  "BuildGateCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.learning-candidate"
        }
      },
      "payload": {
        "ref": "BuildGatePayload"
      },
      "expectedVersion": {
        "ref": "Version"
      }
    },
    "constants": {
      "type": "abh.learning.build-gate",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureLearningCandidateReleaseCommand": {
    "properties": {
      "type": {},
      "schemaVersion": {},
      "commandId": {
        "ref": "UUID"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      },
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "payload": {
        "ref": "ConfigureLearningReleasePayload"
      }
    },
    "constants": {
      "type": "abh.releases.configure-learning-candidate",
      "schemaVersion": "0.1.0"
    }
  },
  "ConfigureLearningCandidateReleaseHttpRequest": {
    "properties": {
      "target": {
        "properties": {
          "type": {},
          "id": {
            "ref": "UUID"
          }
        },
        "constants": {
          "type": "abh.release"
        }
      },
      "payload": {
        "ref": "ConfigureLearningReleasePayload"
      },
      "idempotencyKey": {
        "ref": "IdempotencyKey"
      }
    }
  },
  "CommandEnvelope": {
    "branches": [
      {
        "ref": "CreateMissionCommand"
      },
      {
        "ref": "ActivateMissionCommand"
      },
      {
        "ref": "SubmitTriggerCommand"
      },
      {
        "ref": "PauseMissionCommand"
      },
      {
        "ref": "CancelMissionCommand"
      },
      {
        "ref": "ResumeMissionCommand"
      },
      {
        "ref": "ReviseMissionGoalCommand"
      },
      {
        "ref": "CloseMissionCommand"
      },
      {
        "ref": "BlockMissionCommand"
      },
      {
        "ref": "ResolveBlockerCommand"
      },
      {
        "ref": "FailPackInspectionCommand"
      },
      {
        "ref": "FailLostPackInspectionCommand"
      },
      {
        "ref": "AcceptPackInspectionDeliveryCommand"
      },
      {
        "ref": "CancelPackInspectionCommand"
      },
      {
        "ref": "WaitPackInspectionCommand"
      },
      {
        "ref": "CompletePackInspectionCommand"
      },
      {
        "ref": "ExpirePackInspectionCommand"
      },
      {
        "ref": "StartPackInspectionCommand"
      },
      {
        "ref": "RequestPackInspectionCommand"
      },
      {
        "ref": "RecordPackDataImpactCommand"
      },
      {
        "ref": "RegisterPackCapabilitiesCommand"
      },
      {
        "ref": "RecordCompatibleQueryEvidenceCommand"
      },
      {
        "ref": "RetirePackCommand"
      },
      {
        "ref": "SuspendPackCommand"
      },
      {
        "ref": "EnablePackCommand"
      },
      {
        "ref": "RequestPackEnableCommand"
      },
      {
        "ref": "RecordPackConformanceCommand"
      },
      {
        "ref": "StagePackCommand"
      },
      {
        "ref": "PublishPackTrustPolicyCommand"
      },
      {
        "ref": "RecordPackValidationCommand"
      },
      {
        "ref": "ReviseResponsibilityRouteCommand"
      },
      {
        "ref": "DelegateResponsibilitySlotCommand"
      },
      {
        "ref": "EscalateResponsibilitySlotCommand"
      },
      {
        "ref": "RevokeResponsibilityCommand"
      },
      {
        "ref": "ExpireResponsibilityRequestCommand"
      },
      {
        "ref": "RetryResponsibilityRouteCommand"
      },
      {
        "ref": "OpenTerminalExceptionCommand"
      },
      {
        "ref": "ResolveExceptionCommand"
      },
      {
        "ref": "ApplyExceptionResolutionEffectCommand"
      },
      {
        "ref": "ProposeCorrectionCommand"
      },
      {
        "ref": "ApplyCorrectionCommand"
      },
      {
        "ref": "CreateScopeAuthorityCommand"
      },
      {
        "ref": "EvaluateScopeAuthorityCommand"
      },
      {
        "ref": "CaptureQueryCommand"
      },
      {
        "ref": "ClaimQueryExitCommand"
      },
      {
        "ref": "NotifyOperationWaitCommand"
      },
      {
        "ref": "ExecuteWaitPortCommand"
      },
      {
        "ref": "NotifyActionWaitCommand"
      },
      {
        "ref": "RegisterDurableWaitCommand"
      },
      {
        "ref": "RecheckDurableWaitCommand"
      },
      {
        "ref": "CancelDurableWaitCommand"
      },
      {
        "ref": "PrepareOutboxCommand"
      },
      {
        "ref": "RecordOutboxConsumptionCommand"
      },
      {
        "ref": "RecordOutboxDeliveryCommand"
      },
      {
        "ref": "ConsumeEventCommand"
      },
      {
        "ref": "BuildMissionSummaryCommand"
      },
      {
        "ref": "RefreshMissionSummaryCommand"
      },
      {
        "ref": "RefreshActionAuthorizationCommand"
      },
      {
        "ref": "CleanupActionCommand"
      },
      {
        "ref": "AggregateActionCommand"
      },
      {
        "ref": "RecoverOperationCommand"
      },
      {
        "ref": "ApplyReconciliationCommand"
      },
      {
        "ref": "CompareOperationCommand"
      },
      {
        "ref": "CaptureTransportCommand"
      },
      {
        "ref": "RecordOperationReceiptCommand"
      },
      {
        "ref": "ClaimDispatchExitCommand"
      },
      {
        "ref": "IssueDispatchPermitCommand"
      },
      {
        "ref": "SafeRetryOperationCommand"
      },
      {
        "ref": "ProposeActionCommand"
      },
      {
        "ref": "StartSafetyStopCommand"
      },
      {
        "ref": "CancelActionCommand"
      },
      {
        "ref": "RequestAuthorizationCommand"
      },
      {
        "ref": "SubmitDecisionCommand"
      },
      {
        "ref": "WithdrawDecisionCommand"
      },
      {
        "ref": "ValidateActionCommand"
      },
      {
        "ref": "RegisterOperationPlanCommand"
      },
      {
        "ref": "ConfigureLedgerCommand"
      },
      {
        "ref": "RegisterLedgerUnitCommand"
      },
      {
        "ref": "RegisterLedgerPeriodCommand"
      },
      {
        "ref": "ApplyLedgerCorrectionCommand"
      },
      {
        "ref": "ReserveAllCommand"
      },
      {
        "ref": "ConsumeReservationCommand"
      },
      {
        "ref": "ReleaseReservationCommand"
      },
      {
        "ref": "RevokeGrantCommand"
      },
      {
        "ref": "ConfigureStaticReleaseCommand"
      },
      {
        "ref": "ResolveStaticPinsCommand"
      },
      {
        "ref": "StopStaticAssignmentCommand"
      },
      {
        "ref": "RollbackStaticAssignmentCommand"
      },
      {
        "ref": "StoreInlineArtifactCommand"
      },
      {
        "ref": "TombstoneArtifactCommand"
      },
      {
        "ref": "OpenCommitmentCommand"
      },
      {
        "ref": "SettleCommitmentCommand"
      },
      {
        "ref": "AdjustCommitmentCommand"
      },
      {
        "ref": "BeginCloseCommitmentCommand"
      },
      {
        "ref": "CloseCommitmentCommand"
      },
      {
        "ref": "AssignResponsibilityCommand"
      },
      {
        "ref": "OpenResponsibilityRequestCommand"
      },
      {
        "ref": "IssueExecutionAuthorityCommand"
      },
      {
        "ref": "RevokeExecutionAuthorityCommand"
      },
      {
        "ref": "PinActionCommand"
      },
      {
        "ref": "ConfigurePolicyCommand"
      },
      {
        "ref": "ActivateMandatoryPolicyCommand"
      },
      {
        "ref": "ConfigureResourceEnvelopeCommand"
      },
      {
        "ref": "ConfigurePurposeCommand"
      },
      {
        "ref": "ConfigureConnectionCommand"
      },
      {
        "ref": "RevokePurposeCommand"
      },
      {
        "ref": "RevokeConnectionCommand"
      },
      {
        "ref": "ClaimWorkLeaseCommand"
      },
      {
        "ref": "RenewWorkLeaseCommand"
      },
      {
        "ref": "ReleaseWorkLeaseCommand"
      },
      {
        "ref": "StartRunCommand"
      },
      {
        "ref": "CompleteRunCommand"
      },
      {
        "ref": "CancelRunCommand"
      },
      {
        "ref": "RecoverRunCommand"
      },
      {
        "ref": "StopStalledRunCommand"
      },
      {
        "ref": "WakeRunCommand"
      },
      {
        "ref": "ProposeGraphPatchCommand"
      },
      {
        "ref": "ClaimTaskCommand"
      },
      {
        "ref": "PrepareInvocationCommand"
      },
      {
        "ref": "FinalizeInvocationCommand"
      },
      {
        "ref": "CompleteInvocationCommand"
      },
      {
        "ref": "ObserveLateInvocationCommand"
      },
      {
        "ref": "CommitVerifiedTaskCommand"
      },
      {
        "ref": "SubmitVerificationCommand"
      },
      {
        "ref": "InvokeToolCommand"
      },
      {
        "ref": "CaptureSignalCommand"
      },
      {
        "ref": "BuildCaseCommand"
      },
      {
        "ref": "CreateCandidateCommand"
      },
      {
        "ref": "RequestEvaluationCommand"
      },
      {
        "ref": "RetryEvaluationCommand"
      },
      {
        "ref": "SubmitEvaluationResultCommand"
      },
      {
        "ref": "ExpireEvaluationRunCommand"
      },
      {
        "ref": "BuildGateCommand"
      },
      {
        "ref": "ConfigureLearningCandidateReleaseCommand"
      }
    ]
  },
  "GetAssignmentQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "ListAssignmentsQuery": {
    "properties": {
      "releaseId": {
        "ref": "UUID"
      },
      "assignmentStatus": {
        "ref": "AssignmentState"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "ListLearningSignalsQuery": {
    "properties": {
      "signalType": {
        "ref": "RegisteredName"
      },
      "scopeId": {
        "ref": "UUID"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "ListLearningCasesQuery": {
    "properties": {
      "rootCauseCode": {
        "ref": "RegisteredName"
      },
      "scopeId": {
        "ref": "UUID"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "ListLearningCandidatesQuery": {
    "properties": {
      "candidateStatus": {},
      "assetKind": {
        "ref": "RegisteredName"
      },
      "scopeId": {
        "ref": "UUID"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "ListEvaluationRunsQuery": {
    "properties": {
      "candidateId": {
        "ref": "UUID"
      },
      "runStatus": {},
      "cursor": {},
      "limit": {}
    }
  },
  "GetEvaluationRunQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "GetEvaluationResultQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "GetLearningGateQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "ListLearningGatesQuery": {
    "properties": {
      "candidateId": {
        "ref": "UUID"
      },
      "verdict": {},
      "cursor": {},
      "limit": {}
    }
  },
  "GetCorrectionQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "QueryPackCapabilitiesQuery": {
    "properties": {
      "kind": {
        "ref": "RegisteredName"
      },
      "capabilityId": {
        "ref": "RegisteredName"
      },
      "version": {
        "ref": "ExactVersion"
      },
      "versionRange": {},
      "safetyStop": {},
      "limit": {}
    }
  },
  "ListSafetyStopsQuery": {
    "properties": {
      "limit": {}
    }
  },
  "GetMissionQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "ListMissionsQuery": {
    "properties": {
      "missionStatus": {
        "ref": "MissionState"
      },
      "domainType": {
        "ref": "RegisteredName"
      },
      "workspaceId": {
        "ref": "UUID"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "GetRunQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "GetToolCallQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "ListRunsQuery": {
    "properties": {
      "missionStatus": {
        "ref": "MissionState"
      },
      "missionId": {
        "ref": "UUID"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "GetContextQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      }
    }
  },
  "GetProjectionQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      },
      "type": {
        "ref": "RegisteredName"
      },
      "fieldSet": {}
    }
  },
  "ListProjectionQuery": {
    "properties": {
      "type": {
        "ref": "RegisteredName"
      },
      "missionStatus": {
        "ref": "MissionState"
      },
      "domainType": {
        "ref": "RegisteredName"
      },
      "cursor": {},
      "limit": {}
    }
  },
  "GetActionQuery": {
    "properties": {
      "consistency": {}
    }
  },
  "ListActionsQuery": {
    "properties": {
      "missionId": {
        "ref": "UUID"
      },
      "type": {
        "ref": "RegisteredName"
      },
      "lifecycle": {
        "ref": "ActionState"
      },
      "outcome": {
        "ref": "ActionOutcome"
      },
      "cursor": {},
      "limit": {},
      "consistency": {}
    }
  },
  "GetDecisionQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      },
      "consistency": {}
    }
  },
  "ListInboxQuery": {
    "properties": {
      "status": {
        "ref": "DecisionState"
      },
      "type": {
        "ref": "RegisteredName"
      },
      "expiry": {
        "ref": "Time"
      },
      "cursor": {},
      "limit": {},
      "consistency": {}
    }
  },
  "InspectPackInspectionJobQuery": {
    "properties": {
      "id": {
        "ref": "UUID"
      },
      "consistency": {}
    }
  },
  "EventEnvelope": {
    "branches": [
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.access-record"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.access-record.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.access-record"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.access-record.revoke",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action-authorization-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action-authorization-request.accepted",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action-cleanup"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action-cleanup.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action-result"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action-result.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action-wait.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action-wait.notified",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.advance",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.authorization-refreshed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.authorize",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.close",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.dispatch",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.pinned",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.plan-registered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.reauthorize",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.reconcile",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.reject",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.action"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.action.validate",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.artifact.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.artifact.publish",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.artifact.quarantine",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.artifact.restore",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.artifact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.artifact.tombstone",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.pause",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.promote-active",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.promote-canary",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.resume-active",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.resume-canary",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.resume-shadow",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.retire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.rollback",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.assignment.selection-changed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt-observation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt-observation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt.interrupted",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt.responded",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt.sent",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.attempt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.attempt.transport-failed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.authorization-snapshot"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.authorization-snapshot.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.checkpoint"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.checkpoint.committed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.commitment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.commitment.balance-changed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.commitment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.commitment.close",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.commitment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.commitment.close-requested",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.commitment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.commitment.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.connection"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.connection.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.connection"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.connection.revoked",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.correction-application"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.correction.applied",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.correction"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.correction.proposed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision-effect.abandon",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision-effect.applied",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision-effect.apply",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision-effect.block",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision-effect.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.approve",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.reject",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.supersede",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.decision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.decision.withdraw",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.dispatch-exit"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.dispatch-exit.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.dispatch-permit"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.dispatch-permit.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.durable-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.durable-wait.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.durable-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.durable-wait.observed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.durable-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.durable-wait.registered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.durable-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.durable-wait.succeed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.durable-wakeup"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.durable-wakeup.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.evaluation-result"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.evaluation-result.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.evaluation-run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.evaluation-run.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.evaluation-run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.evaluation-run.expired",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception-resolution-effect"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.exception-resolution-effect.applied",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception-successor-dispatch"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.exception-successor-dispatch.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.exception.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.exception-resolution"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.exception.resolved",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.execution-authority"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.execution-authority.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.execution-authority"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.execution-authority.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.execution-authority"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.execution-authority.revoke",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.external-observation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.external-observation.normalize",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.external-observation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.external-observation.quarantine",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.external-observation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.external-observation.release",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.fence.advanced",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.grant"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.grant.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.grant"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.grant.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.grant"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.grant.revoke",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.graph-revision"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.graph-revision.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.inbox"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.inbox.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.installed-pack.enable",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.installed-pack.retire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.installed-pack.suspend",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.invocation-adjudication"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.invocation-adjudication.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.invocation-observation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.invocation-observation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.invocation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.invocation.completed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.invocation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.invocation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.invocation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.invocation.running",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-candidate"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.learning-candidate.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-case"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.learning-case.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-gate"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.learning-gate.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.learning-signal"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.learning-signal.corrected",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger-correction"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger-correction.applied",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.period"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger-period.registered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.unit"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger-unit.registered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger.balance-changed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger.close",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger.freeze",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.ledger"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.ledger.unfreeze",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.membership"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.membership.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission-conditions"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission-conditions.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.activate",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.block",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.complete",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.pause",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.projection-refresh-requested",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.resolve",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.mission"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.mission.resume",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation-plan"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation-plan.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation-receipt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation-receipt.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation-wait.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation-wait"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation-wait.notified",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.close",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.dispatch",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.observe",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.operation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.operation.retry",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.organization"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.organization.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.outbox-consumption"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.outbox-consumption.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.outbox-delivery"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.outbox-delivery.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.outbox-publication"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.outbox-publication.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.outbox-routing"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.outbox-routing.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-capability-set"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-capability-set.registered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-delivery"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-delivery.accepted",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.fail",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.requested",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.start",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.succeed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-inspection-job"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack-inspection-job.wait",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-data-impact"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack.data-impact-recorded",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack.enabled",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.installed-pack"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack.staged",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-trust-policy"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack.trust-policy-published",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pack-validation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pack.validation-recorded",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.pin-set"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.pin-set.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.policy-binding"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.policy-binding.activated",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.policy-evaluation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.policy-evaluation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.policy-version"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.policy-version.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.principal"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.principal.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.purpose"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.purpose.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.purpose"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.purpose.revoked",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.query-capture"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.query-capture.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.query-exit"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.query-exit.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reconciliation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reconciliation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.release"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.release.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.release"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.release.ready",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.release"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.release.retire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.release"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.release.revoke",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.request-completion-evidence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.request-completion-evidence.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.commit",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.consume",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.expire",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.extended",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.reservation"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.reservation.release",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-envelope"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-envelope.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-fence.blocked",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-fence.cleared",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-fence.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-fence.occupied",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.resource-fence"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.resource-fence.report-block-released",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-assignment"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-assignment.revoked",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.close",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.route",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.route-revised",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.unroute",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.responsibility-request"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.responsibility-request.withdraw",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.cancel",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.complete",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.completed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.pause",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.recovered",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.resume",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.stalled",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.start",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.wait",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.run"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.run.wake",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.settlement"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.settlement.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.cancelled",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.failed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.ready",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.skipped",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.started",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.verified",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.task"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.task.verifying",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.transport-capture"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.transport-capture.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.verification-report"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.verification.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.wait-port-receipt"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.wait-port-receipt.created",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.work-lease.claimed",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.work-lease.released",
          "schemaVersion": "0.1.0"
        }
      },
      {
        "properties": {
          "eventId": {
            "ref": "UUID"
          },
          "type": {},
          "schemaVersion": {},
          "aggregateRef": {
            "properties": {
              "type": {},
              "id": {
                "ref": "UUID"
              },
              "version": {
                "ref": "Version"
              }
            },
            "constants": {
              "type": "abh.work-lease"
            }
          },
          "aggregateVersion": {
            "ref": "Version"
          },
          "eventOrdinal": {},
          "occurredAt": {
            "ref": "Time"
          },
          "correlationId": {
            "ref": "UUID"
          },
          "causationId": {
            "ref": "UUID"
          },
          "actorRef": {
            "ref": "Actor"
          },
          "actingOrganizationId": {
            "ref": "UUID"
          },
          "resourceOrganizationId": {
            "ref": "UUID"
          },
          "workspaceId": {
            "ref": "UUID"
          },
          "payload": {
            "ref": "EventChangeSummary"
          }
        },
        "constants": {
          "type": "abh.work-lease.renewed",
          "schemaVersion": "0.1.0"
        }
      }
    ]
  },
  "MissionState": {},
  "RunState": {},
  "ActionState": {},
  "ActionOutcome": {},
  "ActionPosition": {
    "branches": [
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Proposed"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Validated"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Authorized"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Executing"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Reconciling"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Closed"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Rejected"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Expired"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Cancelled"
        }
      }
    ]
  },
  "OperationState": {},
  "OperationOutcome": {},
  "OperationPosition": {
    "branches": [
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Pending"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Dispatching"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Observing"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Closed"
        }
      },
      {
        "properties": {
          "lifecycle": {},
          "outcome": {}
        },
        "constants": {
          "lifecycle": "Cancelled"
        }
      }
    ]
  },
  "DecisionState": {},
  "DecisionEffectState": {},
  "ResponsibilityRequestState": {},
  "GrantState": {},
  "ExecutionAuthorityState": {},
  "ReservationState": {},
  "CommitmentState": {},
  "LedgerState": {},
  "ReleaseState": {},
  "InstalledPackState": {},
  "ArtifactState": {},
  "AccessRecordState": {},
  "DurableWaitState": {},
  "ExternalObservationState": {},
  "AssignmentState": {},
  "AttemptState": {},
  "PackInspectionJobState": {},
  "ErrorResponse": {
    "properties": {
      "success": {},
      "error": {
        "branches": [
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "MISSION_DEFINITION_INVALID",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "MISSION_AUTHORITY_MISSING",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "MISSION_BLOCKED",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "GOAL_AUTHORITY_INSUFFICIENT",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "MISSION_EFFECT_PENDING",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RUN_ALREADY_ACTIVE",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "TASK_COMMIT_INCOMPLETE",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "BLOCKER_EVIDENCE_INVALID",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "LAST_REQUIRED_RESPONSIBILITY",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "INVALID_ARGUMENT",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "SCHEMA_UNSUPPORTED",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "LIMIT_EXCEEDED",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EXECUTION_AUTHORITY_INVALID",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "UNAUTHENTICATED",
              "category": "Authentication",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "CONTEXT_EXPIRED",
              "category": "Authentication",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "FORBIDDEN",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "PURPOSE_DENIED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EPOCH_REVOKED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EXECUTION_AUTHORITY_SCOPE_EXCEEDED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "POLICY_DENIED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "AUTONOMY_EXCEEDED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RESOURCE_NOT_FOUND",
              "category": "NotFound",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "VERSION_CONFLICT",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "IDEMPOTENCY_CONFLICT",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "ASSIGNMENT_AMBIGUOUS",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EXECUTION_AUTHORITY_AMBIGUOUS",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "PIN_INPUT_CONFLICT",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "PRECONDITION_FAILED",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "AUTHORITY_REQUIRED",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "CAPABILITY_UNAVAILABLE",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "POLICY_INPUT_MISSING",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "OBLIGATION_CONFLICT",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RATE_LIMITED",
              "category": "Capacity"
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RESOURCE_EXHAUSTED",
              "category": "Capacity"
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DEPENDENCY_UNAVAILABLE",
              "category": "Dependency"
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DEPENDENCY_TIMEOUT",
              "category": "Dependency"
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "INTERNAL_ERROR",
              "category": "Internal",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "TENANT_CONTEXT_REQUIRED",
              "category": "Internal",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "ACTION_DOMAIN_INVALID",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "ACTION_PLAN_SCOPE_EXCEEDED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "ACTION_CHILD_VERSION_CONFLICT",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "AUTHORIZATION_REFRESH_DENIED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DECISION_PACKAGE_INCOMPLETE",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DECISION_STALE",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DELEGATION_EXCEEDS_AUTHORITY",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "DECIDER_NOT_ELIGIBLE",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "ROUTE_DEPTH_EXCEEDED",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "OPERATION_FACT_CONFLICT",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "CORRECTION_STALE",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RAW_RECEIPT_UNSUPPORTED",
              "category": "Validation",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "RELEASE_SCOPE_MISMATCH",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "LEARNING_PURPOSE_DENIED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "CASE_EVIDENCE_INCOMPLETE",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "CANDIDATE_SCOPE_EXCEEDED",
              "category": "Authorization",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EVALUATION_PROFILE_UNAVAILABLE",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EVALUATION_PROFILE_AMBIGUOUS",
              "category": "Conflict",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "GATE_EVIDENCE_INVALID",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "GATE_POLICY_INCOMPLETE",
              "category": "Precondition",
              "retryable": false
            }
          },
          {
            "properties": {
              "code": {},
              "category": {},
              "message": {},
              "retryable": {},
              "correlationId": {
                "ref": "UUID"
              }
            },
            "constants": {
              "code": "EVALUATOR_IDENTITY_INVALID",
              "category": "Authorization",
              "retryable": false
            }
          }
        ]
      }
    },
    "constants": {
      "success": false
    }
  },
  "IdentityProviderVerifyResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "VerifiedIdentity"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      }
    ]
  },
  "DurableExecutionEnqueueResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "EnqueuedJob"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "JobRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  },
  "DurableExecutionScheduleWakeupResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "ScheduledWakeup"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "WaitRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  },
  "DurableExecutionCancelWakeupResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "CancelledWakeup"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "WaitRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  },
  "DurableExecutionSignalResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "SignalledWait"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "WaitRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  },
  "DurableExecutionInspectResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "DeliveryInspection"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      }
    ]
  },
  "DurableExecutionDrainResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "DrainReport"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      }
    ]
  },
  "ObjectStorePutResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "ObjectDescriptor"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "ArtifactRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  },
  "ObjectStoreReadResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "ReadObjectDescriptor"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      }
    ]
  },
  "ObjectStoreStatResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "ObjectDescriptor"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      }
    ]
  },
  "ObjectStoreDeleteResult": {
    "branches": [
      {
        "properties": {
          "status": {},
          "data": {
            "ref": "DeletedObject"
          }
        },
        "constants": {
          "status": "Completed"
        }
      },
      {
        "properties": {
          "status": {},
          "effect": {}
        },
        "constants": {
          "status": "Cancelled",
          "effect": "None"
        }
      },
      {
        "properties": {
          "status": {},
          "error": {
            "ref": "ErrorResponse"
          }
        },
        "constants": {
          "status": "Rejected"
        }
      },
      {
        "properties": {
          "status": {},
          "trackingRef": {
            "ref": "StoredObjectRef"
          }
        },
        "constants": {
          "status": "Tracked"
        }
      }
    ]
  }
} as const;
