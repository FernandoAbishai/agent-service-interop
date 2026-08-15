# Project status

_Last updated: 2026-08-14_

## Current stage

**Tier 2 — first executable protocol-to-operations adapter**

No production interoperability or protocol-conformance claims are made.

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
- [x] Session, agent, consent, expiry and idempotency checks
- [x] GitHub Actions test workflow
- [x] Architecture direction: normalized canonical interoperability state without operational authority
- [ ] Automatic validation against upstream AIP JSON Schemas
- [ ] Second independent protocol view
- [ ] Real FSM/API adapter
- [ ] MCP surface
- [ ] A2A surface
- [ ] Completion/evidence interoperability tests
- [ ] Settlement adapter experiment

## Claim status

| Claim | Status |
|---|---|
| Quoting is a new primitive | Rejected |
| Agent-facing service intake is absent | Rejected; AIP is direct prior art |
| Evidence-conditioned settlement is empty territory | Rejected |
| A new TriHerm protocol is required | Unsupported |
| AIP can be projected onto the current synthetic plumbing FSM without replacing it | Supported by reference-adapter tests only |
| Bind can act as an authorized handoff into the synthetic FSM | Supported by reference-adapter tests; not claimed as universal AIP semantics |
| Canonical state should be the operational source of truth | Rejected as the current architecture direction |
| Canonical state can act as a normalized interoperability representation while source systems retain authority | Working architectural hypothesis |
| One canonical representation can support multiple independent agent-facing views | Still untested; only AIP exists |
| Existing real business workflows can remain authoritative while becoming agent-accessible | Still untested against a real FSM/API |
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
  -> normalized canonical representation
  -> protocol projection
```

Persistence of canonical state remains an implementation question. Persistence alone must not make canonical state authoritative.

## Current implementation boundary

The adapter is pinned to **AIP v0.1.0 / 2026-02-27**. It uses a synthetic direct provider and a file-backed FSM. The runtime validates the subset of AIP contracts used by the experiment, but that is not equivalent to automatic conformance validation against the upstream JSON Schemas.

AIP Bind is treated as user-authorized handoff. The existing-system mock performs the business transition from `quote=offered, job=pending` to `quote=accepted, job=scheduled`. The canonical representation is produced from the confirmed FSM state.

## Next gate

Before selecting a second protocol surface, harden this first adapter enough that its evidence is trustworthy:

1. validate generated manifest/intake/offer/bind fixtures against the pinned upstream AIP schemas where normative schemas exist;
2. record what is protocol-native versus adapter-local;
3. use cross-system research to test which workflow concepts are truly normalizable versus provider-specific;
4. then evaluate candidates for the second independent view without preselecting UCP.

No UCP extension or `com.triherm.*` namespace should be introduced until a concrete interoperability need survives implementation.
