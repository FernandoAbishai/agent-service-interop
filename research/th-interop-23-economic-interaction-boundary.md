# TH-INTEROP-23 — Economic Interaction Boundary Falsifier

_Status: executable semantic falsification experiment. This does not define a TriHerm economic profile or promote Request, Offer, or Commitment into the protocol kernel._

_Primary sources rechecked: 2026-09-07._

## Question

What is the smallest Request -> Offer -> Commitment relationship that survives AIP, UBL, and current provider-shaped evidence without normalizing money prematurely or treating different binding transitions as one universal event?

## Sources and boundaries

- **AIP v0.1.0 / 2026-02-27** defines a soft-contract Offer returned after intake and a Bind request after user acceptance. The repository uses its vendored schemas as the executable source of truth for this experiment.
- **OASIS UBL 2.4** defines an RFQ -> Quotation process and separately describes Ordering as collaboration that creates a contractual obligation between seller and buyer. The JSON fixtures here are parsed semantic projections only; they are not UBL XML/schema conformance claims.
- **UCP v2026-08-25** continues to expose checkout and order through explicit capabilities and bindings. That is useful evidence against assuming that every post-offer transition in every vertical is one protocol-independent Commitment primitive.

Primary references:

- https://agent-intake-protocol.github.io/agent-intake-protocol/whitepaper.html
- https://docs.oasis-open.org/ubl/UBL-2.4.html
- https://ucp.dev/2026-08-25/specification/overview/
- https://ucp.dev/2026-08-25/specification/shopping/order/

## Executable result

`OfferResponseObservation` earns only a thin observation-layer relation:

- source system/object/id;
- the source request/RFQ-line to which the offer/quotation responds;
- observation time;
- explicit accounting for source fields deliberately not normalized.

It deliberately does **not** normalize:

- price, total, currency, tax, line-item money, or canonical decimal/minor-unit representation;
- AIP expiry versus UBL validity-period/date semantics;
- provider-specific AIP `details`, binding requirements, or terms;
- quotation document context;
- universal offer lifecycle/status;
- acceptance or commitment state.

This means the broad `Offer`/`Quote` primitive is still not earned. The narrower **offer-response observation** is the only positive result of this gate.

## Commitment falsification result

The experiment intentionally returns `normalized_commitment: null` when comparing AIP Bind and a UBL Order projection.

That is not an implementation gap. It is the result.

The current evidence does not justify treating these as interchangeable:

- AIP Bind is a protocol-specific relationship handoff after user acceptance of a soft-contract offer;
- UBL Ordering creates a procurement contractual obligation between buyer and seller;
- provider estimate approval, booking, operational work authorization, checkout completion, payment authorization, and settlement can all be separate events.

Therefore no generic `accepted=true`, `commitment_id`, universal commitment status, or automatic Job/payment transition is created.

## Architectural consequence

The economic interaction profile is **not ready to freeze**.

The evidence now supports:

```text
earned ServiceRequestObservation
          |
          +--> earned thin OfferResponseObservation
          |
          +--> commitment boundary remains DEFERRED
```

The protocol kernel stays unchanged. These observations can be carried by a future profile-owned payload, but carrying them does not make them kernel primitives.

## Next gates

1. Resolve the canonical money representation before any rich Offer/Quote profile is proposed.
2. Obtain at least one authoritative operational quote/estimate source and test whether the thin offer-response observation survives it.
3. Observe two authoritative commitment transitions and determine whether they share a precise invariant beyond "the user accepted something."
4. Keep booking, authorization/delegation, operational Job creation, payment, and settlement separate unless source-backed evidence proves equivalence.

Until those gates pass, a public TriHerm economic profile should remain experimental and narrower than Request -> Offer -> Commitment as a universal FSM.
