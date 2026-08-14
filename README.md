# agent-service-interop

A public interoperability experiment between **AI-agent protocols** and **real-world service-business systems**.

## Research question

> Can one existing service-business workflow be exposed through multiple agent-facing protocols without replacing the operational system the business already uses?

This repository starts with a residential plumbing workflow and treats existing protocols and standards as inputs, not competitors to reinvent.

## What this repository is testing

The first experiment asks whether one canonical operational model can sit between:

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

Experimental schemas in this repository describe **translation boundaries** for a falsifiable implementation. They are not standards proposals.

## Tier 1: evidence backbone

The first milestone is research-first rather than code-first:

1. document the prior art and current protocol boundaries;
2. define a crosswalk from protocol concepts to one canonical plumbing workflow;
3. define the smallest canonical operational model needed for the experiment;
4. publish realistic fixtures and explicit falsification criteria;
5. only then implement adapters.

See:

- [`research/prior-art.md`](research/prior-art.md)
- [`crosswalk/protocol-capabilities.md`](crosswalk/protocol-capabilities.md)
- [`docs/experiment.md`](docs/experiment.md)
- [`schemas/service-workflow.schema.json`](schemas/service-workflow.schema.json)
- [`fixtures/plumbing/workflow.example.json`](fixtures/plumbing/workflow.example.json)

## Current protocol assumptions

These are version-sensitive and must be rechecked before implementation:

- **AIP v0.1.0** exposes `/.well-known/agent-intake.json` and a Discover -> Submit -> Offer -> Review -> Bind lifecycle.
- **UCP** uses `/.well-known/ucp` to advertise UCP services/capabilities/payment handlers. In UCP, a *Service* is an API surface/vertical concept; it must not be confused with a plumber's commercial service offering.
- **UCP namespace authority rules have changed across versions.** This repository records the version/date when relying on `schema` or `spec` authority behavior.
- **MCP Tasks** address durable/asynchronous tool-operation mechanics, not the business meaning of physical-service completion.
- **Agent2Agent (A2A)** is a distinct protocol from Agentic Commerce Protocol (ACP).

## Pass condition

The first experiment passes only if one plumbing workflow can be represented once, surfaced through AIP plus one independently justified second surface, and round-tripped back into the existing operational workflow without requiring the business to replace that workflow.

## Failure is useful

The thesis should be revised if any of these occur:

- existing protocols already provide the needed deployment integration cleanly;
- canonical normalization loses decision-critical business semantics;
- adapter burden is comparable to replacing the workflow;
- independent agent surfaces cannot consume the same underlying state without protocol-specific forks;
- real business systems do not expose enough operational state to support the translation.

## Status

**Experimental / research.** No protocol standing, no production guarantees, no claim of interoperability beyond checked fixtures and future test runs.

## License

Apache-2.0.
