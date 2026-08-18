# TH-INTEROP-17 — x402 Paid-Capability Boundary

_Status: research-only architecture falsification gate. No runtime integration, schema migration, payment implementation, Circle-specific canonical object, or production claim is introduced by this document._

_Last checked against primary sources: 2026-08-18._

## Question

Can an existing real-world service workflow expose a paid, agent-discoverable capability through x402 without conflating payment for access to a digital resource with acceptance, authorization, settlement, execution, completion, or verification of the underlying real-world service obligation?

A secondary question is whether x402 should be modeled as another agent-facing business protocol in this repository, or instead as a transport/payment overlay that can coexist with AIP, A2A, MCP, OpenAPI, and existing operational systems.

## Why this gate exists

The repository already separates several kinds of state that are easy to collapse incorrectly:

- an A2A Task is not a physical service Job;
- provider completion is not customer acceptance;
- a Jobber Visit can complete while its parent Job remains open;
- payment state must not be used to invent operational completion;
- operational systems remain authoritative for their own business state.

x402 introduces another possible semantic collision. A successful x402 payment can prove that a client paid for access to a protected resource or capability. It does **not** by itself prove that a plumbing quote was accepted, that a field-service Job was authorized, that physical work was performed, that the customer accepted the work, or that the economic obligation represented by the real-world service was fulfilled.

This gate exists to preserve that distinction before any x402 code is added.

## External evidence snapshot

### x402 v2

The x402 v2 specification defines a payment protocol for access to internet resources. Its core types (`PaymentRequired`, `PaymentPayload`, `SettlementResponse`) are independent of transport and payment scheme. Representation is transport-specific, with HTTP, MCP, and A2A explicitly named as examples.

The core flow is:

```text
client requests resource
  -> resource requires payment
  -> client authorizes an accepted payment option
  -> resource server verifies authorization
  -> payment is settled according to the selected scheme/network
  -> resource is returned
```

For HTTP, the canonical v2 signaling uses:

- `402 Payment Required`;
- `PAYMENT-REQUIRED` response header;
- `PAYMENT-SIGNATURE` request header;
- `PAYMENT-RESPONSE` response header after successful settlement.

The x402 specification also defines facilitator verification/settlement interfaces and a Bazaar-style discovery model. Its discovery model is about x402-enabled resources, not a universal lifecycle for real-world service obligations.

Primary source:
- https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

### Circle Agent Marketplace / Sell

Circle currently presents agent selling as an API/resource model: an endpoint becomes a storefront, agents discover it, pay per call in USDC over x402, and call it without accounts or API keys.

Circle's current seller path requires an HTTP API, payout wallet, price per request, and Node.js 22.6+ for the documented Express path. Circle documents Gateway nanopayments and also recommends supporting vanilla x402 so non-Circle x402 buyers can transact with the service.

Circle Marketplace listing currently requires:

- a payable service that returns `402 Payment Required` when unpaid and serves the resource when paid;
- a published OpenAPI specification;
- a payout wallet address;
- manual review and wallet sanctions screening;
- a reachable endpoint that can pass ongoing health checks.

Circle describes its marketplace as using standards-based discovery, including x402 Bazaar, OpenAPI, and A2A discovery surfaces.

Primary sources:
- https://agents.circle.com/sell
- https://developers.circle.com/agent-stack/agent-marketplace
- https://developers.circle.com/agent-stack/agent-marketplace/become-a-seller
- https://developers.circle.com/agent-stack/agent-marketplace/get-listed

## Key architecture result before implementation

**x402 should not be treated as a new universal business-workflow protocol in this repository.**

The current evidence supports treating x402 as a payment/access overlay around a resource or capability:

```text
                 discovery / interaction surface

          AIP          A2A          HTTP/OpenAPI
           |            |                |
           +------------+----------------+
                        |
                        v
            shared interoperability view
                        |
                        v
             authoritative business system

x402 payment/access can overlay a payable capability
without becoming the business workflow itself.
```

Because x402 v2 separates core payment types from transport representation, later experiments may attach x402 semantics to HTTP, A2A, MCP, or another compatible request/response surface. TH-INTEROP-17 should therefore avoid creating an `X402Workflow`, `X402Job`, or similar protocol-specific copy of business state.

## Semantic boundary

The first implementation must keep the following statements executable and testable:

