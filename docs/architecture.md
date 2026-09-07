# Architecture: normalized interoperability state without operational authority

_Status: architectural direction for the experiment, not a production platform contract._

## Decision

This repository adopts the following working architectural principle:

> **The canonical model is a normalized interoperability representation of economic workflow state. It is not, by default, the authoritative operational system.**

A canonical representation may eventually be persisted for correlation, provenance, reconciliation, or multi-protocol projection. Persistence alone does not make it the source of truth for provider operations.

The implementation should therefore grow with the simplicity of a derived projection while preserving a path toward a horizontal interoperability layer.

## Correlation is separate from operational authority

The repository now keeps interoperability correlation outside the operational file-FSM record:

```text
workflow_id
  |
  +-- operational_refs[] ---> authoritative/source-system objects
  |
  +-- protocol_refs[] ------> AIP/A2A/future protocol objects
```

`workflow_id` is repository-local correlation only. It is not a Job ID, AIP session, A2A Task, customer identity, ownership proof, authorization grant, or provider-independent source of truth. The correlation store persists references only; authoritative lifecycle state remains in the operational source.

The inspection layer reads the correlation, then asks an operational observer for source-backed facets. A missing semantic remains absent. The current minimal `WorkflowInspection v0.3` does not require quote, completion, verification, or customer-decision fields merely to make every source look alike.

## Read path

```text
Authoritative operational system
        |
        v
provider adapter
        |
        v
normalized canonical representation
        |
        +--> AIP view
        +--> future independent views
```

For fields owned by an external operational system, the canonical representation records an observed/confirmed state rather than independently declaring a new operational truth.

## Write path

```text
Agent / protocol
        |
        v
intent or command
        |
        v
authorization + adapter boundary
        |
        v
authoritative operational system
        |
        v
confirmed outcome
        |
        v
normalized canonical representation
```

A protocol interaction must not mutate authoritative canonical business state first and rely on an operational system to catch up later.

In this experiment:

```text
AIP Bind
   -> adapter command / experimental handoff point
   -> file-backed FSM
   -> quote accepted + job scheduled
   -> canonical projection of the confirmed FSM state
```

AIP Bind is therefore not treated as a universal synonym for booking, payment, scheduling, or execution. In the current synthetic adapter, declared consent scope and agent-ID continuity are validation inputs; they are not proof of an external authentication or delegation authority.

## Authority is domain-specific

There may be no single authoritative system for an entire economic workflow. Authority can differ by domain or field.

| State | Current experiment authority | Canonical role |
|---|---|---|
| provider identity/configuration | provider fixture / future provider system | normalized reference |
| intake requirement | accepted AIP intake plus provider adapter | normalized requirement |
| quote status and amount | file-backed FSM | observed normalized quote |
| job status and schedule | file-backed FSM | observed normalized job |
| AIP offer/session identifiers | AIP adapter | protocol provenance/reference |
| customer PII at Bind | bind payload with declared consent scope, handed to operational adapter | do not treat as universal canonical identity or authorization proof |
| completion/evidence | future operational/evidence-producing system | normalize only what the source exposes |
| payment/settlement | out of scope; future settlement rail | reference/adapter boundary only |

This table is experiment-specific. A real integration must document authority explicitly rather than inheriting these assignments automatically.

## Canonical invariants

1. **Protocols are views and command surfaces, not the operational database.**
2. **Operational mutations execute through the authoritative adapter.** Canonical state reflects the confirmed result.
3. **Provenance is required.** A normalized object must retain enough source references to explain where important state came from.
4. **Normalization must not erase decision-critical provider semantics.** Provider-specific information may remain outside the canonical core.
5. **No field becomes canonical merely because one protocol or one FSM exposes it.**
6. **Missing semantics remain explicit.** Do not overload unrelated fields to create the appearance of interoperability.
7. **Canonical persistence, event sourcing, conflict resolution, and orchestration are not implied by this decision.** They require separate evidence.
8. **Correlation does not imply authority.** `workflow_id` links references but cannot authorize or mutate operational state.
9. **Protocol references and operational references remain separate.** An AIP/A2A identifier is never silently promoted into operational identity, and an operational object ID is never presented as a protocol identity.

## Future multi-system classification

When comparing multiple real FSM/CRM/ERP systems, candidate concepts should be classified as one of:

- `CANONICAL` — stable meaning across systems and useful for interoperability;
- `EXTENSION` — useful normalized concept but vertical/provider-specific enough to stay outside the minimal core;
- `REFERENCE_ONLY` — retain identifier/provenance without attempting semantic ownership;
- `PROTOCOL_SPECIFIC` — belongs to an external protocol representation;
- `SYSTEM_SPECIFIC` — belongs to one operational platform and should remain there;
- `NOT_NORMALIZABLE` — mapping would lose decision-critical meaning or create false equivalence.

The goal is not to maximize the size of the canonical model. The goal is to find the smallest stable translation boundary that survives multiple systems and protocols.

## What is deliberately undecided

This architecture does **not** yet decide that the project needs:

- a canonical database;
- an event bus;
- a workflow engine;
- distributed transactions;
- conflict-resolution machinery;
- a universal service/order/fulfillment schema;
- a TriHerm-specific public protocol;
- a provider-independent source of truth for all workflow stages.

Those components should be introduced only when implementation evidence requires them.

## Falsification / narrowing conditions

The normalized interoperability approach should be narrowed if experiments show that:

- canonical normalization removes semantics required to make real business decisions;
- most useful state remains system-specific and cannot be represented without large vertical forks;
- authoritative systems cannot expose or confirm the transitions required for safe command routing;
- reconciliation/conflict costs approach the cost of replacing the workflow;
- adding a normalized layer creates substantially more integration burden than direct protocol-to-system adapters;
- two independent protocol views require incompatible internal models for the same business state.

A negative result should reduce the canonical surface rather than trigger invention of a larger universal schema.
