# TH-INTEROP-19 — Circle Gateway live gate

## Purpose

Validate the already-merged public-resource boundary against a real Circle Gateway testnet nanopayment without changing the business-workflow semantics.

This is a live integration gate, not a new canonical model.

## Required invariants

A successful live run MUST prove all of the following:

1. The fixed public synthetic resource advertises a compatible Gateway x402 payment option.
2. An unpaid request is negotiated through HTTP 402.
3. A pre-funded buyer EOA can complete exactly one nanopayment through `GatewayClient.pay()`.
4. The response is the same shared `WorkflowInspection` projection used by the non-paid interoperability surfaces.
5. The authoritative file-backed FSM is byte-for-byte semantically unchanged before and after payment.
6. Payment-layer payer/payment metadata is not promoted into customer identity, agent identity, workflow authority, quote acceptance, job state, completion, or verification.
7. The live test performs no automatic deposit, withdrawal, or funding transaction.
8. Buyer and seller addresses must differ.

## Explicit non-goals

- no mainnet funds
- no production seller listing
- no private workflow access
- no buyer-selectable workflow ID
- no automatic faucet interaction
- no automatic Gateway deposit
- no Jobber write
- no AIP Bind mutation
- no service quote payment
- no service-obligation settlement
- no canonical Payment, Authorization, Wallet, or Customer object

## Local setup

Create an untracked `.env.circle-live` file:

```dotenv
CIRCLE_GATEWAY_BUYER_PRIVATE_KEY=0x...
CIRCLE_GATEWAY_SELLER_ADDRESS=0x...
CIRCLE_GATEWAY_CHAIN=baseSepolia
X402_INSPECTION_PRICE=$0.001
```

The buyer address derived from `CIRCLE_GATEWAY_BUYER_PRIVATE_KEY` must already have enough **Gateway available balance** to cover the inspection price. Funding/deposit is deliberately outside the test.

Run:

```bash
npm run test:circle-live
```

The test first calls `GatewayClient.supports(url)`, then `GatewayClient.pay(url)`, then verifies the returned resource, FSM immutability, and a decrease in the buyer's Gateway available balance.

## Interpretation

Passing this gate means only:

> Circle Gateway can act as an external x402 payment/access rail for one explicitly public synthetic interoperability resource without taking authority over the underlying real-world service workflow.

It does **not** mean that payment grants authorization to private workflows, that the buyer is the service customer, or that the underlying plumbing obligation has been paid, accepted, fulfilled, or settled.
