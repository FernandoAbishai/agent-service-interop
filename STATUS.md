# Project status

_Last updated: 2026-08-14_

## Current stage

**Tier 1 — evidence backbone**

No production interoperability claims are made yet.

## What exists

- [x] Apache-2.0 license
- [x] Evidence-first README
- [x] Prior-art map
- [x] Protocol/workflow crosswalk
- [x] Experimental canonical workflow schema
- [x] Residential-plumbing fixture
- [x] Falsifiable experiment design
- [ ] Automated schema validation
- [ ] AIP manifest/request/offer/bind generator
- [ ] Second independent protocol view
- [ ] File-backed FSM adapter
- [ ] Round-trip tests
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
| Existing protocols can be consumed as external views | Working hypothesis |
| One canonical operational model can support multiple agent-facing views | Untested |
| Existing business workflows can remain authoritative while becoming agent-accessible | Untested |
| Adapter/interoperability infrastructure is a meaningful deployment wedge | Working hypothesis, not a fact |

## Next implementation gate

The next PR should not add another research document. It should add executable validation for the current schema/fixture and the first **AIP view generated from canonical/provider configuration**.

No UCP extension or `com.triherm.*` namespace should be introduced until a concrete interoperability need survives implementation.
