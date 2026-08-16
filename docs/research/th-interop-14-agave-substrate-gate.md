# TH-INTEROP-14 — Agave substrate gate

## Decision question

Can TriHerm buy operational connectivity through Agave without losing the source identity, authority, provenance, occurrence boundaries, and native state required by the current interoperability model?

This is a substrate experiment, not a commitment to Agave and not a canonical-schema migration.

## Control condition

PR #7 established the direct Jobber control path against a real Jobber test account. The direct path preserved:

- Jobber Job and Visit IDs;
- parent Job -> many Visit relationships;
- source-native `visitStatus` values;
- scheduled and unscheduled Visits, including `startAt = null` / `endAt = null`;
- source-native completion facts separately from the normalized `OccurrenceObservation` projection;
- parent Job lifecycle independently from Visit completion.

Any Agave path must be compared against those invariants rather than judged only on whether it can return approximately equivalent business data.

## Public evidence boundary

Agave publicly advertises Jobber among its Field Service integrations. Public Agave documentation also describes two mechanisms relevant to this gate:

1. `source_data`, which can expose source-native data alongside normalized objects; and
2. authenticated passthrough, which can call source-system endpoints when the unified API does not expose enough source semantics.

The public documentation currently available to this experiment does not establish a sufficiently specific Jobber unified contract for Visits, occurrence scheduling, completion, or parent relationships. Therefore this branch deliberately does **not** invent an Agave Jobber adapter shape.

## Paths under test

### Path A — Unified API only

Test whether Agave's normalized Field Service model alone can preserve the direct-control invariants.

Pass only if the returned data is sufficient to recover, without guessing:

- authoritative source system;
- source Job identity;
- distinct source occurrence/Visit identity;
- parent Job -> occurrence relationship;
- source-native occurrence status;
- nullable schedule for an unscheduled occurrence;
- occurrence completion observation independently from parent Job state.

If the unified model collapses or normalizes away one of these facts, record that loss explicitly. Do not repair it with inferred semantics.

### Path B — Unified API + `source_data`

If Path A loses required semantics, test whether `source_data` restores the missing native facts while still allowing TriHerm to use Agave for connectivity.

A passing result must identify which normalized fields are safe to consume and which authority-sensitive facts must be read from source-native payloads.

### Path C — Authenticated passthrough

If neither unified data nor `source_data` preserves the direct-control invariants, test authenticated passthrough to the Jobber source API through Agave.

This path is acceptable only if Agave still adds material connectivity value. If TriHerm must depend on source-specific requests and source-specific response parsing for every important object, Agave may be acting mainly as credential/network plumbing rather than a semantic adapter substrate.

## Falsification criteria

Fail or narrow the Agave thesis if any of the following is true:

- one Jobber Job with multiple Visits is collapsed into one schedulable object;
- source Visit identity cannot be recovered;
- source Job identity or the Visit -> Job relationship cannot be recovered;
- `UNSCHEDULED` must be converted into invented dates/times;
- source-native statuses are replaced by a lossy normalized lifecycle with no recoverable native status;
- Visit completion becomes indistinguishable from Job completion;
- source system/provenance cannot be established for a returned object;
- `source_data` exists but cannot be relied on for the required Jobber facts;
- passthrough is required for essentially every authority-sensitive field, eliminating most semantic value of the unified layer.

## Passing outcomes

### PASS-A — Unified substrate

Agave unified objects preserve all required invariants. TriHerm can use Agave as a connectivity substrate with a thin Agave -> observation adapter.

### PASS-B — Hybrid substrate

Agave unified objects provide useful common connectivity, while `source_data` preserves a small, explicit set of authority-sensitive source facts. This is still a favorable outcome if the split is stable and testable.

### PASS-C — Transport substrate only

Authenticated passthrough preserves the direct Jobber contract but the unified model does not. Agave may still reduce auth/connectivity work, but TriHerm must retain source-specific semantic adapters. Treat this as infrastructure outsourcing, not semantic unification.

### FAIL — Insufficient substrate

Agave obscures required source semantics or provides too little value once source-specific passthrough is required. Continue with direct adapters or test another integration substrate.

## Required live evidence

Do not implement an executable Agave adapter until we have an Agave workspace or sandbox path that can exercise Jobber or another comparable Field Service source.

Minimum evidence package:

1. Agave account/workspace access suitable for API testing.
2. A source-system connection or sandbox that exposes a Job with multiple occurrences/appointments/visits.
3. At least one scheduled incomplete occurrence.
4. At least one completed occurrence while the parent Job remains independently observable.
5. At least one unscheduled occurrence with no invented timing.
6. Responses captured from Unified API first, then `source_data`, then passthrough only as needed.
7. No production customer PII or credentials committed to the repository.

## Comparison matrix

| Invariant | Direct Jobber control | Agave unified | Agave + source_data | Agave passthrough |
|---|---|---|---|---|
| Source system explicit | yes | TBD | TBD | TBD |
| Job source ID | yes | TBD | TBD | TBD |
| Occurrence/Visit source ID | yes | TBD | TBD | TBD |
| Parent relationship | yes | TBD | TBD | TBD |
| Native occurrence status | yes | TBD | TBD | TBD |
| Nullable unscheduled timing | yes | TBD | TBD | TBD |
| Occurrence completion distinct from Job state | yes | TBD | TBD | TBD |
| Requires source-specific parsing | yes, direct control | TBD | TBD | expected |

## Implementation boundary

Until live Agave evidence exists:

- no Agave runtime dependency;
- no fabricated Agave Jobber fixture presented as official shape;
- no new generic adapter interface;
- no canonical schema change;
- no normalized lifecycle enum;
- no assumption that Agave replaces direct source semantics;
- no assumption that passthrough is a failure by itself.

## Decision after the experiment

The desired outcome is not "use Agave" or "do not use Agave" in the abstract. The decision is which layer Agave can safely own:

```text
A. connectivity + useful semantics
B. connectivity + partial semantics, with source_data escape hatch
C. auth/network transport only, with TriHerm retaining source semantics
D. no material role
```

That result will determine whether TriHerm should build many direct operational adapters, build a smaller set of substrate adapters, or combine both approaches.
