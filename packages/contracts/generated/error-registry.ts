/* Generated. Retryability never permits repeating an uncertain external effect. */
export const errorRegistry = {
  "MISSION_DEFINITION_INVALID": {
    "code": "MISSION_DEFINITION_INVALID",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "MISSION_AUTHORITY_MISSING": {
    "code": "MISSION_AUTHORITY_MISSING",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "MISSION_BLOCKED": {
    "code": "MISSION_BLOCKED",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "GOAL_AUTHORITY_INSUFFICIENT": {
    "code": "GOAL_AUTHORITY_INSUFFICIENT",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "MISSION_EFFECT_PENDING": {
    "code": "MISSION_EFFECT_PENDING",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "RUN_ALREADY_ACTIVE": {
    "code": "RUN_ALREADY_ACTIVE",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "TASK_COMMIT_INCOMPLETE": {
    "code": "TASK_COMMIT_INCOMPLETE",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "BLOCKER_EVIDENCE_INVALID": {
    "code": "BLOCKER_EVIDENCE_INVALID",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "LAST_REQUIRED_RESPONSIBILITY": {
    "code": "LAST_REQUIRED_RESPONSIBILITY",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "INVALID_ARGUMENT": {
    "code": "INVALID_ARGUMENT",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "SCHEMA_UNSUPPORTED": {
    "code": "SCHEMA_UNSUPPORTED",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "LIMIT_EXCEEDED": {
    "code": "LIMIT_EXCEEDED",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "EXECUTION_AUTHORITY_INVALID": {
    "code": "EXECUTION_AUTHORITY_INVALID",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "UNAUTHENTICATED": {
    "code": "UNAUTHENTICATED",
    "category": "Authentication",
    "httpStatus": 401,
    "retryable": false,
    "toolCategory": "Authentication"
  },
  "CONTEXT_EXPIRED": {
    "code": "CONTEXT_EXPIRED",
    "category": "Authentication",
    "httpStatus": 401,
    "retryable": false,
    "toolCategory": "Authentication"
  },
  "FORBIDDEN": {
    "code": "FORBIDDEN",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "PURPOSE_DENIED": {
    "code": "PURPOSE_DENIED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "EPOCH_REVOKED": {
    "code": "EPOCH_REVOKED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "EXECUTION_AUTHORITY_SCOPE_EXCEEDED": {
    "code": "EXECUTION_AUTHORITY_SCOPE_EXCEEDED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "POLICY_DENIED": {
    "code": "POLICY_DENIED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "AUTONOMY_EXCEEDED": {
    "code": "AUTONOMY_EXCEEDED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "RESOURCE_NOT_FOUND": {
    "code": "RESOURCE_NOT_FOUND",
    "category": "NotFound",
    "httpStatus": 404,
    "retryable": false,
    "toolCategory": "NotFound"
  },
  "VERSION_CONFLICT": {
    "code": "VERSION_CONFLICT",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "IDEMPOTENCY_CONFLICT": {
    "code": "IDEMPOTENCY_CONFLICT",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "ASSIGNMENT_AMBIGUOUS": {
    "code": "ASSIGNMENT_AMBIGUOUS",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "EXECUTION_AUTHORITY_AMBIGUOUS": {
    "code": "EXECUTION_AUTHORITY_AMBIGUOUS",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "PIN_INPUT_CONFLICT": {
    "code": "PIN_INPUT_CONFLICT",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "PRECONDITION_FAILED": {
    "code": "PRECONDITION_FAILED",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "AUTHORITY_REQUIRED": {
    "code": "AUTHORITY_REQUIRED",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "CAPABILITY_UNAVAILABLE": {
    "code": "CAPABILITY_UNAVAILABLE",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "POLICY_INPUT_MISSING": {
    "code": "POLICY_INPUT_MISSING",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "OBLIGATION_CONFLICT": {
    "code": "OBLIGATION_CONFLICT",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "RATE_LIMITED": {
    "code": "RATE_LIMITED",
    "category": "Capacity",
    "httpStatus": 429,
    "retryable": true,
    "toolCategory": "Capacity"
  },
  "RESOURCE_EXHAUSTED": {
    "code": "RESOURCE_EXHAUSTED",
    "category": "Capacity",
    "httpStatus": 429,
    "retryable": true,
    "toolCategory": "Capacity"
  },
  "DEPENDENCY_UNAVAILABLE": {
    "code": "DEPENDENCY_UNAVAILABLE",
    "category": "Dependency",
    "httpStatus": 503,
    "retryable": true,
    "toolCategory": "Dependency"
  },
  "DEPENDENCY_TIMEOUT": {
    "code": "DEPENDENCY_TIMEOUT",
    "category": "Dependency",
    "httpStatus": 504,
    "retryable": true,
    "toolCategory": "Dependency"
  },
  "INTERNAL_ERROR": {
    "code": "INTERNAL_ERROR",
    "category": "Internal",
    "httpStatus": 500,
    "retryable": false,
    "toolCategory": "Internal"
  },
  "TENANT_CONTEXT_REQUIRED": {
    "code": "TENANT_CONTEXT_REQUIRED",
    "category": "Internal",
    "httpStatus": 500,
    "retryable": false,
    "toolCategory": "Internal"
  },
  "ACTION_DOMAIN_INVALID": {
    "code": "ACTION_DOMAIN_INVALID",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "ACTION_PLAN_SCOPE_EXCEEDED": {
    "code": "ACTION_PLAN_SCOPE_EXCEEDED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "ACTION_CHILD_VERSION_CONFLICT": {
    "code": "ACTION_CHILD_VERSION_CONFLICT",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "AUTHORIZATION_REFRESH_DENIED": {
    "code": "AUTHORIZATION_REFRESH_DENIED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "DECISION_PACKAGE_INCOMPLETE": {
    "code": "DECISION_PACKAGE_INCOMPLETE",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "DECISION_STALE": {
    "code": "DECISION_STALE",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "DELEGATION_EXCEEDS_AUTHORITY": {
    "code": "DELEGATION_EXCEEDS_AUTHORITY",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "DECIDER_NOT_ELIGIBLE": {
    "code": "DECIDER_NOT_ELIGIBLE",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "ROUTE_DEPTH_EXCEEDED": {
    "code": "ROUTE_DEPTH_EXCEEDED",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "OPERATION_FACT_CONFLICT": {
    "code": "OPERATION_FACT_CONFLICT",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "CORRECTION_STALE": {
    "code": "CORRECTION_STALE",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "RAW_RECEIPT_UNSUPPORTED": {
    "code": "RAW_RECEIPT_UNSUPPORTED",
    "category": "Validation",
    "httpStatus": 400,
    "retryable": false,
    "toolCategory": "Validation"
  },
  "RELEASE_SCOPE_MISMATCH": {
    "code": "RELEASE_SCOPE_MISMATCH",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "LEARNING_PURPOSE_DENIED": {
    "code": "LEARNING_PURPOSE_DENIED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "CASE_EVIDENCE_INCOMPLETE": {
    "code": "CASE_EVIDENCE_INCOMPLETE",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "CANDIDATE_SCOPE_EXCEEDED": {
    "code": "CANDIDATE_SCOPE_EXCEEDED",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  },
  "EVALUATION_PROFILE_UNAVAILABLE": {
    "code": "EVALUATION_PROFILE_UNAVAILABLE",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "EVALUATION_PROFILE_AMBIGUOUS": {
    "code": "EVALUATION_PROFILE_AMBIGUOUS",
    "category": "Conflict",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Conflict"
  },
  "GATE_EVIDENCE_INVALID": {
    "code": "GATE_EVIDENCE_INVALID",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "GATE_POLICY_INCOMPLETE": {
    "code": "GATE_POLICY_INCOMPLETE",
    "category": "Precondition",
    "httpStatus": 409,
    "retryable": false,
    "toolCategory": "Precondition"
  },
  "EVALUATOR_IDENTITY_INVALID": {
    "code": "EVALUATOR_IDENTITY_INVALID",
    "category": "Authorization",
    "httpStatus": 403,
    "retryable": false,
    "toolCategory": "Authorization"
  }
} as const;
