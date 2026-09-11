/* Generated from DevelopmentConfig leaf annotations. */
export const configurationMetadata = {
  "/deployment/profile": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "Explicit development profile; production capabilities are unavailable.",
    "example": "Development",
    "schema": {
      "const": "Development",
      "type": "string",
      "default": "Development",
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "Explicit development profile; production capabilities are unavailable.",
        "example": "Development"
      }
    },
    "defaultPolicy": "Value",
    "default": "Development"
  },
  "/identity/provider": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "Test identity provider, usable only with Development.",
    "example": "Fake",
    "schema": {
      "const": "Fake",
      "type": "string",
      "default": "Fake",
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "Test identity provider, usable only with Development.",
        "example": "Fake"
      }
    },
    "defaultPolicy": "Value",
    "default": "Fake"
  },
  "/database/runtimeUrlRef": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Reference",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
    "description": "Explicit environment reference for the restricted business runtime database role.",
    "example": "env:ABH_DATABASE_RUNTIME_URL",
    "schema": {
      "type": "string",
      "pattern": "^env:ABH_[A-Z0-9_]+$",
      "maxLength": 200,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Reference",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
        "description": "Explicit environment reference for the restricted business runtime database role.",
        "example": "env:ABH_DATABASE_RUNTIME_URL"
      }
    },
    "defaultPolicy": "Required"
  },
  "/database/queueUrlRef": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Reference",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
    "description": "Separate environment reference for the queue database role.",
    "example": "env:ABH_DATABASE_QUEUE_URL",
    "schema": {
      "type": "string",
      "pattern": "^env:ABH_[A-Z0-9_]+$",
      "maxLength": 200,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Reference",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
        "description": "Separate environment reference for the queue database role.",
        "example": "env:ABH_DATABASE_QUEUE_URL"
      }
    },
    "defaultPolicy": "Required"
  },
  "/database/statementTimeoutMs": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
    "description": "Maximum database statement time, capped by the remaining request deadline.",
    "example": 5000,
    "schema": {
      "type": "integer",
      "minimum": 100,
      "maximum": 30000,
      "default": 5000,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
        "description": "Maximum database statement time, capped by the remaining request deadline.",
        "example": 5000
      }
    },
    "defaultPolicy": "Value",
    "default": 5000
  },
  "/database/lockTimeoutMs": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
    "description": "Maximum database lock wait; cannot exceed the statement timeout.",
    "example": 1000,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5000,
      "default": 1000,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/28-Data-Artifact与Audit详细设计.md",
        "description": "Maximum database lock wait; cannot exceed the statement timeout.",
        "example": 1000
      }
    },
    "defaultPolicy": "Value",
    "default": 1000
  },
  "/runtime/businessEntry": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "Local business declaration entry; this contract does not load or execute it.",
    "example": "./business.ts",
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1024,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "Local business declaration entry; this contract does not load or execute it.",
        "example": "./business.ts"
      }
    },
    "defaultPolicy": "Required"
  },
  "/runtime/mode": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "Action-only dependencies; Agent, model and learning runtimes stay disabled.",
    "example": "ActionOnly",
    "schema": {
      "const": "ActionOnly",
      "type": "string",
      "default": "ActionOnly",
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "Action-only dependencies; Agent, model and learning runtimes stay disabled.",
        "example": "ActionOnly"
      }
    },
    "defaultPolicy": "Value",
    "default": "ActionOnly"
  },
  "/runtime/action/maxOperations": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
    "description": "Maximum operations fixed when an Action is validated.",
    "example": 100,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "default": 100,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
        "description": "Maximum operations fixed when an Action is validated.",
        "example": 100
      }
    },
    "defaultPolicy": "Value",
    "default": 100
  },
  "/runtime/action/maxDependencies": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
    "description": "Maximum dependencies per node in the first Action profile.",
    "example": 32,
    "schema": {
      "type": "integer",
      "minimum": 0,
      "maximum": 32,
      "default": 32,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
        "description": "Maximum dependencies per node in the first Action profile.",
        "example": 32
      }
    },
    "defaultPolicy": "Value",
    "default": 32
  },
  "/runtime/action/intentExpirySeconds": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
    "description": "Maximum lifetime of a proposed Action intent; shorter domain expiry still applies.",
    "example": 86400,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 86400,
      "default": 86400,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/25-Action-Engine详细设计.md",
        "description": "Maximum lifetime of a proposed Action intent; shorter domain expiry still applies.",
        "example": 86400
      }
    },
    "defaultPolicy": "Value",
    "default": 86400
  },
  "/runtime/queue/publishBatch": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/27-Durable-Execution详细设计.md",
    "description": "Bounded Outbox publication batch size.",
    "example": 100,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "default": 100,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/27-Durable-Execution详细设计.md",
        "description": "Bounded Outbox publication batch size.",
        "example": 100
      }
    },
    "defaultPolicy": "Value",
    "default": 100
  },
  "/runtime/queue/pollIntervalMs": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/27-Durable-Execution详细设计.md",
    "description": "Interval for Outbox polling in milliseconds.",
    "example": 500,
    "schema": {
      "type": "integer",
      "minimum": 100,
      "maximum": 5000,
      "default": 500,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/27-Durable-Execution详细设计.md",
        "description": "Interval for Outbox polling in milliseconds.",
        "example": 500
      }
    },
    "defaultPolicy": "Value",
    "default": 500
  },
  "/runtime/reconciliation/initialDelaySeconds": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/26-Operation与Reconciliation详细设计.md",
    "description": "Initial delay before observing an uncertain Operation.",
    "example": 5,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 300,
      "default": 5,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/26-Operation与Reconciliation详细设计.md",
        "description": "Initial delay before observing an uncertain Operation.",
        "example": 5
      }
    },
    "defaultPolicy": "Value",
    "default": 5
  },
  "/runtime/reconciliation/maxDelaySeconds": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/26-Operation与Reconciliation详细设计.md",
    "description": "Upper bound on reconciliation backoff; not a finality or expiry rule.",
    "example": 300,
    "schema": {
      "type": "integer",
      "minimum": 1,
      "maximum": 300,
      "default": 300,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/26-Operation与Reconciliation详细设计.md",
        "description": "Upper bound on reconciliation backoff; not a finality or expiry rule.",
        "example": 300
      }
    },
    "defaultPolicy": "Value",
    "default": 300
  },
  "/web/enabled": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "Workbench remains disabled until its implementation is available.",
    "example": false,
    "schema": {
      "const": false,
      "type": "boolean",
      "default": false,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "Workbench remains disabled until its implementation is available.",
        "example": false
      }
    },
    "defaultPolicy": "Value",
    "default": false
  },
  "/observability/projectTelemetry": {
    "version": "0.1.0",
    "profiles": [
      "Development"
    ],
    "sensitivity": "Public",
    "apply": "Restart",
    "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
    "description": "No project telemetry is enabled in this profile.",
    "example": false,
    "schema": {
      "type": "boolean",
      "const": false,
      "default": false,
      "x-abh-config": {
        "version": "0.1.0",
        "profiles": [
          "Development"
        ],
        "sensitivity": "Public",
        "apply": "Restart",
        "source": "docs/V1/10-ABH详细设计/61-CLI-Distribution与运维详细设计.md",
        "description": "No project telemetry is enabled in this profile.",
        "example": false
      }
    },
    "defaultPolicy": "Value",
    "default": false
  }
} as const;
