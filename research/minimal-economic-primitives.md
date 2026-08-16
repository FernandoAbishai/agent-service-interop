# TH-INTEROP-15 — Minimal Economic Primitive Set

_Status: architecture falsification gate. This document does not define a public TriHerm protocol and does not promote new fields into the canonical schema._

_Last checked against primary sources: 2026-08-15._

## Question

What is the smallest semantic set TriHerm actually needs to normalize in order to coordinate a real service transaction across agents, protocols, and existing business systems without duplicating standards or taking operational authority away from those systems?

The goal is deliberately smaller than an end-to-end universal commerce schema.

## Core rule: workflow stage != canonical primitive

A transaction may pass through requirement, quote, commitment, execution, evidence, verification, and settlement stages without TriHerm owning a universal object for every stage.

A concept earns a place in the minimal interoperability core only when all of the following are true:

1. it is required to translate or coordinate across at least two independent representations or systems;
2. its meaning survives translation without decision-critical semantic loss;
3. its authoritative source can be identified;
4. retaining only a source/protocol reference is insufficient for the interoperability task;
5. it is not merely transport/session state from A2A, MCP, AIP, UCP, or another protocol;
6. it does not require TriHerm to invent a lifecycle or authority model that the source does not expose.

If those conditions do not hold, the concept stays outside the minimal core.

## Classification vocabulary

- `EARNED_OBSERVATION` — already survived meaningful cross-system evidence at the observation layer.
- `NORMALIZED_CANDIDATE` — likely useful across representations, but not yet sufficiently proven for canonical promotion.
- `REFERENCE_ONLY` — preserve stable identifiers, provenance, and authority pointers without owning the underlying semantics.
- `DEFERRED` — economically meaningful, but current evidence is insufficient to normalize safely.
- `PROTOCOL_SPECIFIC` — belongs to an external protocol representation, not the economic core.
- `SYSTEM_SPECIFIC` — belongs to an operational platform and should remain there unless a later experiment proves otherwise.
- `CROSS_CUTTING_REQUIRED` — required metadata/invariants, but not an economic business object.

## Candidate decision matrix

| Candidate | Current classification | Why | Promotion gate |
|---|---|---|---|
| Provider / business identity | `REFERENCE_ONLY` | Provider identity and capability discovery already live in business systems and protocol discovery surfaces. TriHerm needs correlation, not a new universal identity authority. | Promote only a minimal identity facet if two independent protocols require the same normalized fields and source references alone are insufficient. |
| Requirement / service request | `NORMALIZED_CANDIDATE` | AIP already defines structured intake; UBL has mature request/RFQ prior art. TriHerm may need a protocol-neutral request representation for translation, but the current plumbing fixture is not enough to establish a universal requirement model. | Map at least two independent request representations while preserving constraints, location/privacy boundaries, and source authority without vertical forks. |
| Offer / quote | `NORMALIZED_CANDIDATE` | Quote semantics are prior art in AIP and UBL and exist natively in FSM/CRM systems. The interoperability need is translation and provenance, not invention. | Resolve exact money representation first; then prove reversible-enough mapping across at least one protocol representation and one real operational quote/estimate source. |
| Commitment / order / accepted obligation | `DEFERRED` | AIP Bind is an active-relationship handoff, while UBL Order creates a contractual obligation. These are not safe universal synonyms for booking, accepted estimate, payment, or work authorization. | Observe at least two authoritative commitment transitions and prove a common invariant more precise than `accepted=true`. |
| Operational Job / Work Order | `REFERENCE_ONLY` | Job/work-order lifecycle belongs to the provider system. A2A/MCP task lifecycle is also not the physical-service lifecycle. TriHerm should preserve source identity and relationships, not replace the FSM. | Only normalize a narrow facet if cross-system coordination cannot be achieved with references plus earned sub-primitives such as Occurrence. |
| Occurrence | `EARNED_OBSERVATION` | ServiceTitan-shaped Appointment and a real Jobber Visit both support a distinct child work occurrence with independent identity, parent relationship, source-native status, and nullable schedule. | Do not add lifecycle semantics. Canonical promotion requires an explicit decision that the current cross-system evidence is sufficient or a further independent falsifier materially changes that confidence. |
| Provider completion | `DEFERRED` | Completion may exist at Job, Visit/Appointment, task, line item, or obligation granularity. Jobber proved Visit completion can coexist with an open parent Job. | Define the claimed subject/granularity and authority explicitly, then test at least two independent sources. |
| Evidence | `REFERENCE_ONLY` | Photos, signatures, notes, documents, timestamps and proof bundles are extensive prior art. The current need is to retain references, hashes, source, subject, and provenance where available rather than invent a new evidence envelope. | Promote a minimal evidence reference only when a real verification/coordination path requires common fields across independent evidence producers. |
| Verification | `DEFERRED` | ERC-8183, VCAP, RAILS, TessPay and adjacent work already cover evaluator/proof/verification patterns. TriHerm has not yet implemented a real verifier authority or policy boundary. | Implement one real verification consumer and prove which decision inputs/outputs must be common across rails/protocols. |
| Customer acceptance / dispute | `DEFERRED` | Jobber `clientConfirmed` was deliberately not treated as economic acceptance. Customer acceptance, operational sign-off, dispute, and quote acceptance can be distinct events. | Observe authorized customer decisions from at least two sources and preserve actor/delegation/subject semantics. |
| Settlement / payment | `REFERENCE_ONLY` | Money movement belongs to the selected settlement rail. TriHerm may coordinate conditions and references around settlement without becoming the payment system. | Resolve exact money representation; then test adapter-neutral references/conditions against at least one real settlement rail. |
| Protocol task/session/context IDs | `PROTOCOL_SPECIFIC` | AIP sessions/offers, A2A Task/Context IDs, MCP Tasks, and UCP operation/session identifiers have protocol-specific lifecycle and authority. | Never promote merely for convenience. Keep correlation links instead. |
| Source status / provider-native lifecycle | `SYSTEM_SPECIFIC` | Current experiments show provider-native statuses carry meaning that should not be flattened into an invented universal enum. | Normalize only after independent sources prove a decision-relevant common state with equivalent semantics. |
| Provenance / authority / correlation | `CROSS_CUTTING_REQUIRED` | Interoperability is not auditable without knowing source system, source object ID, observed/confirmed time, protocol refs, and who had authority for the fact or mutation. | Keep mandatory as invariants around normalized data; do not model them as a business lifecycle object. |

