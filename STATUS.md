# Project status

_Last updated: 2026-09-07_

## Current stage

**Experimental interoperability + pre-specification protocol-design testbed through TH-INTEROP-21 replay/write-safety gate**

Strategic direction: use evidence from this testbed to converge toward a preferably universal, authority-aware TriHerm protocol for agent-to-business/economic coordination. No production interoperability, protocol-certification, stability, or universality claims are made today.

## What exists

- [x] Apache-2.0 license
- [x] Evidence-first README
- [x] Prior-art map
- [x] Protocol/workflow crosswalk
- [x] Experimental canonical workflow schema
- [x] Residential-plumbing fixture
- [x] Falsifiable experiment design
- [x] Executable AIP v0.1.0 manifest/intake/offer/bind reference adapter
- [x] Privacy-minimized AIP `intake_data` -> PII handoff at Bind for the tested fixture
- [x] File-backed FSM adapter
- [x] AIP -> FSM -> canonical round-trip tests
- [x] Automatic validation against pinned upstream AIP JSON Schemas where normative schemas exist
- [x] Architecture direction: normalized canonical interoperability state without operational authority
- [x] A2A v1.0 Agent Card + HTTP+JSON provider-agent surface via official JS SDK
- [x] AIP-created workflow exposed through A2A without protocol-specific quote/job copies
- [x] A2A Task identity/state kept separate from FSM Job identity/state
- [x] ServiceTitan-shaped read-only observation fixture
- [x] One Job -> many Appointment identity/schedule falsification test
- [x] Sold Estimate without Job relationship falsification test
- [x] Native Job completion observation without payment inference
- [x] Generic Occurrence observation vocabulary projected from ServiceTitan Appointments
- [x] Relationship gate documented without canonical schema migration
- [x] Jobber-shaped Visit -> Occurrence projection with nullable schedule
- [x] Read-only paginated Jobber GraphQL observation boundary
- [x] Deterministic synthetic Jobber contract tests with no credentials
- [x] Opt-in live Jobber contract test
- [x] Live Jobber test-account run with a temporary authorized token
- [x] Sanitized live Jobber response shape captured as evidence fixture
- [x] GitHub Actions test workflow
- [x] HTTP/OpenAPI read-only workflow-inspection surface shared with A2A
- [x] Fixed public synthetic x402 inspection boundary with buyer-unselectable workflow ID
- [x] Deterministic x402 resource tests with no funded wallet or secret
- [x] Opt-in Circle Gateway live-test harness
- [x] Explicit contract/version-status document separating upstream, experimental and historical artifacts
- [x] Runtime AIP intake/Bind schema gate against the vendored 2026-02-27 contracts before local adapter constraints
- [x] Protocol-neutral workflow correlation stored separately from the operational FSM
- [x] AIP session/offer IDs retained as protocol refs rather than shared workflow identity
- [x] Operational requirement/quote/job IDs retained as operational refs
- [x] Synthetic non-AIP operational origin exposed through the same A2A/HTTP inspection boundary
- [x] `WorkflowInspection v0.3` reduced to references plus source-backed optional facets
- [x] Canonical fixture/runtime projection validation against `service-workflow.schema.json`
- [ ] OpenAPI contract/runtime validation
- [x] Synthetic AIP intake/Bind replay conflicts and exact-retry semantics
- [x] Cross-process serialized + atomic file-backed FSM/correlation/replay writes
- [x] Explicit pre-specification TriHerm protocol thesis and universality/evidence guardrails
- [x] Minimal TriHerm protocol kernel `0.1.0-experimental` JSON envelope + conformance fixtures/tests, with economic semantics kept profile-owned/deferred
- [ ] External-system write preconditions/reconciliation semantics
- [ ] Real ServiceTitan/API adapter
- [ ] Multi-system authority/provenance test against two live systems
- [ ] Completion/evidence interoperability tests
- [ ] Settlement adapter experiment
- [ ] Agave adapter-substrate experiment

## Claim status

