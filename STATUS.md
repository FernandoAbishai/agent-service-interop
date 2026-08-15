# Project status

_Last updated: 2026-08-15_

## Current stage

**Tier 3 — two executable agent-facing views over one synthetic workflow**

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
- [x] GitHub Actions test workflow
- [ ] Real FSM/API adapter
- [ ] Second operational-system adapter
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
| Existing real business workflows can remain authoritative while becoming agent-accessible | Still untested against a real FSM/API |
| One useful normalized core can survive multiple operational systems | Untested |
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

A2A does not change this rule. Its current skill is read-only and observes the confirmed FSM state through the canonical projection.

## Current implementation boundary

### AIP

Pinned to **AIP v0.1.0 / 2026-02-27**. The generated/consumed manifest, intake request, offer response, and bind request are checked against vendored upstream JSON Schemas from that snapshot. The adapter-local bind response remains outside normative AIP schema coverage.

### A2A

Uses **A2A Protocol v1.0** through official `@a2a-js/sdk@1.0.1`, with one HTTP+JSON interface and one read-only `inspect_service_workflow` skill.

The A2A surface references the existing canonical workflow, requirement, quote, AIP offer, and operational job IDs. A2A Task/Context IDs remain protocol-local and are not used as business-system identifiers.

`TASK_STATE_COMPLETED` means the read-only provider-agent interaction completed. It is not used to represent physical job completion, fulfillment acceptance, or settlement.

## Next gate

The protocol-count question is no longer the highest-value uncertainty. The next evidence should test the **deployment/adapter wedge** against real or materially independent operational systems.

Candidate gates:

1. evaluate Agave as an adapter substrate versus direct FSM adapters;
2. add a second operational-system adapter or realistic independent mock that maps the same canonical concepts;
3. define explicit authority/provenance behavior per field/transition only when the second system forces it;
4. resolve the exact canonical money representation before decimal-valued quotes or payment/UBL/UCP mappings;
5. avoid expanding the canonical schema unless implementation demonstrates a concrete semantic need.

No UCP extension or `com.triherm.*` namespace should be introduced until a concrete interoperability need survives implementation.