## Minimal core supported today

The current evidence does **not** justify the full chain:

```text
Requirement -> Quote -> Commitment -> Job -> Completion -> Evidence -> Verification -> Settlement
```

as a set of canonical TriHerm primitives.

The smallest defensible interoperability surface today is closer to:

```text
correlation + provenance/authority
          |
          +-- experimental Requirement representation
          +-- experimental Quote representation
          +-- earned Occurrence observation
          +-- references to authoritative operational/protocol objects
```

Everything else remains source-native, protocol-specific, reference-only, or deferred until an interoperability requirement forces normalization.

## What this implies for the current experimental schema

`schemas/service-workflow.schema.json` remains useful as a historical executable translation fixture, but its required members MUST NOT be read as the minimal TriHerm protocol/core.

In particular:

- required `completion` does not prove a universal completion primitive;
- required `customer_decision` does not prove a universal acceptance/dispute primitive;
- the normalized `job.status` enum is fixture-specific and should not be expanded or treated as authoritative cross-system lifecycle;
- numeric quote amounts are not an accepted long-term money representation;
- the absence of `Occurrence` from that schema does not invalidate the earned observation-layer vocabulary.

No schema migration is part of TH-INTEROP-15.

## Existing protocol/standards boundaries checked for this gate

### AIP

AIP v0.1.0 defines Discover -> Submit -> Offer -> Review -> Bind for agent-mediated service onboarding. Reuse those semantics where applicable; do not rename them into supposedly novel TriHerm primitives.

Primary source: https://agent-intake-protocol.github.io/agent-intake-protocol/whitepaper.html

### A2A

A2A `Task` is the agent protocol's stateful unit of work and carries task status, messages, and artifacts. Its lifecycle must remain separate from provider Job/Visit/Appointment lifecycle.

Primary source: https://a2a-protocol.org/dev/specification/

### MCP

MCP Tasks provide durable/asynchronous request execution mechanics and deferred result retrieval. They are transport/execution mechanics, not proof that physical service work was completed satisfactorily.

Primary source: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks

### UCP

The stable 2026-04-08 UCP specification defines discoverable services/capabilities and commerce surfaces. Use UCP semantics only where the selected service/capability actually applies; do not infer a generic field-service lifecycle from the existence of a UCP transport or capability.

Primary source: https://ucp.dev/2026-04-08/specification/overview/

### UBL

UBL 2.4 contains Request For Quotation, Quotation, Order and related mature procurement semantics. Requirement/quote/order concepts therefore have strong prior art and must not be presented as novel primitives.

Primary source: https://docs.oasis-open.org/ubl/UBL-2.4.html

### Evidence / verification prior art

See `research/prior-art.md` for ERC-8183, RAILS, TessPay, and VCAP. TH-INTEROP-15 treats these as reasons to avoid inventing a new evidence/verification object without a concrete deployment need.

## Falsification tests for the next implementation

The next code-bearing experiment should attack one of the remaining uncertain boundaries, not add another broad schema.

High-value options:

1. **Requirement translation falsifier** — take one real/official-shaped service request through two independent protocol/system representations and measure what cannot be normalized without semantic loss.
2. **Quote translation falsifier** — after the exact-money decision, map one authoritative quote/estimate through AIP/UBL or another independent representation and test round-trip/auditability.
3. **Commitment authority falsifier** — compare two real binding/acceptance transitions and determine whether a common `Commitment` concept exists without conflating quote acceptance, booking, order creation, payment, and work authorization.
4. **Evidence/verification falsifier** — use a real evidence producer and verifier to determine whether TriHerm needs a shared evidence reference/verification decision surface at all.

Do not select an option because it produces the largest schema. Select the smallest experiment that can invalidate an architectural assumption.

## Gate outcome

TH-INTEROP-15 should PASS if it reduces the candidate core and makes the next falsifier more precise.

It should FAIL if the result is merely a renamed end-to-end commerce ontology or if it assumes TriHerm must own every stage of the transaction.
