# TH-INTEROP-25 — Authoritative Operational Quote Gate

_Status: implementation prepared; authoritative live evidence is still pending. This branch must not be described as proving live Jobber Quote interoperability until the opt-in live test succeeds against a Jobber test account._

_Primary public sources rechecked: 2026-09-07._

## Sequence decision

The preferred source for this gate was a direct ServiceTitan Integration Environment because a successful read would also advance the separate second-live-operational-origin track. ServiceTitan documents a dedicated Integration Environment and OAuth2/App-Key access, but this development environment currently has no ServiceTitan app key, client credentials, tenant ID, or integration-environment access available.

The approved fallback is therefore **Jobber Quote**. This does not advance the second-live-origin track because Jobber is already the repository's first live operational authority, but it can still satisfy the immediate quote-authority gate once a real Quote is read through the existing authorized Jobber test-account path.

## Why Jobber Quote is a useful falsifier

Current Jobber documentation describes `Quote` as a cost estimate sent by a service provider before work and exposes source-native fields including:

- encoded Quote ID;
- `quoteStatus`;
- created/updated/transition/sent timestamps;
- optional associated `Request`;
- Jobs converted from the Quote;
- Quote line items, amount/tax structures, terms/disclaimer, and other source-specific data.

Current Jobber rate-limit examples also query `Quote.cost`, while the high-level Quote field listing emphasizes `amounts: QuoteAmounts!` and does not enumerate the nested amount fields. The experiment therefore does **not** assume any monetary field names or types from those examples.

Primary references:

- Jobber developer/API overview: https://developer.getjobber.com/docs/
- Jobber queries, auth headers, and endpoint: https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/
- Jobber API versioning: https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/
- Jobber rate limits and Quote query-cost examples: https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/
- Jobber test-account / GraphiQL setup: https://developer.getjobber.com/docs/getting_started/
- ServiceTitan API developer portal: https://developer-next.servicetitan.io/
- ServiceTitan Integration Environment / V2 setup: https://help.servicetitan.com/v1/docs/get-started-with-api-dev-portal-v2
- ServiceTitan first API call and integration OAuth flow: https://developer-next.servicetitan.io/docs/getting-started/first-api-call

## Read-only experiment

`src/jobber-quote-observation.ts` adds one PII-minimized query for:

- Quote ID;
- source-native status and timestamps;
- source `Request.id` when present;
- all converted Job IDs, with pagination;
- no monetary fields in the operational Quote query.

It deliberately does **not** query client identity, property/address, message text, notes, attachments, or other customer content.

The observer fails closed if the mutable Quote snapshot changes while paginating its converted Job references, if pagination counts disagree, or if duplicate converted Job IDs appear.

## Request-association falsifier

Jobber's current documentation establishes that a Quote can have an associated `Request`; it does **not**, by that field description alone, establish the stronger directional invariant that the Quote is a response to that Request in the same sense as the AIP intake -> Offer or UBL RFQ-line -> Quotation evidence already earned by `OfferResponseObservation`.

```text
Jobber Quote.id
    + native associated Quote.request.id
        -> source-native association only
        != proven responds-to relation
```

If `request` is present, TH-INTEROP-25 preserves it as `associated_request` only. If `request` is null, the association remains absent. A converted Job relation, status transition, sold/approved state, booking, payment, or any other downstream fact must not be substituted for either the association or a responds-to direction.

Therefore this gate may **falsify or narrow** the current response-relation hypothesis rather than confirm it. `OfferResponseObservation` remains unchanged and AIP/UBL-only until stronger authoritative provenance proves that the Jobber association has the same directional meaning.

## Exact-money result under test

TH-INTEROP-24 requires a lossless source representation plus grounded asset/scale metadata before exact monetary equality can be claimed.

Rather than guessing the current `QuoteAmounts` or line-item schema, the live gate performs GraphQL type introspection for `Quote`, `QuoteAmounts`, and `QuoteLineItem`. This reads schema metadata only, not customer data. `Float` fields are recorded for field-specific review, but their existence alone does not make every such field monetary or decision-critical.

Therefore the schema observation records:

```text
normalized_exact_value = null
```

with explicit blocking reasons. This is a valid falsification outcome. The adapter must not reconstruct a decimal string from a JavaScript `number` and pretend the original exact source representation survived. Schema metadata alone also does not establish whether a field means customer-facing total, cost, tax, discount, or another business concept.

The richer Jobber amount, line-item and tax **values** remain unqueried until the live schema observation establishes which fields exist and a separate semantic decision says which are necessary. No monetary field names are guessed in the operational query.

## What remains unmapped

Even after a successful live read, this gate does not automatically normalize:

- Jobber Quote lifecycle/status into a universal lifecycle;
- any `cost`/amount field into Quote total or price merely from its name;
- `amounts`, taxes, discounts, fees, deposits, or financing;
- line-item quantity/unit/price meaning;
- disclaimer, message, or terms semantics;
- Quote approval into customer acceptance or work authorization;
- Quote -> Job conversion into Commitment;
- booking, payment, completion, or settlement.

`Commitment` remains deferred exactly as before.

## Live gate

Use synthetic/test-account data only. No mutation is required by this repository; seed/select the Quote in the Jobber test UI.

Any synthetic/test-account Quote is acceptable. A Quote with a native Request association proves only that the association exists on that source object; it does not by itself prove the directional response relation. A Quote with `request = null` is equally valuable negative evidence. Converted Jobs may be zero or more.

Run:

```bash
JOBBER_ACCESS_TOKEN='...' \
JOBBER_QUOTE_ID='...' \
npm run test:jobber-quote-live
```

Optional version override:

```bash
JOBBER_GRAPHQL_VERSION='2025-04-16'
```

Do not commit access tokens, refresh tokens, authorization codes, customer data, or unsanitized live responses.

## Completion condition

TH-INTEROP-25 is not complete merely because deterministic mocks pass. The gate can advance only after:

1. a real read-only Jobber Quote succeeds through the current authorized test-account API path;
2. source Quote ID/status/timestamps survive without PII promotion, and the native Request association is preserved exactly as present or absent without being renamed `responds_to`;
3. Job references remain references rather than lifecycle/Commitment semantics;
4. current GraphQL monetary field types are introspected rather than guessed, and any `Float` boundary remains explicitly non-exact unless stronger lossless source evidence is obtained;
5. a sanitized evidence record can be captured without secrets/customer data;
6. CI and exact-SHA adversarial review remain clean.

If live Jobber evidence has no Request association or does not establish a directional response relation, narrow or reject the cross-system response hypothesis instead of repairing it with invented semantics.
