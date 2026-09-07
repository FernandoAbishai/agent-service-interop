# agent-service-interop

A public interoperability experiment between **AI-agent protocols** and **real-world service-business systems**.

## Research question

> Can one existing service-business workflow be exposed through multiple agent-facing protocols without replacing the operational system the business already uses?

This repository starts with a residential plumbing workflow and treats existing protocols and standards as inputs, not competitors to reinvent.

## What this repository is testing

The experiment asks whether a small normalized interoperability layer can sit between:

- an existing business workflow;
- Agent Intake Protocol (AIP) for discovery/intake/offer/bind;
- Agent2Agent (A2A) v1.0 as an independently meaningful agent-to-agent interaction surface;
- legacy quotation semantics such as OASIS UBL;
- read-only operational observations from Jobber and a ServiceTitan-shaped fixture;
- an HTTP/OpenAPI inspection surface protected experimentally by x402/Circle Gateway;
- later MCP and settlement/verification adapters only where a concrete interoperability need survives falsification.

The scope remains deliberately narrow: **one plumbing workflow, AIP + A2A cross-surface inspection, small earned observation vocabularies, read-only real-system evidence, and no workflow replacement**.

```text
AIP buyer flow --------------------+
                                   |
A2A provider-agent inspection -----+--> interop correlation + read-only facets
                                             |
                                             v
                                   existing business workflow
                                     <-- operational authority
```

AIP and A2A retain their own protocol identities. They reference the same underlying requirement, quote, and operational job rather than creating protocol-specific copies of those objects.

## What this repository is not

- Not a new universal commerce protocol.
- Not a proposed UCP extension.
- Not a replacement for AIP, UCP, MCP, Agent2Agent, AP2, UBL, ERP, CRM, or field-service systems.
- Not a claim that quoting, verification, fulfillment, or evidence primitives are novel.
- Not a production payment or escrow system.

Experimental schemas and adapters in this repository describe **translation boundaries** for falsifiable experiments. They are not standards proposals.

## Architecture decision

The current architectural direction is:

> **The canonical model is a normalized interoperability representation of economic workflow state. It is not, by default, the authoritative operational system.**

Writes are routed as intents/commands through the adapter responsible for the authoritative system. The canonical representation is updated from the confirmed outcome rather than being mutated first and expecting the provider system to catch up later.

This preserves a path from a simple derived projection toward multi-system interoperability without turning this project into another FSM/ERP. It does **not** imply that a canonical database, event bus, workflow engine, conflict-resolution layer, or universal service schema is required.

See [`docs/architecture.md`](docs/architecture.md) for the authority model, invariants, open questions, and falsification conditions.

## AIP implementation

The first executable adapter is pinned to **AIP v0.1.0 / specification snapshot 2026-02-27**. It models a direct plumbing provider rather than a marketplace.

Endpoints:

- `GET /.well-known/agent-intake.json`
- `POST /api/aip/residential-plumbing-quote`
- `POST /api/aip/bind`

The intended intake schema is privacy-minimized: it requests postal code and non-identifying service constraints before binding, while full name, phone, and street address belong at Bind. Runtime intake validation now checks the complete request against the vendored AIP intake schema first, then applies the narrower plumbing-fixture rules and rejects PII-shaped metadata keys before operational state is created.

For this experiment, **Bind is treated as the adapter's handoff point into the provider's operational workflow**. The current synthetic adapter checks the declared Bind scope and continuity of the agent ID, but it does not constitute an external authentication/delegation proof. Bind is not represented as payment, job completion, or a universal booking primitive. The file-backed FSM remains authoritative for quote acceptance and job scheduling.

The committed/generated AIP manifest, intake fixture, offer response, and bind-request fixture used by the conformance suite are checked against vendored upstream JSON Schemas from the pinned 2026-02-27 snapshot. Runtime intake and Bind requests are also schema-checked against that same pinned snapshot before adapter-local business constraints run. This evidence is not AIP certification or proof of full interoperability.

The bind response remains adapter-local because AIP v0.1.0 defines a bind-request schema but does not define a normative bind-response schema.

## A2A implementation

