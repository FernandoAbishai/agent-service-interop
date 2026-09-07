# TH-INTEROP-22 — Protocol kernel v0.1-experimental

_Status: executable pre-specification falsification gate. Not a stable or normative protocol release._

## Question

Can TriHerm define a small, authority-aware coordination envelope that is useful across heterogeneous agent protocols and operational systems **without** promoting the current plumbing workflow, AIP lifecycle, provider Job model, or payment surface into universal business semantics?

## Kernel hypothesis

The minimum structural surface worth falsifying is:

```text
kernel/profile version
message identity
envelope-local actors + roles
optional correlation
typed protocol / operational references
descriptive authority attribution
provenance
optional capability requirements
extensions
profile-owned payload
```

The hypothesis is intentionally narrower than a universal commerce ontology. `payload` belongs to a separately versioned profile; the kernel does not define Intent, Offer, Commitment, Job/Task, Occurrence, Evidence, Decision, authorization/delegation, payment, or Settlement semantics.

## Design constraints inherited from prior gates

1. correlation is never operational authority;
2. protocol IDs and operational IDs stay typed and separate;
3. actor/message/correlation identifiers are local/opaque coordination identifiers, not global identity or authentication; the current internal `workflow_id` is not automatically the protocol correlation token;
4. authority attribution is descriptive, not proof of delegation, ownership, or permission to write;
5. provenance identifies representation production and source derivation without transferring source authority;
6. missing correlation/references/authority remain absent or explicitly empty instead of being fabricated;
7. profile payload semantics do not become kernel semantics merely because the kernel can carry them;
8. capability descriptors do not prove negotiated support or authorization;
9. the JSON Schema is one experimental encoding, not a permanent transport decision.

## Executable evidence

- `schemas/triherm-kernel-envelope.schema.json` defines the v0.1-experimental JSON shape;
- `fixtures/protocol/kernel-envelope.example.json` demonstrates AIP + operational reference coexistence without identity conflation;
- `tests/protocol-kernel-schema.test.ts` validates the fixture, protocol/operational reference separation, absence of top-level economic primitives, profile-owned payload evolution, local referential integrity, explicit experimental versioning, rejection of command/global-identity/permission fields, and a pre-correlation envelope with no fabricated external references.

## Falsification conditions

Narrow or replace this kernel if later independent systems/protocols show that:

- a mandatory structural field forces fabricated semantics or identity;
- authority cannot be represented without embedding system-specific lifecycle logic;
- protocol and operational references require materially incompatible relationship models;
- `profile`/`payload` separation cannot preserve decision-critical semantics;
- capability negotiation belongs entirely outside coordination envelopes;
- the reference/correlation model cannot survive a second live operational origin;
- interoperable authorization/replay requires kernel-level semantics incompatible with this shape.

## What this gate does not prove

It does not prove universality, market need, independent implementation interoperability, production authorization, external write safety, distributed exactly-once behavior, settlement semantics, or that any economic primitive belongs in the public TriHerm protocol.

The next specification-oriented gate should attack economic interaction semantics only after this structural contract passes review; the stronger deployment falsifier remains a second live operational origin.
