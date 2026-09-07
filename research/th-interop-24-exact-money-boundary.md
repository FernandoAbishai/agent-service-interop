# TH-INTEROP-24 — Exact-Money Representation Boundary Falsifier

_Status: executable representation falsification experiment. This does not define a public TriHerm `Money` primitive, economic profile, pricing model, settlement model, asset registry, exchange-rate policy, or canonical-schema migration._

_Primary sources rechecked: 2026-09-07._

## Question

What minimum exact representation technique can preserve monetary quantities across decimal-major-unit, ISO 4217 minor-unit, and token atomic-unit source shapes without using binary floating point as the interoperability contract or pretending that different assets are economically equivalent?

## Source evidence

- **ISO 4217:2015** defines currency codes and, for currencies with minor units, the decimal relationship between the minor unit and the currency.
- **Stripe PaymentIntent/currency guidance** represents `amount` as an integer in the currency's minor unit, while Stripe also documents currency-specific exceptions such as ISK backward-compatible two-decimal representation and special payout rules for HUF/TWD. The experiment therefore does not label Stripe's scale basis as the ISO 4217 exponent.
- **UCP v2026-08-25** defines `Amount`/`Signed Amount` in ISO 4217 minor units and points to the currency exponent, including USD exponent 2, JPY 0, and KWD 3.
- **UBL 2.5 OASIS Standard (2026-08-12)** `AmountType` is based on `xsd:decimal` and requires `currencyID`. TH-INTEROP-23 remains pinned to UBL 2.4; 2.5 is used here only as current monetary prior-art context.
- **x402 v2** payment requirements carry a string amount plus explicit network and asset identifiers. Coinbase's current x402 documentation describes USDC prices in atomic units.
- **Coinbase's x402 agentic-wallet documentation** uses six-decimal USDC atomic units, and Circle's xReserve reference specification requires alignment with six-decimal native USDC. This gate does not generalize that precision to every token/network representation.

Primary references:

- https://www.iso.org/iso-4217-currency-codes.html
- https://docs.stripe.com/api/payment_intents/object
- https://docs.stripe.com/currencies
- https://ucp.dev/2026-08-25/specification/reference/
- https://docs.oasis-open.org/ubl/UBL-2.5.html
- https://docs.cdp.coinbase.com/x402/migration-guide
- https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service
- https://developers.circle.com/xreserve/concepts/usdc-backed-stablecoin-specification

## Candidate under falsification

The executable experiment tests a **representation technique**, not a protocol object:

```text
explicit asset identity
       +
signed arbitrary-precision integer coefficient (decimal string)
       +
explicit base-10 scale
```

with:

```text
mathematical value = coefficient * 10^-scale
```

The source representation is retained separately:

- raw source amount string;
- source representation (`decimal_major_units`, `iso4217_minor_units`, `stripe_currency_minor_units`, or `token_atomic_units`);
- source scale and the basis for that scale;
- explicit asset reference.

Trailing decimal zeroes may be removed from the mathematical value for magnitude comparison, but the original source amount/scale remains available for audit. Thus UBL-shaped `89.00 USD`, UCP-shaped `8900` USD minor units at ISO exponent 2, Stripe-shaped `8900` under Stripe's USD scale 2 rules, and their normalized mathematical magnitude can be compared without losing how each source represented the amount.

That cross-basis magnitude match is **not** itself an exact-quantity equivalence claim. A decimal-major source does not independently authenticate a caller-supplied ISO exponent or Stripe-specific currency scale, and this research module deliberately has no currency/token registry. `sameExactQuantity()` therefore fails closed across different scale bases; UCP's ISO-exponent basis and Stripe's currency-rule basis remain distinct even when both happen to use scale 2 for USD. The later authoritative quote/adapter gate must establish source-specific scale metadata before TriHerm could claim stronger equivalence.

## Asset identity is part of exactness

Equal numbers do not establish equal assets.

This gate deliberately distinguishes:

```text
ISO 4217 USD
    !=
USDC token on Base
    !=
USDC token on another network / contract
```