The second surface uses the official **A2A JavaScript SDK v1.0.1** and exposes **A2A Protocol v1.0 over HTTP+JSON**.

Endpoints/surfaces:

- `GET /.well-known/agent-card.json`
- HTTP+JSON A2A binding under `/a2a`
- one skill: `inspect_service_workflow`

The skill is deliberately read-only. It accepts only the repository-local, protocol-neutral `workflow_id`. That ID is an internal interoperability correlation key, not an AIP field or a proposed public identity standard. AIP session/offer IDs remain protocol references rather than alternate shared identities. The returned A2A Artifact contains:

- `workflow_id`, used only for interoperability correlation;
- `operational_refs` identifying source-system objects such as requirement/quote/job records;
- `protocol_refs` such as AIP session/offer IDs only when that workflow actually has an AIP representation;
- source-backed optional facets. The current file-FSM observer exposes quote/job state, but does not synthesize completion or customer-decision state into the inspection contract.

The correlation record is stored separately from the file-backed operational FSM. It does not become operational authority and does not carry customer PII or authoritative lifecycle state.

The AIP response is intentionally not extended with a new `workflow_id` protocol field. How a private caller is entitled to discover or resolve an internal correlation ID is a separate authorization/disclosure question and is not solved by this experiment.

`WorkflowInspection v0.3` is also intentionally narrower than the historical `service-workflow.schema.json`: the historical canonical fixture remains evidence from an earlier experiment, while shared inspection now carries only correlation references and the facets a source actually exposes.

The historical canonical projection helper also requires an explicit `workflow_id`; it no longer derives one from an AIP session as a default. This prevents the historical model from creating a second competing workflow identity beside the correlation layer.

The A2A Task has its own ID and context. It is not the FSM job. A completed read-only A2A Task means the provider-agent interaction completed; it does **not** mean the physical service job completed or that the customer accepted fulfillment.

This distinction is executable in the tests: the A2A Task can be `TASK_STATE_COMPLETED` while the authoritative FSM job remains `scheduled`. The inspection contract no longer invents completion or customer-decision facets when the underlying source does not expose them.

## Run locally

Requires Node.js 22.16+; CI runs Node 24.

```bash
npm ci
npm test
npm start       # AIP server, default port 3000
npm run start:a2a  # A2A server, default port 3001
npm run start:x402 # fixed public synthetic x402 inspection, default port 3002
```

The AIP, A2A and x402 processes share `.runtime/fsm-state.json` for the synthetic operational FSM and `.runtime/workflow-correlations.json` for interoperability correlation/reference data. The AIP writer additionally uses `.runtime/aip-replay.json` for intake replay reservations containing an opaque request fingerprint plus reserved references/IDs. New synthetic Bind records retain an opaque Bind-request fingerprint only as adapter-local replay metadata. Neither form is promoted into workflow correlation, customer identity, or business authority.

The synthetic file stores now serialize cross-process read/modify/write sections and replace JSON atomically. The current lock format uses no-overwrite `PID + token` ownership and refuses to replace the predecessor's empty legacy lock directory; new state files are `0600` and existing file modes are preserved across atomic replacement. AIP intake retries are keyed to the state-affecting request (`aip_version`, `session_id`, `agent.id`, and validated `intake_data`); changed semantic input under the same session returns `409 IDEMPOTENCY_CONFLICT`. Bind retries fingerprint the offer/session/agent plus complete validated `bind_data`: an exact retry returns the first result without rescheduling, while changed bind data returns 409. Scheduling policy itself is unchanged in this gate. See [`research/th-interop-21-replay-write-safety.md`](research/th-interop-21-replay-write-safety.md).

`npm test` is deterministic and does not invoke live external systems. The opt-in Jobber and Circle Gateway checks remain separate as `npm run test:jobber-live` and `npm run test:circle-live`.

## What the tests currently demonstrate

