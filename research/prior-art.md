# Prior art and protocol boundaries

_Last checked: 2026-09-07. This file is a research map, not a standards-status claim. Recheck primary sources before relying on any version-sensitive statement._

## Why this file exists

The project now has an explicit strategic objective to pursue a preferably universal TriHerm coordination protocol. That does **not** change the prior-art discipline: the first job for every candidate primitive is still to identify what already exists, reuse it where it fits, and isolate only the coordination boundary that existing protocols and operational systems do not solve together.

| Project / standard | What it contributes | What this project should reuse | Boundary relevant to this experiment |
|---|---|---|---|
| Agent Intake Protocol (AIP) v0.1.0 | Agent-facing discovery, structured intake, offer/review/bind lifecycle | Discovery/intake/offer semantics and manifest shape | Does not by itself prove integration with a real field-service operating system |
| Universal Commerce Protocol (UCP) v2026-08-25 | Commerce services/capabilities including shopping checkout and order, payment handlers, discovery profile | Commerce vocabulary and compatible surfaces where semantically appropriate | Capability-specific checkout/order semantics do not prove a generic cross-vertical Commitment lifecycle |
| OASIS UBL 2.5 CS01; TH-INTEROP-23 pinned to 2.4 | Mature procurement documents including RFQ, Quotation, Order and Order Response | Quotation and ordering semantics, procurement prior art | 2.5 supersedes 2.4 as the newer work product, but the experiment remains explicitly 2.4-shaped; Ordering obligation semantics must not be conflated with AIP Bind, booking, payment, or provider work authorization |
| MCP 2026-07-28 + Tasks extension | Tool/resource protocol; extension-based durable/asynchronous operations | Tool execution and async-operation mechanics | Tasks moved from the 2025-11-25 experimental core into `io.modelcontextprotocol/tasks`; neither location defines satisfactory physical-service completion |
| Agent2Agent (A2A) 1.0.0 | Agent-to-agent communication and Agent Cards | Future cross-agent surface | Not the same protocol as ACP; this project should avoid conflating transport/governance with service-commerce semantics |
| AP2 | Delegated payment/authorization patterns | Future authorization/settlement adapter concepts | Not the operational system where service work is executed |
| ERC-8183 | Draft agentic-commerce job/escrow/evaluator pattern | Prior art for job, evaluator, completion/rejection and release | Draft status; does not establish the long-tail field-service deployment path |
| RAILS | Research architecture for obligation/evidence/clearing | Prior art for evidence-conditioned clearing | Research prior art rather than proof of broad deployment into SMB field-service systems |
| TessPay | Research architecture for verify-then-pay agentic commerce | Prior art for verification and heterogeneous settlement adapters | Same deployment question remains for physical-service operational systems |
| VCAP | Individual Internet-Draft for verified commerce | Prior art for service agreement, proof bundle, verification and settlement | Individual I-D; status must not be overstated |

## Primary sources

- AIP whitepaper: https://agent-intake-protocol.github.io/agent-intake-protocol/whitepaper.html
- UCP v2026-08-25 specification: https://ucp.dev/2026-08-25/specification/overview/
- UCP v2026-08-25 Order capability: https://ucp.dev/2026-08-25/specification/shopping/order/
- UBL 2.5 latest-stage work product: https://docs.oasis-open.org/ubl/UBL-2.5.html
- UBL 2.4 experiment source: https://docs.oasis-open.org/ubl/UBL-2.4.html
- MCP 2026-07-28 release: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP Tasks extension: https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks
- A2A 1.0.0 specification: https://a2a-protocol.org/dev/specification/
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

### Versioned UCP behavior

Do not encode a timeless rule from one UCP release. Record the exact UCP version/date used by any fixture or crosswalk. The current released version observed for this gate is `2026-08-25`; current documentation continues to use reverse-domain capability/service identifiers and capability-specific checkout/order semantics. Future releases may change governance or capability details, so TriHerm must not copy those mechanics into an unversioned kernel rule.

### Versioned UBL/MCP behavior

Do not silently upgrade historical falsifier evidence. TH-INTEROP-23 remains pinned to UBL 2.4 even though OASIS now publishes UBL 2.5 Committee Specification 01 as the newer work product. Likewise, MCP Tasks should now be discussed as the 2026-07-28 `io.modelcontextprotocol/tasks` extension rather than the older 2025-11-25 experimental-core API.

## Current working hypothesis

> Protocol primitives are increasingly available. A useful TriHerm protocol may therefore need to standardize the smallest authority-aware coordination boundary **between** those protocols and the fragmented operational systems where real-world economic activity is executed, rather than duplicate existing discovery, messaging, procurement, or payment protocols.

This remains a hypothesis to falsify. The strategic goal is to pursue the protocol; the existence, exact size, and universality of its kernel are not treated as proven facts.
