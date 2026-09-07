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

New synthetic bindings retain only the opaque Bind request fingerprint alongside the binding record so exact replay can be recognized after restart. It is adapter-local replay metadata, not a canonical field, correlation reference, authorization proof, or source-business identifier. Legacy bindings without that fingerprint use a deliberately conservative compatibility comparison and do not guess about unknown historical extension fields.

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

Lock ownership uses `proper-lockfile` from a dedicated helper process. The helper owns and refreshes the lock-directory lease independently of the writer's synchronous JavaScript thread, so a long synchronous read/modify/write section cannot starve the lease heartbeat and be stale-stolen by another writer. The helper also releases when its parent writer exits; the stale lease remains the fallback for an abandoned helper lock. Acquisition and release waits are bounded. This is local-filesystem coordination, not a distributed lock for network/object storage.

## Evidence

Deterministic tests cover:

- exact intake replay;
- changed semantic intake -> 409 / no mutation;
- metadata-only intake retry preserving the original offer;
- exact Bind replay after offer expiry preserving the first result;
- changed Bind -> 409 / no reschedule;
- correlation-write failure leaving no new FSM state;
- correlation-first/FSM-failure recovery with persisted semantic fingerprint;
- legacy FSM/correlation or FSM/replay identifier divergence failing closed before re-correlation/mutation;
- concurrent distinct FSM writers preserving every session;
- readers not observing partial JSON during concurrent writes;
- concurrent distinct correlation writers preserving every workflow.
- abandoned stale-lock recovery;
- a live writer holding a synchronous critical section longer than the configured stale lease without losing exclusivity.

## Still unproven

- production writes to Jobber, ServiceTitan, or another external authority;
- idempotency across multiple independent services/databases;
- coordination guarantees across network filesystems or object storage;
- distributed transaction or exactly-once guarantees;
- scheduling correctness for urgency/availability constraints;
- authorization/delegation proof;
- reconciliation against a second live system.