```text
x402 payment success
  != quote acceptance

x402 payment success
  != AIP Bind

x402 payment success
  != booking

x402 payment success
  != work authorization

x402 payment success
  != operational Job creation

x402 payment success
  != provider completion

x402 payment success
  != customer acceptance

x402 payment success
  != fulfillment verification
```

A successful x402 transaction may authorize or pay for the **digital capability invocation itself**. Any relationship to a separate real-world economic obligation must be explicit and must not be inferred from the payment protocol.

## Important terminology collision: `settlement`

This repository already uses `settlement` as a broad reference to economic payment rails around a service transaction.

x402 also uses `SettlementResponse` and `/settle` for settlement of the **x402 payment authorization associated with the protected resource**.

These meanings must not be collapsed.

For TH-INTEROP-17:

- `x402 settlement` means settlement/redemption behavior defined by the selected x402 scheme/network for the paid resource;
- `service-obligation settlement` means any economic settlement associated with the underlying real-world commercial obligation;
- one does not imply the other.

If code is added later, names and test descriptions must preserve this distinction explicitly.

## Candidate first paid capability

The safest first candidate is a **read-only workflow inspection capability** corresponding to the semantics already exercised by the A2A `inspect_service_workflow` skill.

Illustrative HTTP surface:

```http
GET /api/interop/workflows/{workflow_id}/inspection
```

Possible flow:

```text
unknown agent
  -> discovers HTTP/OpenAPI capability
  -> requests inspection
  -> receives x402 payment requirements
  -> pays for this API invocation
  -> receives normalized read-only workflow inspection
  -> operational workflow remains unchanged
```

The digital resource being purchased would be the inspection response, **not** the plumbing service, quote, appointment, or Job.

This candidate is preferred because the repository already has evidence that read-only A2A inspection can complete without mutating the file-backed FSM or implying physical-job completion.

## Hypotheses

### H17-A — Overlay hypothesis

A paid x402 capability can be attached to an existing workflow representation without introducing a second business workflow or payment-authoritative canonical model.

### H17-B — Authority hypothesis

The operational system remains authoritative. Successful payment for inspection does not mutate Job/Visit/Appointment/quote/acceptance/completion state.

### H17-C — Correlation hypothesis

The x402 resource invocation and payment result can be correlated to the same underlying workflow that A2A/AIP reference without reusing protocol-specific IDs as canonical IDs.

### H17-D — Rail-neutrality hypothesis

Circle Gateway batch settlement and vanilla x402 can remain external payment scheme/facilitator choices. The interoperability representation should not require Circle-specific fields to describe the underlying service workflow.

### H17-E — Discovery separation hypothesis

OpenAPI/A2A/x402 resource metadata can make a digital capability discoverable without proving that the same metadata is sufficient to describe a real-world commercial service offering.

## Falsifiers

TH-INTEROP-17 should fail or narrow if implementation requires any of the following:

1. duplicating the underlying workflow into x402-specific business state;
2. treating `PaymentRequired`, `PaymentPayload`, or `SettlementResponse` as canonical service-transaction objects;
3. treating payment for the API capability as quote acceptance, booking, work authorization, or payment for the underlying plumbing obligation;
4. mutating the authoritative FSM/Jobber state merely because an inspection payment succeeded;
5. inventing a universal lifecycle enum to reconcile x402 payment state with physical-service state;
6. embedding Circle Gateway semantics into the canonical interoperability representation;
7. requiring a new TriHerm payment protocol rather than reusing x402 and preserving references/provenance;
8. losing the distinction between payer, buyer/customer, authorized business actor, provider, and operational assignee where those identities are not actually equivalent;
9. making the paid HTTP representation unable to correlate to the same workflow exposed through A2A without protocol-specific copies;
10. claiming that OpenAPI/x402 marketplace discoverability is already sufficient for safe discovery and purchase of arbitrary real-world services without further evidence.

## Deliberate non-goals

TH-INTEROP-17 does **not** authorize:

- a production Circle Marketplace listing;
- mainnet USDC payments;
- a seller wallet committed to the repository;
- private keys, credentials, API tokens, or customer data in source control;
- payment for plumbing work;
- Jobber write mutations;
- quote acceptance through x402;
- AIP Bind changes;
- canonical schema migration;
- a new `Payment` or `Settlement` canonical entity;
- an ERC-8183 integration;
- escrow/dispute/arbitration design;
- a TriHerm-specific x402 extension;
- a universal real-world service discovery schema;
- claims that Circle, x402, A2A, AIP, UCP, or OpenAPI alone solve end-to-end real-world commerce.

