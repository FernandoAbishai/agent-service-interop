# TH-INTEROP-20 — protocol-neutral workflow correlation

## Question

Can the shared inspection path correlate a service workflow without using an AIP identifier as the shared identity, while keeping operational authority in the source system and leaving unsupported semantics absent?

## Decision under test

`workflow_id` is a repository-local interoperability correlation identifier only.

It is not:

- an AIP session or offer ID;
- an A2A Task or Context ID;
- an operational Job/Work Order ID;
- customer identity;
- proof of ownership, authorization, delegation, completion, payment, or verification.

Correlation is stored separately from the operational file-FSM state and contains only:

```text
workflow_id
  +-- operational_refs[]
  +-- protocol_refs[]
```

## Falsifier

The deterministic suite exercises two origins through the same A2A/HTTP inspection path:

1. an AIP-backed synthetic workflow whose independent `workflow_id` maps to file-FSM requirement/quote/job refs plus AIP session/offer refs;
2. a provider-native synthetic job with no AIP origin and therefore no protocol refs.

The provider-native case exposes only the job facet that exists in its source. It must not manufacture quote, completion, customer-decision, payment, or verification semantics simply to satisfy the shared inspection contract.

## Compatibility boundary

Historical file-FSM state may predate the correlation store. The file-FSM inspection adapter retains a read-only fallback for the previous `wf-{aip_session_id}` lookup form. New state does not persist `workflow_id` in the operational FSM and does not generate shared identity from the AIP session.

## Result interpretation

Passing this gate supports only the structural claim that shared correlation/inspection need not depend on AIP identity or universal workflow facets.

It does not yet prove:

- correlation across two live operational systems;
- globally stable or cross-company workflow identity;
- private-resource authorization;
- write reconciliation or concurrency safety;
- universal quote/completion/verification/customer-decision semantics.

The stronger next falsifier is a second live operational origin using the same reference separation and missing-semantics discipline.