| Claim | Status |
|---|---|
| Quoting is a new primitive | Rejected |
| Agent-facing service intake is absent | Rejected; AIP is direct prior art |
| Evidence-conditioned settlement is empty territory | Rejected |
| TriHerm should deliberately pursue a coordination protocol | Strategic objective; now explicit in the protocol thesis |
| A TriHerm protocol is already required by evidence or proven universal | Not supported; necessity and universality remain falsification targets |
| Canonical state should be the operational source of truth | Rejected as the current architecture direction |
| AIP can be projected onto the current synthetic plumbing FSM without replacing it | Supported by executable tests |
| Bind proves external authorization/delegation | Not supported; current adapter checks declared Bind scope + same agent ID only |
| AIP fixtures/generated artifacts used by conformance tests match pinned upstream normative schemas | Supported for manifest/intake/offer/bind request examples; runtime intake/Bind requests are checked against the same pinned schemas before local constraints |
| One canonical representation can support two independent agent-facing views | Initial support: AIP + A2A over one synthetic workflow |
| A2A Task state can remain distinct from physical Job state | Supported by executable test: Task completed while Job remains scheduled |
| A single `job.scheduled_for` can faithfully represent ServiceTitan-shaped scheduling | Falsified by fixture: one Job has multiple Appointments with independent windows |
| Every sold Estimate must already have a Job relationship | Falsified by fixture |
| Provider completion must be inferred from payment/invoice state | Rejected for ServiceTitan-shaped observation; native Job status/completed timestamp are preserved |
| A distinct work-occurrence observation is justified | Supported by ServiceTitan Appointment mapping plus deterministic and live Jobber Visit mapping |
| An unscheduled occurrence requires invented timing | Rejected by the live Jobber API: an `UNSCHEDULED` Visit returned null `startAt` and `endAt` |
| Visit completion implies parent Job completion | Rejected by the live Jobber API: one Visit was `COMPLETED` while the parent Job remained `upcoming` |
| A universal normalized occurrence lifecycle enum is justified | Not supported; ServiceTitan and Jobber source-native statuses remain verbatim |
| `clientConfirmed` can be promoted to customer economic acceptance | Rejected for this experiment; it remains source-native Visit data |
| `accepted_as`, `offered_via`, and `converted_from` are stable canonical relationships | Not yet supported as a package; documented as candidates/deferred semantics only |
| One useful normalized core can survive multiple operational systems | Supported at the observation layer by ServiceTitan-shaped Appointment and live Jobber Visit mappings; canonical-schema promotion remains withheld |
| Existing real business workflows can remain authoritative while becoming agent-accessible | Supported for the current read-only Jobber path; production mutation authority remains untested |
| Reusing one AIP session with changed state-affecting intake may silently return the old offer | Rejected; synthetic adapter now returns `409 IDEMPOTENCY_CONFLICT` and preserves the original state |
| Replaying a successful Bind may reschedule/overwrite the synthetic job | Rejected; exact replay returns the first persisted result and changed Bind returns 409 |
| Local file-backed writers can safely race without serialization | Rejected; file-backed mutation paths are now cross-process serialized and atomically replaced |
| Shared workflow correlation can be independent from AIP identity | Initial support: correlation is interop-owned, AIP refs are protocol-specific, and a synthetic non-AIP origin traverses the same inspection path; second live origin remains untested |
| `WorkflowInspection` requires quote/completion/customer-decision semantics for every source | Rejected; v0.3 keeps facets optional and source-backed |
| x402 payment for the public inspection resource equals payment/authorization for plumbing work | Rejected; payment is scoped to the digital inspection resource only |
| Adapter/interoperability infrastructure is a meaningful deployment wedge | Working hypothesis, not a fact |

## Authority model

The canonical model is treated as a **normalized interoperability representation**, not as the authoritative operational database.

This authority model is also a protocol-design constraint: a future TriHerm protocol may coordinate or reference authoritative state, but protocol participation alone must not silently transfer operational authority into the interoperability layer.

For writes:

```text
protocol / agent
  -> intent or command
  -> authoritative-system adapter
  -> operational system executes
  -> confirmed result
  -> canonical representation updates
```

For reads:

```text
operational system
  -> adapter
  -> normalized interoperability representation
  -> protocol projection
```

The Jobber work in this stage is read-only. Jobber remains authoritative for its Job and Visit state; the adapter preserves Jobber IDs/statuses before projecting only the already-earned Occurrence fields.

## Current implementation boundary

### AIP

Pinned to **AIP v0.1.0 / 2026-02-27**. The conformance suite checks the generated manifest and offer plus committed intake/bind-request examples against vendored upstream JSON Schemas from that snapshot. Runtime intake and Bind requests pass through those pinned schemas before the adapter applies its narrower fixture/business constraints. The adapter-local bind response remains outside normative AIP schema coverage.

### A2A

Uses **A2A Protocol v1.0** through official `@a2a-js/sdk@1.0.1`, with one HTTP+JSON interface and one read-only `inspect_service_workflow` skill.

### TH-INTEROP-20 neutral correlation

`workflow_id` is now a repository-local interoperability correlation identifier stored outside the operational file-FSM state. A correlation record contains only `operational_refs` and `protocol_refs`; it does not carry authoritative workflow status, customer PII, authorization, or ownership semantics.

