# agent-service-interop

A public interoperability experiment between **AI-agent protocols** and **real-world service-business systems**.

## Research question

> Can one existing service-business workflow be exposed through multiple agent-facing protocols without replacing the operational system the business already uses?

This repository starts with a residential plumbing workflow and treats existing protocols and standards as inputs, not competitors to reinvent.

## What this repository is testing

The experiment asks whether one normalized canonical interoperability representation can sit between:

- an existing business workflow;
- Agent Intake Protocol (AIP) for discovery/intake/offer/bind;
- Agent2Agent (A2A) v1.0 as an independently meaningful agent-to-agent interaction surface;
- legacy quotation semantics such as OASIS UBL;
- later MCP and settlement/verification adapters.

The scope remains deliberately narrow: **one plumbing workflow, one normalized representation, AIP + A2A, no workflow replacement**.

```text
AIP buyer flow --------------------+
                                   |
A2A provider-agent inspection -----+--> normalized interoperability view
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

The intake is deliberately privacy-minimized: postal code and non-identifying service constraints are accepted before binding. Full name, phone, and street address are requested only at Bind.

For this experiment, **Bind is an authorized handoff to the provider's operational workflow**. It is not represented as payment, job completion, or a universal booking primitive. The file-backed FSM remains authoritative for quote acceptance and job scheduling.

The generated/consumed AIP manifest, intake request, offer response, and bind request are automatically checked against vendored upstream JSON Schemas from the pinned 2026-02-27 snapshot. This is stronger evidence than local shape checks, but it is not AIP certification or proof of full interoperability.

The bind response remains adapter-local because AIP v0.1.0 defines a bind-request schema but does not define a normative bind-response schema.

## A2A implementation

The second surface uses the official **A2A JavaScript SDK v1.0.1** and exposes **A2A Protocol v1.0 over HTTP+JSON**.

Endpoints/surfaces:

- `GET /.well-known/agent-card.json`
- HTTP+JSON A2A binding under `/a2a`
- one skill: `inspect_service_workflow`

The skill is deliberately read-only. It accepts an existing canonical workflow ID or AIP session ID and returns an A2A Artifact containing references to the same:

- canonical `workflow_id`;
- `requirement_id`;
- `quote_id`;
- AIP `offer_id`;
- operational `job_id`.

The A2A Task has its own ID and context. It is not the FSM job. A completed read-only A2A Task means the provider-agent interaction completed; it does **not** mean the physical service job completed or that the customer accepted fulfillment.

This distinction is executable in the tests: the A2A Task can be `TASK_STATE_COMPLETED` while the authoritative FSM job remains `scheduled`, completion remains `not_claimed`, and customer decision remains `pending`.

## Run locally

Requires Node.js 22.16+; CI runs Node 24.

```bash
npm install
npm test
npm start       # AIP server, default port 3000
npm run start:a2a  # A2A server, default port 3001
```

Both servers use the same `.runtime/fsm-state.json` by default, so an AIP-created workflow can be inspected through A2A without creating a second operational record.

## What the tests currently demonstrate

- AIP v0.1.0 upstream-schema validation for manifest/intake/offer/bind-request artifacts;
- privacy-minimized AIP intake and Bind-level PII handoff;
- quote transition `offered -> accepted` and job transition `pending -> scheduled` in the existing-system mock;
- projection of confirmed FSM state into the experimental canonical representation;
- official A2A Agent Card discovery and HTTP+JSON client/server interaction;
- one AIP-created workflow exposed through a second independent A2A surface;
- AIP and A2A resolving to the same requirement/quote/job references;
- protocol IDs remaining separate from canonical and FSM identities;
- A2A Task state remaining semantically separate from physical-service Job state;
- read-only A2A inspection not mutating the file-backed FSM.

These results are evidence for the current synthetic workflow only. They do not yet demonstrate interoperability against a real FSM/API or multiple operational systems.

## Evidence backbone

See:

- [`research/prior-art.md`](research/prior-art.md)
- [`crosswalk/protocol-capabilities.md`](crosswalk/protocol-capabilities.md)
- [`docs/experiment.md`](docs/experiment.md)
- [`docs/architecture.md`](docs/architecture.md)
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

The repository now has executable evidence that **one synthetic plumbing workflow can support two independent agent-facing representations, AIP and A2A, without protocol-specific copies of the quote/job state**.

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
