# TriHerm protocol thesis

_Status: pre-specification research direction. This document states the strategic target of the repository; it does not declare a stable or normative protocol._

## Strategic objective

The long-term objective of this repository is to discover, falsify, and eventually specify a **preferably universal TriHerm protocol for agent-to-business and broader economic coordination**.

The target is not a universal operational database or a single schema that erases the meaning of every CRM, ERP, field-service system, payment rail, or external protocol. The target is a small system-neutral coordination layer that lets independent agents and businesses interoperate across those systems while retaining authority, provenance, and source-native semantics.

A useful working formulation is:

> **TriHerm Protocol aims to provide a common coordination contract through which agents and real-world businesses can discover or reference capabilities, express intent, exchange offers, establish commitments, coordinate execution, exchange evidence, record decisions, and reference settlement across heterogeneous systems without replacing those systems as operational authorities.**

Universality is an objective to earn through independent evidence, not a property claimed by the current implementation.

## What "universal" means here

The protocol should aspire to be:

- **system-neutral** — no Jobber, ServiceTitan, CRM, ERP, marketplace, or custom database is assumed to be the universal source of truth;
- **protocol-composable** — AIP, A2A, UCP, MCP, UBL, AP2, x402, and future protocols can remain independently meaningful rather than being renamed into TriHerm objects;
- **transport-neutral** — the economic coordination semantics should not depend on one HTTP binding, agent transport, SDK, or messaging system;
- **settlement-rail-neutral** — Stripe, stablecoins, x402, bank rails, tokenized deposits, and other mechanisms remain adapters or references unless a semantic is truly rail-independent;
- **authority-aware** — every state transition or observation can identify which system or actor is entitled to assert or execute it;
- **extension-friendly** — vertical-specific semantics can remain extensions or source-native data instead of expanding the universal core indefinitely.

Universal does **not** mean that every implementation must expose every lifecycle stage, that every source has equivalent objects, or that absent semantics should be synthesized.

## Candidate economic coordination sequence

The following is a research sequence, not a normative finite-state machine:

```text
discover capability
  -> express intent / requirement
  -> receive or negotiate offer
  -> establish commitment
  -> coordinate execution / fulfillment
  -> observe completion and/or evidence
  -> record acceptance, rejection, dispute, or follow-up
  -> reference or trigger settlement where applicable
```

A source or protocol may support only a subset. Stage order may vary by vertical. The purpose of the sequence is to test which semantics survive multiple systems and protocols, not to force all commerce into one lifecycle.

## Candidate kernel concepts

These concepts are candidates for future TriHerm protocol semantics. They are **not yet normative primitives** merely because they appear here:

- capability / offering reference;
- intent or requirement;
- offer;
- commitment;
- actor and role references;
- protocol-neutral correlation;
- operational execution references;
- occurrence / appointment / execution-unit references where the source exposes them;
- evidence references;
- explicit decision or acceptance references;
- settlement or obligation references;
- authority and provenance;
- authorization / delegation references;
- capability negotiation, extensions, and versioning.

Each candidate must be classified from implementation evidence. The architectural destination vocabulary remains `CANONICAL`, `EXTENSION`, `REFERENCE_ONLY`, `PROTOCOL_SPECIFIC`, `SYSTEM_SPECIFIC`, or `NOT_NORMALIZABLE`; evidence maturity can separately remain `EARNED_OBSERVATION`, `NORMALIZED_CANDIDATE`, or `DEFERRED` as used by the existing falsification work. An observation that has earned cross-system evidence is therefore not automatically a canonical protocol primitive.

## Existing architectural invariants remain in force

The protocol objective does not reverse the evidence already earned by this repository:

1. **Correlation is not operational authority.** A shared workflow/correlation identifier can link representations without becoming the provider's source of truth.
2. **Protocol identity is not operational identity.** An AIP session, A2A Task, payment ID, Jobber Job, or ServiceTitan Appointment must not be silently promoted into a universal identifier for another domain.
3. **Operational writes execute through the authority that owns them.** A normalized layer reflects confirmed outcomes rather than declaring provider state first and hoping external systems converge later.
4. **Missing semantics stay missing.** Interoperability is not improved by fabricating lifecycle, acceptance, schedule, identity, or payment facts.
5. **Completion, evidence, acceptance, authorization, and settlement remain separable.** One does not imply another without source-backed semantics.
6. **Normalization must be reversible enough to audit.** Source and protocol references must remain available to explain important derived state.
7. **Vertical-specific semantics may remain outside the kernel.** A small universal coordination core is preferred over a large universal business-object schema.

## Relationship to existing protocols

TriHerm should reuse and compose existing standards wherever they already solve a problem cleanly. The existence of AIP discovery/intake, A2A interaction mechanics, UBL procurement semantics, UCP commerce surfaces, MCP tool mechanics, AP2 authorization/payment patterns, or x402 settlement mechanics is not a reason to duplicate those capabilities.

The protocol thesis is instead that there may be a missing **authority-aware coordination boundary across protocols and operational systems**. This remains a hypothesis until independent implementations and real operational origins demonstrate it.

Therefore a future TriHerm protocol may define coordination semantics and mappings while delegating transport, specialized commerce behavior, business-system execution, and settlement to existing protocols/systems.

## Evidence gates before normative claims

The project should not call any local contract stable or universal until at least these gates are satisfied:

1. the concept survives mappings from more than one genuinely independent operational system;
2. the concept survives more than one independently meaningful agent/protocol surface;
3. source-native decision-critical semantics are preserved or explicitly left outside the kernel;
4. authority and provenance are unambiguous for reads and writes;
5. incompatible meanings are represented as extensions/references rather than false equivalence;
6. a conformance suite and explicit versioning/compatibility policy exist;
7. at least one implementation boundary exists independently of the original synthetic plumbing adapter;
8. write, authorization/delegation, reconciliation, and replay semantics are explicit before production mutation claims;
9. settlement mappings do not conflate payment with commitment, fulfillment, acceptance, or verification.

Universality should be weakened or the kernel narrowed whenever these gates fail.

## Near-term specification path

The recommended chronology after this thesis is:

1. **Protocol kernel v0.1-experimental** — envelope/versioning, actor/reference model, correlation, authority, provenance, extensions, and capability negotiation.
2. **Economic interaction primitives** — test intent/requirement, offer, and commitment across AIP, UBL, existing provider state, and another meaningful surface.
3. **Fulfillment semantics** — test execution references, occurrence, completion/evidence, and customer decision without collapsing them together.
4. **Authorization and delegation** — define who may issue a command, on whose behalf, with what scope and replay/precondition behavior.
5. **Settlement abstraction** — identify the minimal rail-neutral obligation/settlement references and map multiple rails without making payment the workflow authority.
6. **Independent operational origins and controlled writes** — test the same semantics against at least a second live authority and production-shaped mutation/reconciliation boundaries.
7. **Conformance and specification packaging** — only after the kernel survives the previous falsification gates.

The current repository remains the reference lab and adversarial conformance/falsification environment while that specification is being earned.
