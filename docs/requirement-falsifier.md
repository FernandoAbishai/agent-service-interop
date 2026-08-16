# TH-INTEROP-16 — Requirement translation falsifier

_Status: implementation experiment stacked on TH-INTEROP-15. Result: **NARROW**. No canonical-schema migration._

## Question

Does a sufficiently stable, protocol-neutral `Requirement` concept survive translation between the existing AIP plumbing intake and a UBL RequestForQuotation line without absorbing protocol/document-specific semantics or inventing false timing equivalence?

## Why AIP + UBL

The repository already has an executable AIP v0.1.0 plumbing intake. UBL supplies mature RequestForQuotation semantics from an independent procurement/document model. This creates a useful adversarial pair without adding another SaaS integration.

This experiment does **not** implement general UBL XML ingestion. `UblRequestForQuotationLineObservation` represents the small semantic projection that would exist after XML parsing and schema validation. XML tooling is orthogonal to the architecture question being tested here.

## Candidate shared facet

TH-INTEROP-16 intentionally starts with only:

- source system/object/id;
- observation time;
- requested service description/code as source-provided text;
- minimal service/delivery location (`postal_code`, `country`) where available;
- explicit list of source fields that were not normalized.

It deliberately excludes a universal request lifecycle, customer identity, procurement document authority, money, commitment, quote state, and timing model.

## Primary falsifier

The AIP fixture expresses:

- `urgency = this_week`;
- `availability_window = weekday_after_15_00`.

The UBL-shaped RFQ line expresses a requested delivery period using explicit dates.

Those may influence the same human scheduling decision, but they are **not asserted to be semantically equivalent**. Therefore the shared observation has no `normalized_timing` field. The source semantics remain explicitly unmapped.

If later evidence proves a common timing representation, it must be introduced by a separate gate.

## UBL document context boundary

A UBL RequestForQuotation is a procurement document, not merely a generic service-intake payload. Document-level concepts such as issue metadata and supplier/customer parties remain outside the shared requirement facet unless a future interoperability task proves they are required.

The test therefore marks `rfq_document_context` as unmapped rather than copying document semantics into a supposedly universal Requirement object.

## PASS / NARROW / FAIL

### PASS

A richer shared Requirement model survives and is useful for correlation/translation while source-specific constraints remain auditable.

### NARROW

Only service description + location + provenance survive without inventing equivalence. In that case `Requirement` should be renamed/reduced toward a thin `ServiceRequestObservation`-style facet rather than promoted as a rich canonical entity.

### FAIL

Even service need/location cannot be aligned without source-specific interpretation or vertical mapping. In that case retain protocol/source references and do not normalize Requirement.

## Observed result — NARROW

The implementation and full CI suite passed with the deliberately narrow mapping.

What survived across the two representations:

- requested service (`leak_diagnosis` in the controlled fixture);
- postal-code-level location;
- source identity/provenance;
- explicit representation of what did **not** normalize.

What did not earn shared semantics:

- AIP urgency;
- AIP availability window;
- UBL requested delivery period;
- UBL RFQ document context and note;
- a universal request lifecycle;
- customer/buyer/seller identity;
- a normalized timing model.

The important result is not that AIP and UBL can be made to look identical. They cannot without adding assumptions. The useful result is that a thin common service-request facet survives while decision-relevant source semantics remain explicit.

Therefore TH-INTEROP-16 does **not** support promoting the current rich `requirement` member in `service-workflow.schema.json` as a universal TriHerm primitive.

## Exclusions

- no change to `schemas/service-workflow.schema.json`;
- no UBL protocol/server implementation;
- no XML parser dependency;
- no UBL schema conformance claim for the JSON semantic fixture;
- no normalized timing enum;
- no customer identity model;
- no quote or money work;
- no Jobber/ServiceTitan/Agave work.

## Architectural consequence

TH-INTEROP-15 should narrow `Requirement` from `NORMALIZED_CANDIDATE` toward a thinner request-observation facet. A likely future name is `ServiceRequestObservation`, but this PR deliberately does not perform that rename or promote it into the canonical schema.

The next code-bearing gate should not enlarge Requirement. It should either:

1. test another independent request representation to see whether even the thin facet survives; or
2. move to the next uncertain primitive only after explicitly accepting this narrowing result.
