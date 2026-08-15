# ServiceTitan-shaped observation boundary

## Purpose

This experiment tests the current interoperability model against a second operational shape without connecting to a live ServiceTitan tenant and without changing the canonical schema first.

The fixture is deliberately shaped around current ServiceTitan concepts that conflict with the original synthetic FSM assumptions:

- a Job can have multiple Appointments;
- Appointment scheduling is represented independently from Job identity;
- Job and Appointment statuses remain distinct source-native values;
- a sold Estimate may be observed without an associated Job yet;
- Job completion is directly observable from native Job state such as `jobStatus` and `completedOn`.

The code is therefore an **observation boundary**, not a ServiceTitan SDK, emulator, write adapter, or conformance claim.

## Boundary

The current experiment exposes four read operations:

- `observeJob(jobId)`
- `observeAppointments(jobId)`
- `observeEstimates(jobId?)`
- `observeCompletion(jobId)`

Every observation preserves source-system identity and an `observed_at` timestamp. Job, Appointment and Estimate identifiers remain separate.

No universal command interface is introduced. No `acceptQuote`, `scheduleJob`, `completeJob`, generic CRUD method, polling subsystem, raw-payload store, event bus or reconciliation engine is added.

## Falsification cases

### One Job, multiple schedules

The fixture contains one Job with two Appointments on different dates. This cannot be represented faithfully by a single `job.scheduled_for` field without loss.

### Sold Estimate without Job

The fixture contains a sold Estimate whose `jobId` is `null`. The interoperability layer must not require a linear Quote → Job relationship merely because the first synthetic workflow created those objects together.

### Native completion observation

The fixture contains a completed Job with `jobStatus = Completed` and a non-null `completedOn`. Provider completion is observed from that native operational state rather than inferred from payment or invoice state.

## Canonical consequence

This PR intentionally does **not** repair `src/canonical.ts`.

The experiment first records which current assumptions fail. A later architecture gate can decide whether the smallest correct response is:

- a canonical schema change;
- a reference-only relationship;
- a protocol/system-specific extension;
- or a decision not to normalize the concept.

The source system remains authoritative throughout.

## Evidence discipline

ServiceTitan API capability claims for this experiment must be checked against the current official ServiceTitan developer portal. Negative API claims must not be based only on mirrors, catalogs, cached schemas, or absence from search results.

Agave is not implemented in this PR. Its possible role remains an optional connectivity substrate to evaluate separately after the operational observation boundary is stable.
