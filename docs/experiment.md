# Tier 1 experiment design

## Question

Can one existing residential-plumbing workflow be exposed through multiple agent-facing protocols without replacing the provider's operational system?

## Scope

Tier 1 is intentionally smaller than a product prototype.

**Vertical:** residential plumbing  
**Workflow:** leak diagnosis -> quote -> approval -> scheduled job -> completion -> customer decision  
**Canonical state:** `schemas/service-workflow.schema.json`  
**First external surfaces:** AIP and one UCP-compatible representation where current UCP semantics actually fit  
**Legacy semantic reference:** UBL 2.1 quotation concepts  
**Operational source:** a file-backed mock representing an existing FSM before connecting a real provider API

MCP and A2A are deferred until the canonical model survives the first two views.

## Non-goals

Tier 1 will not:

- build a field-service management system;
- create a new quote protocol;
- create a new payment rail;
- create an escrow system;
- claim a generic UCP service-offering model that UCP does not define;
- create a public `com.triherm.*` capability;
- prove market demand.

## Invariants

### Existing system remains operational source of truth

The adapter may read and write only the minimum state required to translate the workflow. It must not fork the job into a parallel operational database that the business must manage.

### One canonical event can have multiple protocol views

A quote accepted through one surface must resolve to the same canonical quote/job references as the equivalent event through another surface.

### Missing semantics stay missing

When a protocol lacks a native representation, the experiment records `not_native` or uses a clearly labeled adapter envelope. It must not overload unrelated fields merely to make a demo appear complete.

### Every protocol fixture is version-pinned

AIP, UCP, MCP and A2A evolve. Generated fixtures must state the version or dated specification used.

## Phase A — evidence backbone

Complete when:

- prior art is documented from primary sources;
- the protocol crosswalk exists;
- the canonical workflow schema exists;
- at least one realistic plumbing fixture validates against it;
- falsification criteria are public.

## Phase B — AIP view

Generate from the canonical/provider configuration:

1. AIP discovery manifest;
2. intake schema/view;
3. request fixture;
4. expiring offer derived from the canonical quote;
5. bind result that resolves to the canonical job.

The business should not manually author AIP JSON.

## Phase C — second independent view

Evaluate the current UCP specification and expose only what fits natively. Where UCP does not provide generic semantics for a plumbing service offering or quote lifecycle, document the boundary rather than inventing protocol-native support.

The second view must still link back to the same canonical provider, requirement, quote and job references.

## Phase D — round trip into operational workflow

Use a file-backed FSM mock first, then a real API adapter only after the translation boundary is stable.

Required round-trip actions:

- create/update customer requirement;
- create provider estimate/quote;
- register acceptance;
- create or schedule job;
- read completion status;
- read whatever completion evidence the source system actually exposes.

## Phase E — completion and customer decision

Keep distinct:

1. provider claim of completion;
2. evidence produced by the operational system;
3. customer acceptance/rejection/dispute;
4. any later verifier judgment;
5. any later settlement release.

Tier 1 models the first three and leaves verifier/settlement integration for a later experiment.

## Pass conditions

The interoperability hypothesis receives initial support only if all are true:

1. one canonical plumbing fixture is sufficient to generate two useful external views;
2. both views preserve stable references to the same requirement/quote/job state;
3. a simulated external interaction can round-trip into the existing operational workflow;
4. the operational system remains authoritative for execution;
5. no protocol-specific fork of the canonical workflow is required for core business state;
6. translation loss is documented and bounded rather than hidden.

## Falsification conditions

The hypothesis should be narrowed or rejected if:

- AIP/UCP/current standards already solve the deployment integration without a meaningful adapter layer;
- a canonical representation destroys vertical-specific semantics required for decisions;
- every protocol requires a substantially different internal model;
- adapter maintenance costs approach workflow replacement costs;
- real FSM systems cannot expose the state needed to support the experiment;
- providers have no demand for agent-facing access even when integration cost is low.

## Evidence produced by each run

Every implementation run should emit a dated record containing:

- source-system revision;
- canonical input/output fixture;
- generated protocol views;
- round-trip result;
- semantic losses;
- protocol/spec versions;
- manual interventions required;
- pass/fail per invariant;
- findings that strengthen or weaken the deployment hypothesis.

The run log is more important than a successful demo. A failure with a precise boundary is a valid research result.
