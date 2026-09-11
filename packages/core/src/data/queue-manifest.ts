/** Reviewed native pg-boss 12.30.0 inventory (MIT); generated from its shipped schema manifest. */
export const queueManifest = {
  "packageVersion": "12.30.0",
  "schemaVersion": 40,
  "schema": "abh_pgboss",
  "owner": "abh_queue",
  "upstreamSchemaSha256": "8036cc814a39f1ffbd9cb055ef37ced94114e4395adc5eb63206166592ea2e39",
  "tables": [
    "bam",
    "job",
    "job_common",
    "job_dependency",
    "queue",
    "queue_stats",
    "schedule",
    "subscription",
    "version",
    "warning"
  ],
  "functions": [
    {
      "name": "create_queue",
      "arguments": "text, jsonb",
      "sourceSha256": "94401a377840037c3457332d7c202c2a84543d942529a317cc7f0a35f41ba01a"
    },
    {
      "name": "delete_queue",
      "arguments": "text",
      "sourceSha256": "5f322cd64dc8e87a91ed3b63b1245fc2d188bac1b6b94d7c5fa7cdc973ac55e9"
    },
    {
      "name": "job_table_format",
      "arguments": "text, text",
      "sourceSha256": "d6babe6b02e8f16f4ecb4856ee307e45023198f68556acde6c5f9a8b6af51fb3"
    },
    {
      "name": "job_table_run",
      "arguments": "text, text, text",
      "sourceSha256": "8cabb6142309f497abe9a31b15dba7e9b01910abe5bbd780ab343735916a593c"
    },
    {
      "name": "job_table_run_async",
      "arguments": "text, integer, text, text, text",
      "sourceSha256": "9b2eb05cab70c7994e273e37382fec70da458382ca031236cc0f87aa1fc7f6c8"
    }
  ]
} as const;
