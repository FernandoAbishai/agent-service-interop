# TriHerm Protocol Kernel v0.1-experimental

_Status: executable pre-specification contract for falsification. This is not a stable, normative, or proven-universal protocol release._

## Purpose

This kernel is the smallest structural contract currently being tested for TriHerm coordination. It deliberately separates **coordination mechanics** from **economic semantics**.

The executable JSON representation is `schemas/triherm-kernel-envelope.schema.json`. That schema is one experimental JSON encoding; it does not make HTTP, JSON, this repository, or any current adapter the permanent transport or implementation authority for the protocol.

## Kernel fields

| Field | Experimental meaning |
|---|---|
| `kernel_version` | Version of this structural kernel contract, currently `0.1.0-experimental`. |
| `profile` | Identifies the profile that owns the meaning of `payload`. Profile IDs/versions are not declared stable by this kernel. |
| `message_id` | Sender-generated envelope identity. It is not correlation identity, operational identity, or authority. |
| `correlation` | Optional opaque coordination token plus typed reference links when they exist. Its global uniqueness/resolution semantics are deliberately undefined in v0.1; it does not own operational state. |
| `actors` | Envelope-local actor references and profile-defined roles. `actor_ref` is not a global identity or authentication assertion. |
| `references` | Explicitly typed `protocol` or `operational` references. The array may be empty before external references exist; source-native IDs remain intact whenever references are present. |
| `authority` | Descriptive attribution for payload scopes. The array may be empty when authority is not known or not applicable; entries do not prove authentication, delegation, ownership, or permission to mutate a source. |
| `provenance` | Identifies when and by which envelope actor the representation was produced, plus source references from which it was derived. |
| `capabilities` | Optional required/optional feature descriptors carried by this envelope for compatibility experiments. Their presence is not proof of negotiated support, authorization, or a registered public namespace. |
| `extensions` | Optional experimental extension data. Extension presence does not promote data into the kernel. |
| `payload` | Profile-owned JSON object. The kernel intentionally assigns no economic lifecycle semantics to its members. |

## Referential invariants

The JSON Schema validates shape. The experimental conformance tests add cross-field invariants that JSON Schema does not express directly:

1. `actor_ref` values are unique within one envelope;
2. `ref_id` values are unique within one envelope;
3. actor, correlation, authority, and provenance reference IDs resolve to entries in `references`;
4. authority/provenance actor references resolve to entries in `actors`.

These local references make an envelope auditable without asserting that TriHerm is a global identity provider or operational source of truth.

Correlation, external references, capability declarations, and authority attribution are not mandatory merely to make an envelope look complete. A correlation token may also precede its first external reference. A profile/capability interaction may legitimately precede any operational or protocol object, and unknown authority remains explicit as an empty array rather than being fabricated.

The repository's current internal `workflow_id` may be used as an experimental mapping input, but it is **not automatically protocolized** as the kernel's canonical `correlation_id`, nor does this kernel define global lookup or uniqueness for either identifier.

## Explicitly outside v0.1-experimental

The kernel does **not** define universal objects or lifecycle state for:

- intent / requirement;
- offer / quote;
- commitment / order / booking;
- Job / Work Order / Task;
- occurrence / appointment;
- completion or evidence;
- customer decision / dispute;
- authorization or delegation;
- command preconditions or distributed replay semantics;
- payment, obligation, verification, or settlement.

Those belong to later profiles or remain source/protocol-specific unless they independently earn promotion. In particular, an A2A Task is still not a physical Job, completion is still not acceptance, and payment is still not authorization or fulfillment.

## Promotion gate

`0.1.0-experimental` should be narrowed or replaced if independent operational systems or protocol surfaces show that these structural fields create false equivalence, hide authority, or require system-specific semantics in the kernel.

No field in this contract should be called stable or universal until the evidence gates in `docs/protocol-thesis.md` are satisfied.
