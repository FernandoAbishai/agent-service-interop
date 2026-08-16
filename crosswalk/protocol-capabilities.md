# Protocol-to-workflow crosswalk

This crosswalk maps one **residential plumbing** workflow to existing protocol concepts. It intentionally separates protocol-native concepts from experimental translation concepts.

A workflow stage is **not automatically a canonical primitive**. The stages below are a reference sequence used to compare protocol/system coverage; TH-INTEROP-15 separately determines which concepts, if any, deserve a normalized interoperability representation.

## Reference workflow stages

1. discover provider
2. submit requirement
3. receive quote / offer
4. review and accept
5. create/continue operational job
6. perform work
7. capture completion state/evidence
8. accept, reject, dispute, or request follow-up
9. trigger any settlement action outside this repository

## Crosswalk

| Reference stage | AIP | UCP | UBL | MCP | A2A | Existing business system | Project status |
|---|---|---|---|---|---|---|---|
| Discover provider | Manifest + matching/discovery flow | `/.well-known/ucp` exposes UCP service/capability surfaces | N/A | Discovery of server/tool surface only | Agent Card | Website/CRM/FSM metadata | Reuse; no new discovery protocol |
| Submit requirement | Intake endpoint + schema | Only if a semantically appropriate UCP surface exists | `RequestForQuotation` prior art | Tool invocation can carry request | Message/task can carry request | Form, phone, CRM lead/job request | Normalize only if translation evidence requires it |
| Quote / offer | Offer | Do not assume generic service-quote support | `Quotation` + validity semantics | Tool result/Task result can transport it | Message/artifact can transport it | Estimate/quote object | Translate; quote concept is not novel |
| Accept / bind | Bind | Commerce-specific flow where valid | Order/contract-adjacent prior art | Tool invocation | Message/task | Estimate approval / booking | Do not assume one universal commitment event |
| Operational job | Out of AIP's core intake role | Not automatically equivalent to a field-service job | Procurement/order concepts | Task can model async operation mechanics | Task/message coordination | Job/work order/project | Existing system remains source of operational truth |
| Execute work | No | No generic physical-service execution semantics assumed | Service-performance prior art exists in enterprise procurement | Task status != satisfactory physical completion | Task/message status != satisfactory physical completion | FSM/work order | Keep in existing system; normalize only earned sub-primitives |
| Completion state/evidence | No universal AIP completion model assumed | Version/capability dependent; do not invent support | Receipt/service-entry prior art | Result/artifact can transport evidence | Artifact/message can transport evidence | Photos, notes, signatures, checklists, timestamps | Preserve source-native facts/references until a common semantic need is proven |
| Customer acceptance / dispute | Not the core intake lifecycle | Version/capability dependent | Acceptance/receipt/dispute prior art is fragmented | Tool call can transport decision | Message can transport decision | Customer signature, approval, callback, dispute | Deferred as a universal primitive |
| Settlement | Outside AIP | UCP payment handlers / commerce semantics where valid | Invoice/payment documents | Not a payment rail | Not a payment rail | Processor/accounting system | Adapter/reference boundary; not Tier 1 |

## Rules for implementation

### 1. Protocols are views, not the database

The canonical model is not intended to replace AIP, UCP, UBL, MCP, A2A, or a field-service system. It exists only to test whether a single operational state can be represented across multiple external views without semantic loss.

### 2. The business system remains authoritative for execution

A successful experiment must not create a parallel job-management product. If the provider already uses an FSM/CRM/work-order system, that system remains authoritative for operational execution.

### 3. Translation must be reversible enough to audit

Every external representation should retain stable references to the normalized requirement, quote, job/occurrence and decision identifiers that actually exist so that an observer can explain how one representation was derived from another. Do not invent missing identifiers merely to make the crosswalk look complete.

### 4. Missing semantics are explicit

If a protocol does not natively express a concept, the fixture should say `not_native` rather than smuggling the concept into an unrelated field.

### 5. Version-sensitive protocol behavior is pinned

Every future UCP/AIP/A2A/MCP fixture must include the version/date against which it was generated.

### 6. Stage coverage does not imply primitive ownership

A concept can appear in the end-to-end workflow while remaining `REFERENCE_ONLY`, `PROTOCOL_SPECIFIC`, `SYSTEM_SPECIFIC`, or `DEFERRED`. See `research/minimal-economic-primitives.md` for the current gate.
