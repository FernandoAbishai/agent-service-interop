# Contract status and version boundaries

This repository is an interoperability research testbed and pre-specification laboratory with executable reference adapters. Its strategic objective is to converge toward a TriHerm coordination protocol, but it does **not** currently publish a stable/normative TriHerm protocol or claim that its experimental schemas are universal standards.

## Contract classes

### Upstream normative inputs

These contracts come from external protocols or APIs and are version-pinned where the experiment depends on them:

| Input | Pinned version in this repository | Evidence boundary |
|---|---|---|
| Agent Intake Protocol | `0.1.0`, snapshot `2026-02-27` | Vendored manifest/intake/offer/bind-request JSON Schemas |
| A2A Protocol | `1.0` | Official JS SDK `@a2a-js/sdk@1.0.1`; HTTP+JSON surface |
| Jobber GraphQL | `2025-04-16` | Read-only Job/Visit query plus deterministic and opt-in live tests |
| x402/Circle adapter dependencies | `@x402/core@2.21.0`, `@x402/evm@2.20.0`, `@circle-fin/x402-batching@3.2.0` | Fixed public synthetic inspection resource only |

External versions are inputs to an experiment, not versions of a repository-local protocol.

### Repository-local experimental contracts

| Artifact | Version/status | Meaning |
|---|---|---|
| `schemas/service-workflow.schema.json` | `0.1.0-experimental` | Historical executable translation model; not the minimal interoperability core |
| `schemas/triherm-kernel-envelope.schema.json` | `0.1.0-experimental` | Minimal pre-specification coordination envelope: profile/version, actors, typed refs/correlation, authority, provenance, capabilities/extensions, and profile-owned payload; not a stable/normative protocol release |
| `openapi.yaml` | `0.3.0-experimental` | Description of experimental read-only inspection surfaces; v0.3 separates correlation refs from optional source-backed facets |
| `ServiceRequestObservation` | earned observation-layer vocabulary | Narrow AIP/UBL service-request facet; not canonical protocol state |
| `OccurrenceObservation` | earned observation-layer vocabulary | Cross-system Appointment/Visit observation used by ServiceTitan-shaped and Jobber mappings; no normalized lifecycle |
| `WorkflowInspection` | `0.3.0-experimental` shared projection | Requires protocol-neutral correlation refs; source-backed quote/job facets are optional and no AIP origin is required |

The v0.3 `workflow_id` is repository-local/internal correlation. It is not added to AIP as a protocol field, and this repository does not yet define private correlation discovery or entitlement semantics.

These local contracts are experimental evidence toward a future stable protocol, but none becomes normative merely by being repository-local or versioned as experimental.

The v0.1 experimental kernel is intentionally structural. Its `payload` is profile-owned, and the kernel does not define Intent, Offer, Commitment, Job/Task, Occurrence, Evidence, Decision, authorization/delegation, or Settlement lifecycle semantics. `actor_ref` is envelope-local rather than a global identity, and `authority` is attribution metadata rather than proof of authentication or permission to mutate a source.

The kernel's optional `correlation_id` is an opaque experimental coordination token. The repository's current internal `workflow_id` is not automatically its canonical protocol value, and v0.1 does not define global correlation discovery or uniqueness semantics.

Historical canonical projection requires that correlation ID explicitly; there is no current implicit `wf-{aip_session_id}` identity default. The only AIP-derived workflow lookup retained is the narrowly scoped read compatibility path for genuinely pre-correlation state.

### Historical artifacts

`docs/experiment.md` and `schemas/service-workflow.schema.json` record earlier experimental stages. Later narrowing results may supersede their architectural implications without erasing the original evidence.

## Compatibility policy today

There is no stable backward-compatibility guarantee for repository-local experimental contracts yet. Any incompatible change must:

1. identify which experimental contract changes;
2. update its explicit version or document why the change is non-contractual;
3. update fixtures and executable tests together;
4. preserve source/protocol IDs as references rather than silently reinterpreting them;
5. avoid presenting an experimental change as a new protocol standard.

Before a repository-local contract is described as stable, normative, or universal, the project should have at minimum a conformance suite, an explicit compatibility/versioning policy, evidence from independent implementations and operational origins, and an authority/provenance model that survives those mappings.

## Known contract gaps from the 2026-09-06 audit

- Protocol-neutral correlation has only synthetic evidence so far; a second live operational origin remains untested.
- Runtime AIP intake and Bind requests are checked against the vendored upstream schemas before adapter-local constraints. This is a runtime conformance gate for those two request shapes, not protocol certification.
- The manifest declares session-scoped retention, but the file-backed research store does not yet implement expiry/deletion semantics; do not interpret that declaration as a production retention guarantee.
- The canonical JSON Schema now has fixture/runtime projection tests; the OpenAPI description still lacks dedicated runtime contract validation.
- The UBL RFQ fixture is a semantic falsifier shape, not a claim of XML/schema conformance to a specific UBL release.
- Synthetic AIP intake/Bind replay now has explicit exact-retry and `409 IDEMPOTENCY_CONFLICT` behavior, but external-system write preconditions, reconciliation, and distributed exactly-once semantics remain open.

These are next-gate items, not permission to enlarge the normalized core.
