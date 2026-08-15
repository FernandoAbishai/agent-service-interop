# Project status

_Last updated: 2026-08-15_

## Current stage

**Tier 4 — second operational shape under falsification**

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
- [x] GitHub Actions test workflow
- [ ] Real ServiceTitan/API adapter
- [ ] Canonical repair decision after second-system evidence
- [ ] Multi-system authority/provenance test
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
| One useful normalized core can survive multiple operational systems | Under active falsification; current canonical schema is intentionally unchanged |
| Existing real business workflows can remain authoritative while becoming agent-accessible | Still untested against live credentials/API |
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

The ServiceTitan-shaped experiment is read-only. It preserves source-native Job, Appointment and Estimate identities/statuses before any decision is made about canonical repair.

## Current implementation boundary

### AIP

Pinned to **AIP v0.1.0 / 2026-02-27**. The generated/consumed manifest, intake request, offer response, and bind request are checked against vendored upstream JSON Schemas from that snapshot. The adapter-local bind response remains outside normative AIP schema coverage.

### A2A

Uses **A2A Protocol v1.0** through official `@a2a-js/sdk@1.0.1`, with one HTTP+JSON interface and one read-only `inspect_service_workflow` skill.

### ServiceTitan-shaped second system

The current second-system work is a fixture-backed observation boundary, not a live ServiceTitan integration. It deliberately preserves:

- Job identity and source status;
- one-to-many Appointment identities and scheduling windows;
- Estimate identity with optional Job relationship;
- native completion basis from Job state;
- observation timestamps and source-system provenance.

No generic operational command contract, raw payload store, polling service, event bus, Agave runtime integration, or canonical schema expansion is introduced in this stage.

## Next gate

The next decision is no longer whether to add another protocol. It is whether the second-system evidence requires the canonical representation to change at all, and if so, how little.

Required review after this stage:

1. classify `job.scheduled_for` as insufficient, optional shorthand, or removable;
2. decide whether Appointment belongs in the normalized core, as references, or as a system-specific extension;
3. model Quote/Estimate-to-Job relationships without forcing a single lifecycle ordering;
4. preserve provider completion claim separately from customer acceptance;
5. only then evaluate a live ServiceTitan adapter and Agave as an optional connectivity substrate;
6. resolve the exact canonical money representation before decimal-valued quotes or payment/UBL/UCP mappings.

No UCP extension or `com.triherm.*` namespace should be introduced until a concrete interoperability need survives implementation.