The shared `WorkflowInspection v0.3` contract requires only correlation/reference structure and permits source-backed facets to be absent. The current file-FSM observer supplies quote/job state because those fields actually exist in the source. A separate synthetic provider-native test supplies only a job facet and no AIP refs, proving the A2A/HTTP projection does not structurally depend on AIP or invented missing semantics.

Historical `wf-{aip_session_id}` lookups remain read-only compatibility for pre-TH-INTEROP-20 file state. New correlation records do not use that identity rule.

### ServiceTitan-shaped second system

The current ServiceTitan work is a fixture-backed observation boundary, not a live ServiceTitan integration. It preserves Job, Appointment and Estimate identities/statuses, one-to-many Appointment schedules, and native Job completion basis.

### Occurrence architecture gate

The observation layer has one small cross-system vocabulary:

- source system;
- source object type and ID;
- source-native status;
- observation timestamp;
- explicit parent reference;
- nullable independent schedule/arrival windows.

ServiceTitan Appointment and Jobber Visit both project into this vocabulary without a normalized lifecycle enum. The live Jobber gate confirmed that a real `UNSCHEDULED` Visit can preserve null timing and that Visit completion is independent from the parent Job lifecycle. Provider completion and customer acceptance remain separate semantics.

### Jobber live gate

PR #7 adds a read-only Jobber GraphQL client and pagination-aware Job/Visit observer pinned by default to API version `2025-04-16`.

The live test-account gate passed on 2026-08-15 using a temporary authorized token and a synthetic Job containing three Visits: scheduled/incomplete, scheduled/completed, and unscheduled/incomplete. The API returned the unscheduled Visit with null `startAt`/`endAt`, preserved `UPCOMING`/`COMPLETED`/`UNSCHEDULED` source statuses, and kept the parent Job `upcoming` while one Visit was completed. The repository stores no access token or authorization material.

Deterministic CI continues to use synthetic official-shaped data only. The live contract test remains opt-in and requires a temporary test-account token plus a seeded Job ID. No token, authorization code, client secret, refresh token, or customer data belongs in the repository.

See [`docs/jobber/pr7-live-contract.md`](docs/jobber/pr7-live-contract.md).

### TH-INTEROP-18 / TH-INTEROP-19 inspection and x402 boundary

The repository also exposes one shared read-only `WorkflowInspection` through A2A and HTTP, plus a separate x402-protected route for one server-configured synthetic/public workflow. The paid caller cannot supply a workflow ID. Payment-layer identity and settlement metadata are deliberately not promoted into workflow/customer/authorization semantics.

The Circle Gateway check is opt-in and externally funded. Deterministic CI uses an injected test gate and does not spend funds or require secrets.

See `openapi.yaml`, `research/th-interop-19-x402-public-resource-boundary.md`, and `research/th-interop-19-circle-live-gate.md`.

## Next gate

PR #21 establishes the protocol thesis, and the subsequent kernel gate adds only a structural `0.1.0-experimental` envelope. Neither promotes `Occurrence` or other economic candidates into normative protocol semantics merely because they appear in the thesis or can be carried in a profile-owned payload.

The observation vocabulary has now earned stronger evidence: one ServiceTitan-shaped operational model and one real Jobber API model map into it without invented lifecycle, schedule, completion, or customer-acceptance semantics. The next architectural decision is whether that is sufficient for canonical-schema promotion or whether a second live operational source should be required first.

The accidental AIP-origin dependency in shared correlation/inspection has now been removed at the synthetic architecture level, and the synthetic AIP/file writer has bounded replay/concurrency hardening. The minimal **protocol kernel v0.1-experimental** covers only envelope/profile versioning, envelope-local actors, typed references/correlation, authority attribution, provenance, capabilities/extensions, and profile-owned payload. TH-INTEROP-23 now falsifies the first economic interaction boundary: the thin request -> offer-response relation survives AIP and UBL, while rich quote money/terms and generic Commitment do not. The stronger operational falsifier remains a second live origin using the same separation without invented facets.

After that, test another live connectivity path while preserving Jobber as the control condition: either a direct second operational API or an integration substrate such as Agave. The question is whether outsourced connectivity preserves source identity, authority, provenance, occurrence boundaries, and native state well enough that TriHerm does not need to build every adapter directly.

Next, resolve the exact canonical money representation before rich quote/payment/UBL/UCP mappings, then test the earned thin OfferResponseObservation against an authoritative operational quote/estimate source. Commitment remains deferred until two authoritative real transitions prove a common invariant more precise than acceptance.

No public stable namespace or normative TriHerm capability should be frozen merely from the thesis. Candidate protocol semantics must continue to survive implementation and falsification before they are promoted into a versioned contract.
