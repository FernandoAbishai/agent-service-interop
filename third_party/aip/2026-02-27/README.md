# Vendored AIP schemas

This directory contains the four JSON Schemas used by the executable AIP reference adapter, pinned to the Agent Intake Protocol snapshot dated **2026-02-27** and protocol version **0.1.0**.

Upstream source: `agent-intake-protocol/agent-intake-protocol`, directory `spec/2026-02-27/`.

Vendored files:

- `agent-intake.schema.json`
- `intake-request.schema.json`
- `offer-response.schema.json`
- `bind-request.schema.json`

These files are vendored so CI validates the same upstream contracts on every run instead of depending on mutable network content. They remain under the upstream MIT license reproduced in this directory.

The adapter-local Bind response is intentionally **not** validated here because AIP v0.1.0 provides a bind-request schema but no normative bind-response schema.
