# Project status

_Last updated: 2026-08-15_

## Current stage

**Tier 5 — cross-system Occurrence mapping with live Jobber gate pending**

No production interoperability or protocol-certification claims are made.

## What exists

- [x] Apache-2.0 license
- [x] Evidence-first README
- [x] Prior-art map
- [x] Protocol/workflow crosswalk
- [x] Experimental canonical workflow schema
- [x] Residential-plumbing fixture
- [x] Falsifiable experiment design
- [x] Executable AIP v0.1.0 manifest/intake/offer/bind reference adapter
- [x] Privacy boundary: non-PII intake -> authorized PII at Bind
- [x] File-backed FSM adapter
- [x] AIP -> FSM -> canonical round-trip tests
- [x] Automatic validation against pinned upstream AIP JSON Schemas where normative schemas exist
- [x] Architecture direction: normalized canonical interoperability state without operational authority
- [x] A2A v1.0 Agent Card + HTTP+JSON provider-agent surface via official JS SDK
- [x] AIP-created workflow exposed through A2A without protocol-specific quote/job copies
- [x] A2A Task identity/state kept separate from FSM Job identity/state
- [x] ServiceTitan-shaped read-only observation fixture
- [x] One Job -> many Appointment identity/schedule falsification test
- [x] Sold Estimate without Job relationship falsification test
- [x] Native Job completion observation without payment inference
- [x] Generic Occurrence observation vocabulary projected from ServiceTitan Appointments
- [x] Relationship gate documented without canonical schema migration
- [x] Jobber-shaped Visit -> Occurrence projection with nullable schedule
- [x] Read-only paginated Jobber GraphQL observation boundary
- [x] Deterministic synthetic Jobber contract tests with no credentials
- [x] Opt-in live Jobber contract test
- [x] GitHub Actions test workflow
- [ ] Live Jobber test-account run with a temporary authorized token
- [ ] Real ServiceTitan/API adapter
- [ ] Multi-system authority/provenance test against two live systems
- [ ] Completion/evidence interoperability tests
- [ ] Settlement adapter experiment
- [ ] Agave adapter-substrate experiment

## Claim status

| Claim | Status |
|---|---|
| Quoting is a new primitive | Rejected |
| Agent-facing service intake is absent | Rejected; AIP is direct prior art |
| Evidence-conditioned settlement is empty territory | Rejected |
| A new TriHerm protocol is required | Unsupported |
| Canonical state should be the operational source of truth | Rejected as the current architecture direction |
| AIP can be projected onto the current synthetic plumbing FSM without replacing it | Supported by executable tests |
| Bind can act as an authorized handoff into the synthetic FSM | Supported by executable tests; not universal AIP semantics |
| AIP artifacts used by the experiment match pinned upstream normative schemas | Supported by automated schema tests for manifest/intake/offer/bind request |
| One canonical representation can support two independent agent-facing views | Initial support: AIP + A2A over one synthetic workflow |
| A2A Task state can remain distinct from physical Job state | Supported by executable test: Task completed while Job remains scheduled |
| A single `job.scheduled_for` can faithfully represent ServiceTitan-shaped scheduling | Falsified by fixture: one Job has multiple Appointments with independent windows |
| Every sold Estimate must already have a Job relationship | Falsified by fixture |
| Provider completion must be inferred from payment/invoice state | Rejected for ServiceTitan-shaped observation; native Job status/completed timestamp are preserved |
| A distinct work-occurrence observation is justified | Supported by ServiceTitan Appointment plus deterministic Jobber Visit mappings; live Jobber verification remains pending |
| An unscheduled occurrence requires invented timing | Rejected by the Jobber-shaped mapping; null start/end are preserved |
| A universal normalized occurrence lifecycle enum is justified | Not supported; ServiceTitan and Jobber source-native statuses remain verbatim |
| `clientConfirmed` can be promoted to customer economic acceptance | Rejected for this experiment; it remains source-native Visit data |
| `accepted_as`, `offered_via`, and `converted_from` are stable canonical relationships | Not yet supported as a package; documented as candidates/deferred semantics only |
| One useful normalized core can survive multiple operational systems | Promising at the observation layer; canonical-schema promotion still withheld pending live evidence |
| Existing real business workflows can remain authoritative while becoming agent-accessible | Implementation path exists for Jobber; live API verification still pending |
| Adapter/interoperability infrastructure is a meaningful deployment wedge | Working hypothesis, not a fact |

## Authority model

The canonical model is treated as a **normalized interoperability representation**, not as the authoritative operational database.

For writes:

```text
protocol / agent
  -> intent or command
  -> authoritative-system adapter
  -> operational system executes
  -> confirmed result
  -> canonical representation updates
```

For reads:

```text
operational system
  -> adapter
  -> normalized interoperability representation
  -> protocol projection
```

The Jobber work in this stage is read-only. Jobber remains authoritative for its Job and Visit state; the adapter preserves Jobber IDs/statuses before projecting only the already-earned Occurrence fields.

## Current implementation boundary

### AIP

Pinned to **AIP v0.1.0 / 2026-02-27**. The generated/consumed manifest, intake request, offer response, and bind request are checked against vendored upstream JSON Schemas from that snapshot. The adapter-local bind response remains outside normative AIP schema coverage.

### A2A

Uses **A2A Protocol v1.0** through official `@a2a-js/sdk@1.0.1`, with one HTTP+JSON interface and one read-only `inspect_service_workflow` skill.

### ServiceTitan-shaped second system

The current ServiceTitan work is a fixture-backed observation boundary, not a live ServiceTitan integration. It preserves Job, Appointment and Estimate identities/statuses, one-to-many Appointment schedules, and native Job completion basis.

### Occurrence architecture gate

The observation layer has one small cross-system vocabulary:

- source system;
- source object type and ID;
- source-native status;
- observation timestamp;
- explicit parent reference;
- nullable independent schedule/arrival windows.

ServiceTitan Appointment and Jobber Visit both project into this vocabulary without a normalized lifecycle enum. Provider completion and customer acceptance remain separate semantics.

### Jobber live gate

PR #7 adds a read-only Jobber GraphQL client and pagination-aware Job/Visit observer pinned by default to API version `2025-04-16`.

Deterministic CI uses synthetic official-shaped data only. The live contract test is opt-in and requires a temporary test-account token plus a seeded Job ID. No token, authorization code, client secret, refresh token, or customer data belongs in the repository.

See [`docs/jobber/pr7-live-contract.md`](docs/jobber/pr7-live-contract.md).

## Next gate

Do **not** migrate `Occurrence` into `service-workflow.schema.json` yet.

The immediate evidence gate is a live Jobber test-account run containing scheduled, unscheduled, completed, and incomplete Visits. If the same mapping passes against the real API, the project can then decide whether Occurrence has earned canonical-schema status or should remain an observation-layer concept.

After that, the next operational question is whether connectivity should be implemented directly for another live system or delegated through an integration substrate such as Agave without surrendering authority/provenance semantics.

Separately, resolve the exact canonical money representation before decimal-valued quotes or payment/UBL/UCP mappings.

No UCP extension or `com.triherm.*` namespace should be introduced until a concrete interoperability need survives implementation.
