# Prior art and protocol boundaries

_Last checked: 2026-08-14. This file is a research map, not a standards-status claim. Recheck primary sources before relying on any version-sensitive statement._

## Why this file exists

The project does not start from the assumption that agent-service commerce needs a new protocol. The first job is to identify what already exists and where the deployment boundary remains.

| Project / standard | What it contributes | What this project should reuse | Boundary relevant to this experiment |
|---|---|---|---|
| Agent Intake Protocol (AIP) v0.1.0 | Agent-facing discovery, structured intake, offer/review/bind lifecycle | Discovery/intake/offer semantics and manifest shape | Does not by itself prove integration with a real field-service operating system |
| Universal Commerce Protocol (UCP) | Commerce services, capabilities, payment handlers, discovery profile | Commerce vocabulary and compatible surfaces where semantically appropriate | UCP `Service` is an API-surface concept, not a generic list of a plumber's commercial services |
| OASIS UBL 2.1 | Mature procurement documents including RFQ and Quotation | Quotation semantics, validity periods, procurement prior art | Enterprise document semantics need adaptation for agent-facing long-tail workflows |
| MCP | Tool/resource protocol; Tasks for durable/asynchronous operations | Tool execution and async-operation mechanics | Does not define the economic semantics of whether physical work was satisfactorily completed |
| Agent2Agent (A2A) | Agent-to-agent communication and Agent Cards | Future cross-agent surface | Not the same protocol as ACP; this project should avoid conflating transport/governance with service-commerce semantics |
| AP2 | Delegated payment/authorization patterns | Future authorization/settlement adapter concepts | Not the operational system where service work is executed |
| ERC-8183 | Draft agentic-commerce job/escrow/evaluator pattern | Prior art for job, evaluator, completion/rejection and release | Draft status; does not establish the long-tail field-service deployment path |
| RAILS | Research architecture for obligation/evidence/clearing | Prior art for evidence-conditioned clearing | Research prior art rather than proof of broad deployment into SMB field-service systems |
| TessPay | Research architecture for verify-then-pay agentic commerce | Prior art for verification and heterogeneous settlement adapters | Same deployment question remains for physical-service operational systems |
| VCAP | Individual Internet-Draft for verified commerce | Prior art for service agreement, proof bundle, verification and settlement | Individual I-D; status must not be overstated |

## Primary sources

- AIP whitepaper: https://agent-intake-protocol.github.io/agent-intake-protocol/whitepaper.html
- UCP specification: https://ucp.dev/
- UBL 2.1: https://docs.oasis-open.org/ubl/UBL-2.1.html
- MCP specification: https://modelcontextprotocol.io/
- A2A repository/specification: https://github.com/a2aproject/A2A
- AP2: https://ap2.org/
- ERC-8183: https://eips.ethereum.org/EIPS/eip-8183
- RAILS: https://arxiv.org/abs/2606.08790
- TessPay: https://arxiv.org/abs/2602.00213
- VCAP: https://datatracker.ietf.org/doc/draft-stone-vcap/

## Important corrections inherited from the research audit

### Quoting is not novel

UBL and cXML already provide substantial RFQ/quotation prior art. The question here is not whether a `Quote` object exists; it is whether existing business-system state can be exposed to multiple agent-facing protocols through a stable translation layer.

### Evidence-conditioned settlement is not empty territory

ERC-8183, RAILS, TessPay, VCAP and adjacent proposals cover different parts of jobs, evidence, verification, acceptance and settlement. This project must therefore avoid introducing an "evidence envelope" as if the concept were new.

### AIP substantially overlaps service intake

AIP already provides a concrete agent-facing discovery/intake/offer/bind lifecycle. The useful experiment is to test whether an adapter can make that lifecycle available to a business that did not implement AIP itself.

### UCP terminology must remain precise

UCP `Service` refers to a protocol/API surface. A business's commercial offering (for example, leak diagnosis or water-heater replacement) is a different concept and must be represented only through semantics that the relevant UCP version actually supports.

### Versioned UCP namespace authority behavior

Do not encode a timeless rule from one UCP release. Record the exact UCP version/date used by any fixture. In the stable 2026-04-08 specification, both `spec` and `schema` authority behavior was stricter; the current draft changes the treatment of `spec` while retaining authority constraints around `schema`. Fixtures must state the target version.

## Current working hypothesis

> Protocol primitives are increasingly available. The harder deployment problem may be translating between those protocols and the fragmented operational systems where real-world service work is actually run.

This is a hypothesis to falsify, not a repository tagline to treat as proven fact.