## Minimal code-bearing experiment after this gate

If this research gate survives review, the next experiment should remain narrow.

### Phase 1 — OpenAPI/read-only resource

Expose one read-only inspection route and publish a small OpenAPI description for it.

Required invariant:

```text
HTTP inspection result and A2A inspection result
reference the same underlying workflow identity/state
without sharing protocol/session/task IDs.
```

No payment code is required to prove this first sub-step.

### Phase 2 — x402 testnet protection

Protect only that read-only route with x402 v2-compatible payment behavior on testnet.

The implementation should prefer standards-based x402 types/middleware and may test Circle Gateway as one external scheme/facilitator path. Circle-specific behavior must remain at the adapter/configuration edge.

The experiment should verify at minimum:

1. unpaid request produces a valid payment-required response;
2. paid request produces the same semantic inspection result as the unpaid-free test harness would have produced;
3. successful payment is correlated to the resource invocation;
4. payment success does not mutate operational workflow state;
5. A2A still resolves the same workflow after the x402 call;
6. no protocol-specific payment identifier becomes a canonical workflow identifier;
7. deterministic CI can run without funded wallets or secrets;
8. any live/testnet payment test is opt-in and keeps credentials out of the repository.

### Phase 3 — dual-rail compatibility test

Only after Phase 2 passes, test whether Circle Gateway and vanilla/onchain x402 can protect the same resource without changing the resource's business semantics.

This phase exists to test rail neutrality, not to maximize payment features.

## Evidence matrix

| Concern | Existing evidence | TH-INTEROP-17 target |
|---|---|---|
| Agent-facing discovery/intake | AIP manifest/intake | Do not replace; compare boundary only |
| Agent-to-agent interaction | A2A v1 `inspect_service_workflow` | Reuse same underlying workflow |
| Operational authority | File FSM + Jobber read-only evidence | Must remain unchanged by paid inspection |
| Cross-system observation | ServiceTitan-shaped + live Jobber Occurrence | No payment-state flattening |
| Service request normalization | Thin `ServiceRequestObservation` only | Do not enlarge because x402 exists |
| Payment/resource access | Not implemented | Test x402 as external overlay/reference |
| Real-world obligation settlement | Reference-only/deferred | Explicitly out of scope |
| Fulfillment/verification | Deferred | Must not be inferred from x402 success |

## Promotion rules

A successful x402 experiment would **not** automatically promote payment into the minimal canonical core.

The strongest likely result is narrower:

```text
x402 invocation/payment references
          +
correlation/provenance
          +
existing normalized observations/references
```

Payment remains `REFERENCE_ONLY` unless a later interoperability task proves that two independent rails require a small common payment facet that cannot be handled safely with references plus exact-money metadata.

Likewise, success would not prove a universal `ServiceCapability` object. Circle/OpenAPI/x402 discovery describes callable digital resources well; a later falsifier is still required to determine what additional semantics an agent needs to discover, evaluate, authorize, and coordinate a real-world service business safely.

## Strategic interpretation for this repository

The useful contribution is not another x402 demo. It is executable evidence that a paid agent-facing resource can coexist with:

- independent protocol identities;
- operational authority outside the payment layer;
- real-world service state that continues after the API call returns;
- explicit separation between digital-resource payment and physical-service obligation.

If this boundary survives implementation, the repository becomes a stronger public testbed for the interface between the open agentic web and authoritative real-world service systems without claiming ownership of the protocols on either side.

## Gate outcome required before coding

TH-INTEROP-17 passes as a research gate only if the next code-bearing experiment remains the narrow paid-inspection test above.

It should be rejected or rewritten if review turns it into:

- a general payment architecture;
- a Circle-specific product integration;
- a new commerce protocol;
- a claim that x402 settlement equals service settlement;
- a plan to monetize the underlying plumbing service before commitment/execution semantics are independently proven.

The intended next step after acceptance is therefore:

```text
OpenAPI description
  + read-only HTTP workflow inspection
  + cross-surface A2A equivalence test
  -> then x402 testnet protection
```

—not a mainnet seller launch.