# TH-INTEROP-21 — Replay and file-write safety

_Status: bounded hardening of the synthetic AIP/file-backed experiment. This does not establish production-grade distributed transactions or scheduling semantics._

## Question

Can the existing synthetic AIP write path make retries and local file persistence deterministic enough that replay, concurrency, or a process failure cannot silently reinterpret one session as different business input?

## Replay identities

### Intake

The state-affecting replay identity is:

- `aip_version`;
- `session_id`;
- `agent.id`;
- the complete validated `intake_data` object.

Validated metadata, agent display name/platform, and consent-scope presentation are not part of intake replay identity because this adapter does not persist them into the operational requirement/quote/job state.

Exact semantic replay returns the existing offer/IDs without mutation. A changed semantic intake under the same `session_id` returns `409 IDEMPOTENCY_CONFLICT` and leaves the original state unchanged.

### Bind

The Bind replay identity is:

- `offer_id`;
- `session_id`;
- `agent.id`;
- the complete validated `bind_data`, including allowed upstream extension fields.

Bind metadata and consent-scope presentation are validated but excluded from the replay fingerprint. Exact replay returns the first confirmed result, including the original `bound_at` / `scheduled_for`, even if the offer would be expired at retry time. Changed bind data returns `409 IDEMPOTENCY_CONFLICT` without rescheduling or overwriting persisted PII.

The synthetic `+3 days` scheduling policy is deliberately unchanged by this gate.

## Crash/recovery boundary

AIP submit uses an adapter-local replay registry separate from both operational FSM state and the protocol-neutral correlation store. The registry stores only an opaque request fingerprint plus the reserved workflow/offer/requirement/quote/job IDs and validity timestamp; it does not store customer PII or become operational authority.

For a new submit the order is:

```text
validated semantic intake
  -> reserve replay identity + IDs
  -> persist neutral correlation refs
  -> persist operational FSM session
```

If correlation persistence fails, no new FSM session is written. If correlation succeeds but the FSM write fails, the correlation is not inspectable as a successful workflow because the source-backed observer cannot resolve operational state. A later exact replay reuses the reserved IDs and completes the FSM write; a changed replay is rejected by the persisted semantic fingerprint.

This is a fail-closed recovery strategy, **not** a distributed transaction and not a claim of exactly-once execution across external systems.

## File safety

The file-backed FSM, correlation store, and AIP replay store use:

- a cross-process exclusive lock around read -> validate -> mutate -> commit;
- same-directory temporary files;
- file `fsync`;
- atomic rename;
- directory `fsync` where the platform supports it.

Readers therefore see the prior complete JSON document or the next complete document, not an in-progress rewrite. Distinct concurrent writers are serialized so updates are not silently lost.

Lock ownership uses an atomic lock-directory lease with periodic `mtime` updates. A lock is considered stale only after the configured lease window, allowing a process killed with `SIGKILL` to be recovered without immediately stealing an active writer's lock. Every writer uses the same stale/update configuration. This is local-filesystem coordination, not a distributed lock for network/object storage.

## Evidence

Deterministic tests cover:

- exact intake replay;
- changed semantic intake -> 409 / no mutation;
- metadata-only intake retry preserving the original offer;
- exact Bind replay after offer expiry preserving the first result;
- changed Bind -> 409 / no reschedule;
- correlation-write failure leaving no new FSM state;
- correlation-first/FSM-failure recovery with persisted semantic fingerprint;
- concurrent distinct FSM writers preserving every session;
- readers not observing partial JSON during concurrent writes;
- concurrent distinct correlation writers preserving every workflow.
- crash-abandoned lock recovery after the lease becomes stale.

## Still unproven

- production writes to Jobber, ServiceTitan, or another external authority;
- idempotency across multiple independent services/databases;
- coordination guarantees across network filesystems or object storage;
- distributed transaction or exactly-once guarantees;
- scheduling correctness for urgency/availability constraints;
- authorization/delegation proof;
- reconciliation against a second live system.
