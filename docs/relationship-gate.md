# Post-PR #5 relationship gate

This document records the narrow architectural decision after the ServiceTitan-shaped falsification experiment.

## Decision

The observation layer may normalize a **work occurrence** as a distinct object with its own identity, parent reference, schedule window, source-native status, and observation provenance.

This does **not** migrate the canonical schema and does not make the interoperability layer operationally authoritative.

The current evidence supports a generic occurrence candidate because materially different systems expose separately identifiable scheduled work units (for example ServiceTitan Appointments and Jobber Visits) rather than one scalar schedule on a Job.

## Relationship status

### `part_of` / parent reference — supported now

An occurrence needs an explicit parent reference. The observation layer represents that relationship directly as `parent_ref` rather than introducing a graph store.

The parent type remains source-visible. The interoperability layer must not silently assume that every occurrence is parented to a Job.

### `converted_from` — candidate, source provenance only

Some source systems expose provenance between an estimate/quote and later operational work. Preserve those source references when observed, but do not promote `converted_from` into a canonical relationship until a second executable source shape requires the same query semantics.

### `offered_via` — deferred

A stable Requirement-to-Offer relationship is not yet demonstrated across the executable fixtures. Do not infer an intake context simply because an Estimate or Quote exists.

### `accepted_as` — deferred

Customer authorization, provider/internal sold state, signatures, approvals, and operational conversion are different facts. No universal offer-to-work acceptance relationship is introduced yet.

## Status normalization

Keep `source_status` verbatim.

No `offer_state`, `occurrence_state`, or `work_state` mini-enum is introduced in this gate. A normalized state vocabulary would be business logic that can erase source distinctions; it must be earned by executable cross-system mappings rather than documentation alone.

## Completion

Provider completion remains separate from customer acceptance.

Do not move completion universally to occurrence scope yet. ServiceTitan exposes Appointment status independently but also exposes Job-level `jobStatus` and `completedOn`; Jobber exposes Visit-level completion. The common target granularity is therefore still under test.

## Provenance

Required observation provenance remains:

- `source_system`
- `source_object_type`
- `source_id`
- source-native `source_status` when available
- `observed_at`

`source_modified_at` may be retained when the source exposes it.

Do not synthesize `source_revision` from timestamps, webhook pointers, logs, or hashes. A revision field should be added only when a source provides a true revision/version semantic or the adapter explicitly labels a token as adapter-derived rather than source-native.

## Explicit non-decisions

This gate does not:

- rename Quote to EconomicCommitment;
- rename Job to WorkReference;
- add an option-set abstraction;
- add a graph or relationship store;
- migrate `service-workflow.schema.json`;
- change money representation;
- add write commands;
- add Agave, UCP, MCP, settlement, reconciliation, or an event bus.

## Next falsification

The next useful evidence is another executable operational shape using the same `OccurrenceObservation` contract. If that mapping requires vendor-specific branching for decision-critical fields, the occurrence abstraction should be narrowed or rejected rather than expanded automatically.