- AIP v0.1.0 upstream-schema validation for manifest/intake/offer/bind-request artifacts;
- privacy-minimized AIP intake with pinned-schema runtime validation and local rejection of PII-shaped intake metadata before Bind;
- exact intake/Bind replay without second mutation, plus `409 IDEMPOTENCY_CONFLICT` for changed state-affecting replay payloads;
- cross-process serialized + atomic file replacement for FSM/correlation/replay state, including reader-during-write coverage;
- fail-closed recovery when correlation is reserved before an operational write: exact replay can finish the write while changed intake cannot claim the reservation;
- quote transition `offered -> accepted` and job transition `pending -> scheduled` in the existing-system mock;
- projection of confirmed FSM state into the experimental canonical representation;
- official A2A Agent Card discovery and HTTP+JSON client/server interaction;
- one AIP-created workflow exposed through a second independent A2A surface;
- a workflow correlation ID generated independently from the AIP session ID and persisted outside the operational FSM;
- AIP session/offer IDs retained only as protocol references;
- operational requirement/quote/job IDs retained only as operational references;
- one synthetic provider-native workflow with no AIP origin traversing the same correlation -> observation -> A2A/HTTP path;
- missing facets staying missing instead of requiring synthetic quote/completion/customer-decision state;
- A2A Task/context identity remaining separate from the physical FSM Job identity;
- A2A Task state remaining semantically separate from physical-service Job state;
- read-only A2A inspection not mutating the file-backed FSM;
- ServiceTitan-shaped Appointment and real Jobber Visit evidence for the narrow `OccurrenceObservation` vocabulary;
- a fixed public synthetic HTTP inspection resource protected by deterministic x402 gating, plus an opt-in Circle Gateway live harness.

These results include a real **read-only Jobber API observation path**, an initial synthetic falsifier for protocol-neutral correlation, and bounded local replay/file-write hardening. They do not yet demonstrate safe production writes to an external operational system, distributed exactly-once execution, a second live operational origin, global workflow identity, or cross-party identity resolution.

## Evidence backbone

See:

- [`research/prior-art.md`](research/prior-art.md)
- [`crosswalk/protocol-capabilities.md`](crosswalk/protocol-capabilities.md)
- [`docs/experiment.md`](docs/experiment.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/contract-status.md`](docs/contract-status.md)
- [`schemas/service-workflow.schema.json`](schemas/service-workflow.schema.json)
- [`fixtures/plumbing/workflow.example.json`](fixtures/plumbing/workflow.example.json)
- [`fixtures/aip/intake.request.json`](fixtures/aip/intake.request.json)

## Current protocol assumptions

These are version-sensitive and must be rechecked before implementation changes:

- **AIP v0.1.0** exposes `/.well-known/agent-intake.json` and a Discover -> Submit -> Offer -> Review -> Bind lifecycle.
- **A2A v1.0** is used here only for agent discovery/interaction/task/artifact mechanics; quote, physical job execution, fulfillment, and customer acceptance remain application/business semantics.
- **UCP** uses `/.well-known/ucp` to advertise UCP services/capabilities/payment handlers. In UCP, a *Service* is an API surface/vertical concept; it must not be confused with a plumber's commercial service offering.
- **MCP Tasks** address durable/asynchronous tool-operation mechanics, not the business meaning of physical-service completion.

## Current pass / remaining falsification

The repository now has executable evidence that **one AIP-originated synthetic plumbing workflow can support independent AIP, A2A and HTTP/x402 views without protocol-specific copies of the operational state**, plus read-only cross-system observation evidence from ServiceTitan-shaped data and Jobber.

The TH-INTEROP-20 synthetic falsifier additionally shows that the shared inspection path no longer structurally requires an AIP-origin workflow: correlation is stored separately from the operational FSM, AIP IDs are protocol refs only, and a provider-native synthetic source can expose only the job facet it actually has. The stronger next falsifier is the same separation against another live operational origin.

The broader deployment thesis is still unproven. It should be revised or narrowed if any of these occur:

- canonical normalization loses decision-critical business semantics;
- most useful state proves system-specific and resists a stable normalized core;
- adapter or reconciliation burden is comparable to replacing the workflow;
- authoritative business systems do not expose enough operational state to support safe translation;
- a real second operational system cannot map to the same useful normalized core;
- existing unified APIs or integration platforms already provide the authority-aware agent coordination layer cleanly.

## Status

**Experimental / research.** No protocol standing, no production guarantees, and no interoperability claim beyond checked fixtures and executable tests.

## License

Apache-2.0.