The token experiment therefore retains both network and asset ID. A ticker such as `USDC` alone is not treated as a universal asset identity. Likewise, this experiment does not define a global asset registry or claim that a stablecoin amount is economically interchangeable 1:1 with fiat merely because their displayed quantities match.

## Executable results

The tests demonstrate that:

1. UBL decimal major-unit `89.00 USD`, UCP `8900` USD minor units at ISO exponent 2, and Stripe `8900` USD minor-unit input under Stripe's USD currency rules can share the same normalized asset magnitude while preserving distinct scale bases/source representations; the module does not promote that cross-basis match into verified exact-quantity equivalence.
2. zero-decimal and three-decimal ISO currency examples retain their explicit exponent instead of assuming every fiat currency has two decimals;
3. signed minor-unit values remain exact without floating-point conversion;
4. token atomic units fit the same base-10 arithmetic shape, but asset namespace/network/ID prevents false USD/USDC or cross-network equivalence;
5. integer strings beyond JavaScript's safe-integer range remain exact;
6. sub-unit decimals such as `0.10` normalize exactly while their original lexical scale remains auditable, and negative zero normalizes mathematically without erasing the source lexical form;
7. contradictory fixed-scale metadata between two observations that both declare the same fixed-scale basis fails closed, and cross-basis equality also fails closed until independent evidence validates the scale metadata;
8. exponent notation, fractional minor-unit input, missing token identity, and other ambiguous representations fail closed instead of triggering rounding/conversion policy;
9. runtime JavaScript `number` input is rejected at this boundary even for integer-looking source amounts; an adapter must preserve/capture the source integer losslessly before passing it into the exact representation layer;
10. the historical plumbing `number` remains historical fixture data and is not silently promoted because its type does not itself state a major/minor/atomic unit basis or an exact interchange contract.

## What the gate does not earn

This result does **not** define:

- a public/canonical `Money` object;
- a universal price, tax, discount, fee, or line-item schema;
- an exchange-rate or stablecoin peg model;
- rounding, cash-rounding, FX, conversion, or display policy;
- a global token/asset registry;
- authentication of source-declared ISO exponents, token decimals, or asset metadata against an external registry;
- source-object business constraints beyond representation shape (for example, whether a particular upstream amount field permits negative values);
- a generic JSON parsing policy for integer-valued protocols. If an upstream integer is first materialized as an unsafe JavaScript `number`, this boundary cannot reconstruct the lost digits and must not claim exactness;
- settlement equivalence between Stripe, x402, USDC, bank rails, or another rail;
- permission to migrate the historical `service-workflow.schema.json` numeric quote;
- permission to add money to the protocol kernel;
- a rich Offer/Quote profile.

The strongest result is narrower: **explicit asset identity + arbitrary-precision signed coefficient + explicit decimal scale is a viable normalized representation candidate for lossless magnitude comparison, provided source representation/provenance remains attached. Stronger cross-basis exact-quantity equivalence still requires independently grounded scale metadata.**

## Architectural consequence

Exact-value representation is no longer blocked on JavaScript `number`, but rich Quote remains a `NORMALIZED_CANDIDATE`, not an earned protocol primitive. The next evidence gate remains an authoritative operational quote/estimate source. That experiment must determine whether real provider semantics can use this representation without losing price basis, taxes, line-item meaning, validity, terms, or authority.

Commitment remains deferred. Exact money does not make AIP Bind, UBL Order, estimate approval, booking, work authorization, payment, or settlement equivalent.

## Promotion / falsification conditions

Narrow or reject this representation candidate if an authoritative source shows that:

- exact decision-critical value cannot be reconstructed from coefficient + scale + explicit asset identity;
- asset identity requires semantics that cannot be preserved as a typed/reference boundary;
- source lexical precision is decision-critical and cannot coexist with normalized numerical equality;
- required rounding/conversion policy cannot remain source/adapter-specific;
- an operational quote requires money semantics that this representation hides.

Until the authoritative quote gate passes, this remains a research representation candidate only.
