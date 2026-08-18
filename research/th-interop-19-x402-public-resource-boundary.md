# TH-INTEROP-19 — x402 Public-Resource Boundary

_Status: code-bearing falsifier following accepted TH-INTEROP-17 and merged TH-INTEROP-18._

## Question

Can x402 protect one explicitly public synthetic workflow inspection without making payment equivalent to identity, workflow authorization, service authorization, service payment, or fulfillment?

## Decision

The paid surface exposes one fixed resource:

```text
GET /api/x402/public/workflow-inspection
```

The buyer does not provide a workflow ID. The server is configured with exactly one `X402_PUBLIC_WORKFLOW_ID`, which must point to synthetic/public test state.

This is intentionally stronger than a paid parameterized workflow route. It prevents a paying caller from selecting, probing, or enumerating arbitrary private workflow identifiers.

## Required invariants

```text
x402 payment success
  != identity
  != delegation
  != workflow authorization
  != quote acceptance
  != service/work authorization
  != payment for the underlying real-world service
  != operational completion
  != customer acceptance
  != fulfillment verification
```

The payment middleware may expose payment-layer fields such as payer, amount, network, and transaction. Those fields remain payment provenance only and are not promoted into the shared `WorkflowInspection`, canonical workflow identity, customer identity, or operational authority.

## Circle Gateway adapter

The runtime adapter uses the official `@circle-fin/x402-batching` Express middleware against Circle Gateway testnet by default.

Environment boundary:

- `X402_PUBLIC_WORKFLOW_ID` — explicit synthetic/public workflow;
- `X402_SELLER_ADDRESS` — payout EVM address;
- `X402_INSPECTION_PRICE` — defaults to `$0.001`;
- `X402_FACILITATOR_URL` — defaults to Circle Gateway testnet;
- `FSM_STATE_PATH` — existing file-backed operational-state path.

No private key is required on the seller resource server. Buyer credentials/funding are outside deterministic CI and must never be committed.

## Deterministic tests

CI uses an injectable synthetic payment gate rather than external network calls. It proves:

1. unpaid public resource returns `402`;
2. successful test payment returns the same shared inspection semantics;
3. paid inspection does not mutate FSM state;
4. payer/payment/customer fields are absent from the returned workflow representation;
5. there is no buyer-selectable workflow identifier on the paid surface;
6. a successful payment cannot make a missing configured public workflow exist.

## Deliberate exclusions

- no mainnet payment;
- no production Circle Marketplace listing;
- no private workflow access through x402;
- no OAuth/ACL system in this experiment;
- no claim that payer identity equals business/customer identity;
- no quote or plumbing-service settlement through this x402 route;
- no Jobber writes;
- no canonical Payment/Authorization/Entitlement object;
- no ERC-8183 integration;
- no Circle-specific fields in the canonical interoperability representation.

## Next gate

If deterministic CI passes, run one opt-in Circle Gateway testnet payment against the fixed public endpoint using an externally funded test buyer. Only after that live gate should the repository attempt the Circle stranger test / Marketplace submission.

A later independent falsifier should address private-resource identity, authority, delegation, and disclosure entitlement rather than smuggling those semantics into payment.