# agent-service-interop

A public interoperability experiment between **AI-agent protocols** and **real-world service-business systems**.

## Research question

> Can one existing service-business workflow be exposed through multiple agent-facing protocols without replacing the operational system the business already uses?

This repository starts with a residential plumbing workflow and treats existing protocols and standards as inputs, not competitors to reinvent.

## What this repository is testing

The experiment asks whether one canonical operational model can sit between:

- an existing business workflow;
- Agent Intake Protocol (AIP) for discovery/intake/offer/bind;
- a second independent agent-facing representation selected only after semantic-fit evaluation;
- legacy quotation semantics such as OASIS UBL;
- later MCP and Agent2Agent surfaces;
- later settlement/verification adapters.

The initial scope is deliberately narrow: **one plumbing workflow, one canonical model, AIP first, no workflow replacement**.

```text
Agent / buyer
    |
    +--> AIP ------------------+
    |                          |
    +--> second view (TBD) ----+--> canonical operational model
                                      |
                                      v
                              existing business workflow
                                      |
                         quote -> job -> completion
                                      |
                                      v
                            normalized status/evidence
```

## What this repository is not

- Not a new universal commerce protocol.
- Not a proposed UCP extension.
- Not a replacement for AIP, UCP, MCP, Agent2Agent, AP2, UBL, ERP, CRM, or field-service systems.
- Not a claim that quoting, verification, fulfillment, or evidence primitives are novel.
- Not a production payment or escrow system.

Experimental schemas and adapters in this repository describe **translation boundaries** for falsifiable experiments. They are not standards proposals.

## Current implementation: AIP -> file-backed FSM

The first executable adapter is pinned to **AIP v0.1.0 / specification snapshot 2026-02-27**. It models a direct plumbing provider rather than a marketplace.

Endpoints:

- `GET /.well-known/agent-intake.json`
- `POST /api/aip/residential-plumbing-quote`
- `POST /api/aip/bind`

The intake is deliberately privacy-minimized: postal code and non-identifying service constraints are accepted before binding. Full name, phone, and street address are requested only at Bind.

For this experiment, **Bind is an authorized handoff to the provider's operational workflow**. It is not represented as payment, job completion, or a universal booking primitive. The file-backed FSM remains authoritative for quote acceptance and job scheduling.

The bind response is adapter-local because AIP v0.1.0 defines a bind-request schema but does not define a normative bind-response schema.

### Run locally

Requires Node.js 22.16+; CI runs Node 24.

```bash
npm test
npm start
```

By default runtime state is written under `.runtime/`. This adapter is a research fixture, not a production service.

### What the tests currently demonstrate

- direct-provider AIP manifest generation;
- UUID/session and consent checks;
- privacy-minimized intake;
- offer creation and expiry;
- session/agent correlation;
- Bind-level PII handoff;
- quote transition `offered -> accepted`;
- job transition `pending -> scheduled` in the existing-system mock;
- idempotent repeated intake for the same session;
- projection back into the experimental canonical workflow.

These tests are **not a claim of full AIP conformance**. Automatic validation against the upstream AIP JSON Schemas remains a separate gate.

## Evidence backbone

See:

- [`research/prior-art.md`](research/prior-art.md)
- [`crosswalk/protocol-capabilities.md`](crosswalk/protocol-capabilities.md)
- [`docs/experiment.md`](docs/experiment.md)
- [`schemas/service-workflow.schema.json`](schemas/service-workflow.schema.json)
- [`fixtures/plumbing/workflow.example.json`](fixtures/plumbing/workflow.example.json)
- [`fixtures/aip/intake.request.json`](fixtures/aip/intake.request.json)

## Current protocol assumptions

These are version-sensitive and must be rechecked before implementation changes:

- **AIP v0.1.0** exposes `/.well-known/agent-intake.json` and a Discover -> Submit -> Offer -> Review -> Bind lifecycle.
- **UCP** uses `/.well-known/ucp` to advertise UCP services/capabilities/payment handlers. In UCP, a *Service* is an API surface/vertical concept; it must not be confused with a plumber's commercial service offering.
- **UCP namespace authority rules have changed across versions.** This repository records the version/date when relying on `schema` or `spec` authority behavior.
- **MCP Tasks** address durable/asynchronous tool-operation mechanics, not the business meaning of physical-service completion.
- **Agent2Agent (A2A)** is a distinct protocol from Agentic Commerce Protocol (ACP).

## Pass condition

The broader experiment passes only if one plumbing workflow can be represented once, surfaced through AIP plus one independently justified second surface, and round-tripped back into the existing operational workflow without requiring the business to replace that workflow.

The AIP adapter alone is therefore evidence for one translation boundary, not proof of the full interoperability thesis.

## Failure is useful

The thesis should be revised if any of these occur:

- existing protocols already provide the needed deployment integration cleanly;
- canonical normalization loses decision-critical business semantics;
- adapter burden is comparable to replacing the workflow;
- independent agent surfaces cannot consume the same underlying state without protocol-specific forks;
- real business systems do not expose enough operational state to support the translation.

## Status

**Experimental / research.** No protocol standing, no production guarantees, and no interoperability claim beyond checked fixtures and test runs.

## License

Apache-2.0.
